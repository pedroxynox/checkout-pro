import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/** Resumo do que a purga apagou (por entidade). */
export interface ResumoPurgaInativos {
  colaboradores: number;
  ausencias: number;
  incidencias: number;
  solicitacoesAdvertencia: number;
  decisoesContrato: number;
  pontos: number;
  escalas: number;
}

/**
 * Purga mensal dos colaboradores INATIVOS (desligados).
 *
 * Todo dia 1º do mês (00:00 Brasília), remove a ficha dos colaboradores com
 * `ativo = false` e TODO o seu histórico de RRHH (faltas, incidências/sanções,
 * solicitações de advertência, decisões de contrato, ponto e escala). Os
 * identificadores são removidos em cascata com a ficha.
 *
 * **Preserva os totais dos indicadores:** NÃO apaga `registros_arrecadacao`
 * (troco solidário, recargas, cancelamentos, devoluções) nem os movimentos do
 * lote APAE. Esses lançamentos continuam somando no total da loja — apenas
 * deixam de ser atribuídos a alguém no visual por operador (o vínculo por
 * matrícula/identificador some com a ficha).
 */
@Injectable()
export class PurgaInativosService {
  private readonly logger = new Logger(PurgaInativosService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Cron: 1º dia de cada mês, 00:00 (Brasília). Best-effort (não derruba). */
  @Cron('0 0 1 * *', { timeZone: 'America/Sao_Paulo' })
  async purgaMensal(): Promise<void> {
    try {
      const r = await this.purgarInativos();
      if (r.colaboradores > 0) {
        this.logger.log(
          `Purga mensal de inativos: ${r.colaboradores} colaborador(es) removido(s) (histórico de RRHH apagado; totais de arrecadação preservados).`,
        );
      }
    } catch (e) {
      this.logger.warn(`Falha na purga mensal de inativos: ${String(e)}`);
    }
  }

  /**
   * Apaga, numa única transação, a ficha e o histórico de RRHH de todos os
   * colaboradores inativos. Conserva `registros_arrecadacao` e
   * `movimentos_lote_apae` (totais preservados). Idempotente.
   */
  async purgarInativos(): Promise<ResumoPurgaInativos> {
    const inativos = await this.prisma.colaborador.findMany({
      where: { ativo: false },
      select: { id: true },
    });
    const ids = inativos.map((c) => c.id);
    if (ids.length === 0) {
      return {
        colaboradores: 0,
        ausencias: 0,
        incidencias: 0,
        solicitacoesAdvertencia: 0,
        decisoesContrato: 0,
        pontos: 0,
        escalas: 0,
      };
    }

    return this.prisma.$transaction(async (tx) => {
      const ausencias = await tx.ausencia.deleteMany({
        where: {
          OR: [{ pessoaId: { in: ids } }, { colaboradorId: { in: ids } }],
        },
      });
      const incidencias = await tx.incidenciaEscala.deleteMany({
        where: { colaboradorId: { in: ids } },
      });
      const solicitacoes = await tx.solicitacaoAdvertencia.deleteMany({
        where: { colaboradorId: { in: ids } },
      });
      const decisoes = await tx.decisaoContrato.deleteMany({
        where: { colaboradorId: { in: ids } },
      });
      const pontos = await tx.registroPontoFiscal.deleteMany({
        where: { colaboradorId: { in: ids } },
      });
      const escalas = await tx.escalaEntry.deleteMany({
        where: { colaboradorId: { in: ids } },
      });
      // A ficha por último (leva os identificadores em cascata). NÃO tocamos em
      // registros_arrecadacao / movimentos_lote_apae → totais preservados.
      const colaboradores = await tx.colaborador.deleteMany({
        where: { id: { in: ids } },
      });

      return {
        colaboradores: colaboradores.count,
        ausencias: ausencias.count,
        incidencias: incidencias.count,
        solicitacoesAdvertencia: solicitacoes.count,
        decisoesContrato: decisoes.count,
        pontos: pontos.count,
        escalas: escalas.count,
      };
    });
  }
}
