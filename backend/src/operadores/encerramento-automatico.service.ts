import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { diaCivilBrasilia } from '../common/datas';
import {
  DIAS_ENCERRAMENTO_AUTOMATICO,
  corteEncerramentoAutomatico,
} from '../common/justificativas';
import {
  ResultadoEncerramento,
  encerrarPendencias,
} from '../common/encerrar-pendencias';

const FUSO = 'America/Sao_Paulo';
const UM_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Encerramento automático das pendências de escala (faltas e não-retornos de
 * intervalo).
 *
 * O gestor não precisa mais decidir uma por uma: a ocorrência que fica
 * `DIAS_ENCERRAMENTO_AUTOMATICO` dias PENDENTE é encerrada pelo sistema como
 * "não justificada" e sai da lista. Nada muda no score (PENDENTE e
 * INJUSTIFICADA já pesam igual) nem no débito de horas, que continua sendo
 * decisão do gestor na Central de Jornada. Enquanto o ciclo de folha estiver
 * aberto, ela pode ser reaberta ou justificada normalmente.
 */
@Injectable()
export class EncerramentoAutomaticoService {
  private readonly logger = new Logger(EncerramentoAutomaticoService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

  /** CRON (03:00 Brasília): encerra o que passou do prazo. Nunca derruba o processo. */
  @Cron('0 3 * * *', { timeZone: FUSO })
  async encerrarDiario(): Promise<void> {
    try {
      const r = await this.encerrar(diaCivilBrasilia());
      if (r.faltas + r.naoRetornos > 0) {
        this.logger.log(
          `Encerradas automaticamente: ${r.faltas} falta(s) e ${r.naoRetornos} não-retorno(s).`,
        );
      }
    } catch (erro) {
      this.logger.warn(`Falha no encerramento automático: ${String(erro)}`);
    }
  }

  /** CRON (08:00 Brasília): avisa quantas pendências encerram amanhã. */
  @Cron('0 8 * * *', { timeZone: FUSO })
  async avisarDiario(): Promise<void> {
    try {
      await this.avisarVesperas(diaCivilBrasilia());
    } catch (erro) {
      this.logger.warn(`Falha no aviso de encerramento: ${String(erro)}`);
    }
  }

  /**
   * Encerra as pendências com `data` antes do corte de `hoje`, fora dos ciclos
   * de folha já fechados (são história: o fechamento do ciclo já encerrou as
   * dele).
   */
  async encerrar(hoje: Date): Promise<ResultadoEncerramento> {
    return encerrarPendencias(this.prisma, {
      ate: corteEncerramentoAutomatico(hoje),
      excluir: await this.ciclosFechados(),
    });
  }

  /**
   * Um único aviso por dia, à gestão: quantas pendências serão encerradas na
   * próxima madrugada. Sem aviso quando não há nenhuma. Devolve o total.
   */
  async avisarVesperas(hoje: Date): Promise<number> {
    // Encerram amanhã as que estão entre o corte de amanhã e o de hoje.
    const ate = corteEncerramentoAutomatico(
      new Date(hoje.getTime() + UM_DIA_MS),
    );
    const desde = corteEncerramentoAutomatico(hoje);
    const fechados = await this.ciclosFechados();
    const fora = fechados.map((c) => ({
      data: { gte: c.inicio, lt: c.fimExclusivo },
    }));
    const naoFechado = fora.length > 0 ? { NOT: { OR: fora } } : {};
    const data = { gte: desde, lt: ate };
    const [faltas, naoRetornos] = await Promise.all([
      this.prisma.ausencia.count({
        where: { statusJustificativa: 'PENDENTE', data, ...naoFechado },
      }),
      this.prisma.incidenciaEscala.count({
        where: {
          tipo: 'NAO_RETORNO_INTERVALO',
          statusJustificativa: 'PENDENTE',
          data,
          ...naoFechado,
        },
      }),
    ]);
    const total = faltas + naoRetornos;
    if (total > 0 && this.notificacoes) {
      try {
        await this.notificacoes.notificarComPermissao('OPERADORES_AUSENCIAS', {
          titulo: '⏳ Pendências encerram amanhã',
          mensagem:
            `${total} ocorrência(s) da escala (${faltas} falta(s), ${naoRetornos} não-retorno(s)) ` +
            `estão há ${DIAS_ENCERRAMENTO_AUTOMATICO - 1} dias sem análise e serão encerradas ` +
            `amanhã como não justificadas. Justifique agora as que tiverem motivo.`,
        });
      } catch {
        // best-effort: o aviso nunca impede o encerramento.
      }
    }
    return total;
  }

  /** Ciclos de folha fechados (intervalos que o encerramento não toca). */
  private async ciclosFechados(): Promise<
    { inicio: Date; fimExclusivo: Date }[]
  > {
    return this.prisma.cicloFolha.findMany({
      where: { status: 'FECHADO' },
      select: { inicio: true, fimExclusivo: true },
    });
  }
}
