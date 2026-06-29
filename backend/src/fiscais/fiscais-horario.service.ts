import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { inicioDoDia } from '../common/datas';

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

    // Buscar escalas do dia atual (apenas quem não está de folga).
    const escalas = await this.prisma.escalaEntry.findMany({
      where: { diaSemana, folga: false, entrada: { not: null } },
    });

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

      // Buscar o usuário do fiscal para enviar a notificação.
      const fiscal = await this.prisma.fiscal.findUnique({
        where: { id: escala.funcionarioId },
      });
      if (!fiscal?.usuarioId) continue;

      const usuario = await this.prisma.usuario.findUnique({
        where: { id: fiscal.usuarioId },
      });
      if (!usuario) continue;

      // Enviar notificação.
      await this.notificacoes.enviar([usuario], {
        titulo: '⏰ Hora de registrar',
        mensagem: `Sua entrada está prevista para ${escala.entrada}. Lembre-se de marcar "Disponível" ao iniciar.`,
      });

      this.lembretesEnviados.add(escala.funcionarioId);
      this.logger.log(
        `Lembrete enviado para ${fiscal.nome} (entrada ${escala.entrada}).`,
      );
    }
  }
}
