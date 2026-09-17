import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { inicioDoDia } from '../common/datas';
import { EscalaDomingoService } from '../escala-domingo/escala-domingo.service';
import { entradaEsperadaNoDia } from '../escala-domingo/escala-domingo.domain';
import { carregarFiscaisComFicha } from './turno-fiscal.consulta';

/** Um fiscal com turno hoje: quem é, a que hora entra e por qual ficha avisar. */
interface TurnoDeHoje {
  /** `Fiscal.id` — a identidade que a batida do ponto usa. */
  funcionarioId: string;
  colaboradorId: string | null;
  entrada: string;
}

/**
 * Serviço de lembretes de horário para fiscais.
 *
 * A cada minuto verifica se algum fiscal tem entrada agendada nos próximos
 * 10 minutos (baseado na escala do dia atual). Se sim, envia uma notificação
 * in-app lembrando de marcar o status.
 *
 * Não notifica fiscais que:
 * - Estão de folga hoje
 * - Já registraram ponto hoje (já iniciaram a jornada)
 * - Já receberam o lembrete hoje (evita duplicação)
 *
 * Fuso horário: America/Sao_Paulo (horário de Brasília).
 */
@Injectable()
export class FiscaisHorarioService {
  private readonly logger = new Logger(FiscaisHorarioService.name);

  /** Set de fiscalIds que já receberam lembrete hoje (reseta à meia-noite). */
  private lembretesEnviados = new Set<string>();
  private diaAtual = new Date().toDateString();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacoes: NotificacoesService,
    // Rodízio de domingo: sem a âncora não se afirma o turno de domingo.
    // Opcional para não obrigar os testes unitários a montar o grafo inteiro.
    @Optional() private readonly escalaDomingo?: EscalaDomingoService,
  ) {}

  /** Reseta os lembretes enviados a cada dia. */
  @Cron('0 0 * * *', { timeZone: 'America/Sao_Paulo' })
  resetarLembretes(): void {
    this.lembretesEnviados.clear();
    this.diaAtual = new Date().toDateString();
    this.logger.log('Lembretes de horário resetados para o novo dia.');
  }

  /** Verifica a cada minuto se algum fiscal precisa ser notificado. */
  @Cron('* * * * *', { timeZone: 'America/Sao_Paulo' })
  async verificarHorarios(): Promise<void> {
    // Reseta se mudou o dia (fallback caso o cron da meia-noite não rodou).
    const hoje = new Date().toDateString();
    if (hoje !== this.diaAtual) {
      this.lembretesEnviados.clear();
      this.diaAtual = hoje;
    }

    const agora = new Date();
    // Dia da semana em Brasília (UTC-3).
    const emBrasilia = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
    const diaSemana = emBrasilia.getUTCDay();

    // Quem tem turno hoje, pela FICHA (ADR 0026). O lembrete diz a hora a que a
    // pessoa é esperada: se ele lesse a cópia semanal enquanto a detecção de
    // falta cobra a ficha, o aviso chegaria na hora errada — e a pessoa que o
    // seguisse chegaria atrasada por obedecer ao sistema.
    const escalas = await this.turnosDeHoje(emBrasilia, diaSemana);
    if (escalas.length === 0) return;

    // Hora/minuto atual em Brasília (o cron já roda nesse fuso).
    const horaAtual = agora.getHours();
    const minAtual = agora.getMinutes();
    const minutosAgora = horaAtual * 60 + minAtual;

    for (const escala of escalas) {
      if (!escala.entrada) continue;
      if (this.lembretesEnviados.has(escala.funcionarioId)) continue;

      const [horaEntrada, minEntrada] = escala.entrada.split(':').map(Number);
      const minutosEntrada = horaEntrada * 60 + minEntrada;

      // Notificar se faltam exatamente 10 minutos (ou entre 9 e 10 para
      // cobrir a janela de 1 minuto do cron).
      const diff = minutosEntrada - minutosAgora;
      if (diff < 0 || diff > 10) continue;
      // Dentro da janela de 10 min.
      if (diff > 10) continue;

      // Verificar se já registrou ponto hoje.
      const jaRegistrou = await this.prisma.registroPontoFiscal.findFirst({
        where: {
          fiscalId: escala.funcionarioId,
          data: inicioDoDia(agora),
        },
      });
      if (jaRegistrou) {
        this.lembretesEnviados.add(escala.funcionarioId);
        continue;
      }

      // Resolve a conta pela ficha canônica (vínculo gravado na escala —
      // Fase 4 · Opção A); fallback ao registro legado de Fiscal enquanto ele
      // existir (escalas antigas sem vínculo).
      const { usuarioId, nome } = await this.contaDaEscala(escala);
      if (!usuarioId) continue;

      const usuario = await this.prisma.usuario.findUnique({
        where: { id: usuarioId },
      });
      if (!usuario) continue;

      // Enviar notificação.
      await this.notificacoes.enviar([usuario], {
        titulo: '⏰ Hora de registrar',
        mensagem: `Sua entrada está prevista para ${escala.entrada}. Lembre-se de marcar "Disponível" ao iniciar.`,
      });

      this.lembretesEnviados.add(escala.funcionarioId);
      this.logger.log(
        `Lembrete enviado para ${nome} (entrada ${escala.entrada}).`,
      );
    }
  }

  /**
   * Os turnos de hoje, tirados da FICHA de cada fiscal: quem trabalha, a que
   * horas, e por qual conta avisar.
   *
   * O feriado não entra aqui de propósito: este cron roda a cada minuto e um
   * lembrete de dez minutos não justifica consultar o calendário de feriados
   * sessenta vezes por hora. Num feriado o turno segue o horário de domingo, e
   * quem estiver nessa situação simplesmente não recebe o lembrete — deixar de
   * avisar é melhor do que avisar a hora errada.
   */
  private async turnosDeHoje(
    diaEmBrasilia: Date,
    diaSemana: number,
  ): Promise<TurnoDeHoje[]> {
    const ancora =
      diaSemana === 0 && this.escalaDomingo
        ? await this.escalaDomingo.obterAncora()
        : null;
    const diaCivil = inicioDoDia(diaEmBrasilia);

    const out: TurnoDeHoje[] = [];
    for (const f of await carregarFiscaisComFicha(this.prisma)) {
      const entrada = entradaEsperadaNoDia(
        f.ficha,
        diaCivil,
        ancora ? { data: ancora.data, ordem: ancora.ordem } : null,
      );
      if (!entrada) continue;
      out.push({
        funcionarioId: f.fiscalId,
        colaboradorId: f.colaboradorId,
        entrada,
      });
    }
    return out;
  }

  /**
   * Resolve a conta de acesso (e o nome) de um turno pela ficha canônica
   * (`colaboradorId`), com fallback ao registro legado `Fiscal` enquanto ele
   * existir. Passo A.3 do épico de aposentar o `Fiscal`.
   */
  private async contaDaEscala(escala: {
    funcionarioId: string;
    colaboradorId: string | null;
  }): Promise<{ usuarioId: string | null; nome: string }> {
    if (escala.colaboradorId) {
      const colaborador = await this.prisma.colaborador.findUnique({
        where: { id: escala.colaboradorId },
        select: { usuarioId: true, nome: true },
      });
      if (colaborador?.usuarioId) {
        return { usuarioId: colaborador.usuarioId, nome: colaborador.nome };
      }
    }
    const fiscal = await this.prisma.fiscal.findUnique({
      where: { id: escala.funcionarioId },
      select: { usuarioId: true, nome: true },
    });
    return { usuarioId: fiscal?.usuarioId ?? null, nome: fiscal?.nome ?? '' };
  }
}
