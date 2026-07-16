import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Perfil, Usuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { RELOGIO, Relogio } from '../common/relogio';
import { inicioDoDia } from '../common/datas';
import { montarSaudacaoDiaria } from './saudacao-diaria.domain';

/** Fuso de operação da loja. Os crons disparam no horário local de Brasília. */
const FUSO_BRASILIA = 'America/Sao_Paulo';
/** Brasília está 3h atrás do UTC (sem horário de verão desde 2019). */
const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000;
/** Um dia em milissegundos. */
const UM_DIA_MS = 24 * 60 * 60 * 1000;
/** Janela (min) após a hora de entrada em que a saudação ainda é enviada. */
const JANELA_ENTRADA_MIN = 5;

/** Resultado de vendas de ontem para a saudação. */
interface ResultadoOntem {
  vendaOntem: number;
  variacaoOntem: number | null;
}

/**
 * Saudação diária motivadora (bom dia/tarde) com o resumo do dia anterior.
 *
 * - FISCAIS: recebem na sua **hora de entrada** (escala do dia). Um cron por
 *   minuto verifica quem entra agora e ainda não foi saudado hoje.
 * - GERENTES/SUPERVISORES: recebem às **06:50**.
 *
 * A obtenção do "agora" usa um relógio injetável para testabilidade. A entrega
 * é best-effort: uma falha nunca derruba o cron.
 */
@Injectable()
export class SaudacaoDiariaService {
  private readonly logger = new Logger(SaudacaoDiariaService.name);

  /** Fiscais (funcionarioId) já saudados hoje — evita repetir na janela. */
  private saudadosFiscais = new Set<string>();
  private diaAtual = new Date().toDateString();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacoes: NotificacoesService,
    @Inject(RELOGIO) private readonly relogio: Relogio,
  ) {}

  /** Reseta o controle de "já saudado" a cada dia. */
  @Cron('0 0 * * *', { timeZone: FUSO_BRASILIA })
  resetarDiario(): void {
    this.saudadosFiscais.clear();
    this.diaAtual = new Date().toDateString();
  }

  /** A cada minuto: saúda os fiscais que entram agora (hora de entrada). */
  @Cron('* * * * *', { timeZone: FUSO_BRASILIA })
  async saudarFiscais(): Promise<void> {
    const agora = this.relogio.agora();
    // Fallback de reset caso o cron da meia-noite não tenha rodado.
    const hojeStr = agora.toDateString();
    if (hojeStr !== this.diaAtual) {
      this.saudadosFiscais.clear();
      this.diaAtual = hojeStr;
    }

    const emBrasilia = new Date(agora.getTime() - OFFSET_BRASILIA_MS);
    const diaSemana = emBrasilia.getUTCDay();
    const minutosAgora =
      emBrasilia.getUTCHours() * 60 + emBrasilia.getUTCMinutes();

    const escalas = await this.prisma.escalaEntry.findMany({
      where: { diaSemana, folga: false, entrada: { not: null } },
    });
    // Quem entra AGORA (dentro da janela) e ainda não foi saudado hoje.
    const pendentes = escalas.filter((e) => {
      if (!e.entrada || this.saudadosFiscais.has(e.funcionarioId)) return false;
      const [h, m] = e.entrada.split(':').map(Number);
      const diff = minutosAgora - (h * 60 + m);
      return diff >= 0 && diff <= JANELA_ENTRADA_MIN;
    });
    if (pendentes.length === 0) return;

    const resultado = await this.resultadoOntem(agora);
    const hora = emBrasilia.getUTCHours();

    for (const escala of pendentes) {
      // Marca cedo para não reenviar na próxima passada do cron, mesmo em erro.
      this.saudadosFiscais.add(escala.funcionarioId);
      try {
        const fiscal = await this.prisma.fiscal.findUnique({
          where: { id: escala.funcionarioId },
        });
        if (!fiscal?.usuarioId) continue;
        const usuario = await this.prisma.usuario.findUnique({
          where: { id: fiscal.usuarioId },
        });
        // Gerentes/supervisores recebem às 06:50 — aqui só fiscais.
        if (!usuario || usuario.perfil !== Perfil.FISCAL) continue;
        await this.enviarSaudacao(usuario, hora, resultado);
        this.logger.log(`Saudação de entrada enviada para ${fiscal.nome}.`);
      } catch {
        // best-effort
      }
    }
  }

  /** Às 06:50: saúda gerentes, gerentes desenvolvedores e supervisores. */
  @Cron('50 6 * * *', { timeZone: FUSO_BRASILIA })
  async saudarGestores(): Promise<void> {
    const agora = this.relogio.agora();
    const gestores = await this.prisma.usuario.findMany({
      where: {
        perfil: {
          in: [Perfil.GERENTE, Perfil.ADMINISTRADOR, Perfil.SUPERVISOR],
        },
      },
    });
    if (gestores.length === 0) return;

    const resultado = await this.resultadoOntem(agora);
    const hora = new Date(agora.getTime() - OFFSET_BRASILIA_MS).getUTCHours();

    for (const usuario of gestores) {
      try {
        await this.enviarSaudacao(usuario, hora, resultado);
      } catch {
        // best-effort
      }
    }
    this.logger.log(
      `Saudação das 06:50 enviada a ${gestores.length} gestor(es).`,
    );
  }

  /** Monta e envia a saudação para um usuário. */
  private async enviarSaudacao(
    usuario: Usuario,
    hora: number,
    resultado: ResultadoOntem,
  ): Promise<void> {
    const nomeCompleto = usuario.nome ?? usuario.login;
    const primeiroNome = nomeCompleto.trim().split(/\s+/)[0];
    const conteudo = montarSaudacaoDiaria({
      primeiroNome,
      hora,
      vendaOntem: resultado.vendaOntem,
      variacaoOntem: resultado.variacaoOntem,
    });
    await this.notificacoes.enviar([usuario], conteudo);
  }

  /**
   * Venda de ontem (R$) e variação vs. o mesmo dia da semana passada — o
   * "resultado do dia anterior" que embasa a mensagem. O dia operacional é o de
   * Brasília; as datas de venda são gravadas em meia-noite UTC dessa data.
   */
  private async resultadoOntem(agora: Date): Promise<ResultadoOntem> {
    const hojeBr = inicioDoDia(new Date(agora.getTime() - OFFSET_BRASILIA_MS));
    const ontem = new Date(hojeBr.getTime() - UM_DIA_MS);
    const ontemSemanaPassada = new Date(ontem.getTime() - 7 * UM_DIA_MS);

    const [vOntem, vAntes] = await Promise.all([
      this.vendaDoDia(ontem),
      this.vendaDoDia(ontemSemanaPassada),
    ]);
    const variacaoOntem =
      vAntes > 0 ? Math.round((vOntem / vAntes - 1) * 100) : null;
    return { vendaOntem: vOntem, variacaoOntem };
  }

  /** Total de venda de um dia (0 quando não há registro). */
  private async vendaDoDia(dia: Date): Promise<number> {
    const r = await this.prisma.vendaDiaria.findUnique({
      where: { data: inicioDoDia(dia) },
    });
    return r ? Number(r.valor) : 0;
  }
}
