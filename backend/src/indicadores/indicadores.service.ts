import { Injectable } from '@nestjs/common';
import { VendaDiaria } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConfigIndicador,
  META_CANCELAMENTO,
  META_DEVOLUCOES,
  META_RECARGAS,
  META_TROCO_SOLIDARIO,
  Periodo,
  RankingItem,
  StatusCor,
  acumular,
  inicioDaSemana,
  inicioDoDia,
  inicioDoMes,
  percentual,
  ranking,
  statusCor,
  vendaValida,
} from './indicadores.domain';
import { ValorVendaInvalidoError } from './indicadores.errors';

/** Tipo de registro operacional vinculado a operadores. */
type TipoRegistroOperador = 'CANCELAMENTO' | 'TROCO' | 'RECARGA';

/**
 * Intervalo de datas (inclusivo) usado nas consultas de ranking por período.
 */
export interface IntervaloDatas {
  inicio: Date;
  fim: Date;
}

/**
 * Serviço do Modulo_Indicadores: Painel de Vendas (Req 2.1), cálculo do
 * indicador percentual e classificação de cor (Req 2.2–2.5) e rankings de
 * operadores/fiscais (Req 2.2.6, 2.3.6, 2.4.6, 2.5.6).
 *
 * A lógica de decisão/cálculo é delegada a funções puras
 * (`indicadores.domain`); este serviço cuida apenas dos efeitos colaterais
 * (consultas e escritas via Prisma).
 */
@Injectable()
export class IndicadoresService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra (ou substitui) o valor de vendas de um dia (Req 2.1.1). Rejeita
   * valores negativos lançando `ValorVendaInvalidoError` (Req 2.1.4). Os
   * acumulados são derivados por agregação, portanto basta persistir o valor
   * do dia.
   */
  async registrarVenda(data: Date, valor: number): Promise<VendaDiaria> {
    if (!vendaValida(valor)) {
      throw new ValorVendaInvalidoError(valor);
    }
    const dia = inicioDoDia(data);
    return this.prisma.vendaDiaria.upsert({
      where: { data: dia },
      create: { data: dia, valor },
      update: { valor },
    });
  }

  /**
   * Altera o valor de vendas já informado para um dia (Req 2.1.5). Como os
   * acumulados são recalculados por agregação a cada consulta, basta atualizar
   * o valor do dia. Rejeita valores negativos (Req 2.1.4).
   */
  async alterarVenda(data: Date, novoValor: number): Promise<VendaDiaria> {
    if (!vendaValida(novoValor)) {
      throw new ValorVendaInvalidoError(novoValor);
    }
    const dia = inicioDoDia(data);
    return this.prisma.vendaDiaria.update({
      where: { data: dia },
      data: { valor: novoValor },
    });
  }

  /**
   * Retorna o total de vendas acumulado do período (dia/semana/mês) que contém
   * a data de referência (Req 2.1.2, 2.1.3), recalculado do zero por agregação
   * das vendas do período.
   */
  async acumulado(data: Date, periodo: Periodo): Promise<number> {
    const { inicio, fim } = this.limitesDoPeriodo(data, periodo);
    const vendas = await this.prisma.vendaDiaria.findMany({
      where: { data: { gte: inicio, lte: fim } },
      select: { data: true, valor: true },
    });
    return acumular(
      vendas.map((v) => ({ data: v.data, valor: Number(v.valor) })),
      data,
      periodo,
    );
  }

  /** Limites [início, fim] do período (dia/semana/mês) que contém a data. */
  private limitesDoPeriodo(
    data: Date,
    periodo: Periodo,
  ): { inicio: Date; fim: Date } {
    const dia = 24 * 60 * 60 * 1000;
    if (periodo === 'DIA') {
      const inicio = inicioDoDia(data);
      return { inicio, fim: new Date(inicio.getTime() + dia - 1) };
    }
    if (periodo === 'SEMANA') {
      const inicio = inicioDaSemana(data);
      return { inicio, fim: new Date(inicio.getTime() + 7 * dia - 1) };
    }
    const inicio = inicioDoMes(data);
    const fim = new Date(
      Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + 1, 1) - 1,
    );
    return { inicio, fim };
  }

  /**
   * Calcula o indicador percentual (Req 2.2.1, 2.3.1). Delega à função pura
   * `percentual`.
   */
  percentual(totalIndicador: number, totalVendas: number): number {
    return percentual(totalIndicador, totalVendas);
  }

  /**
   * Classifica a cor de um indicador conforme o sentido da meta (Req 2.2–2.5).
   * Delega à função pura `statusCor`.
   */
  statusCor(valor: number, config: ConfigIndicador): StatusCor {
    return statusCor(valor, config);
  }

  /**
   * Constrói a configuração padrão de um indicador a partir das metas oficiais
   * (Req 2.2.2, 2.3.2, 2.4.2, 2.5.2), com limite amarelo configurável.
   */
  configPadrao(
    indicador: 'CANCELAMENTO' | 'DEVOLUCOES' | 'TROCO' | 'RECARGAS',
    limiteAmarelo: number,
  ): ConfigIndicador {
    switch (indicador) {
      case 'CANCELAMENTO':
        return {
          meta: META_CANCELAMENTO,
          limiteAmarelo,
          sentido: 'MENOR_MELHOR',
        };
      case 'DEVOLUCOES':
        return {
          meta: META_DEVOLUCOES,
          limiteAmarelo,
          sentido: 'MENOR_MELHOR',
        };
      case 'TROCO':
        return {
          meta: META_TROCO_SOLIDARIO,
          limiteAmarelo,
          sentido: 'MAIOR_MELHOR',
        };
      case 'RECARGAS':
        return { meta: META_RECARGAS, limiteAmarelo, sentido: 'MAIOR_MELHOR' };
    }
  }

  /** Agrega os totais por pessoa de um tipo de registro num intervalo. */
  private async totaisPorPessoa(
    tipo: 'CANCELAMENTO' | 'TROCO' | 'RECARGA' | 'DEVOLUCAO',
    intervalo: IntervaloDatas,
    campoPessoa: 'operadorId' | 'fiscalId',
  ): Promise<RankingItem[]> {
    const registros = await this.prisma.registroOperacional.findMany({
      where: {
        tipo,
        data: { gte: intervalo.inicio, lte: intervalo.fim },
      },
      select: { operadorId: true, fiscalId: true, valor: true },
    });

    const totais = new Map<string, number>();
    for (const r of registros) {
      const pessoaId = r[campoPessoa];
      if (!pessoaId) {
        continue;
      }
      totais.set(pessoaId, (totais.get(pessoaId) ?? 0) + Number(r.valor));
    }

    return ranking(
      Array.from(totais.entries()).map(([pessoaId, total]) => ({
        pessoaId,
        total,
      })),
    );
  }

  /**
   * Ranking de operadores ordenado de forma decrescente pelo valor do tipo de
   * registro (cancelamento, troco ou recarga) no período (Req 2.2.6, 2.4.6,
   * 2.5.6).
   */
  async rankingOperadores(
    tipo: TipoRegistroOperador,
    intervalo: IntervaloDatas,
  ): Promise<RankingItem[]> {
    return this.totaisPorPessoa(tipo, intervalo, 'operadorId');
  }

  /**
   * Ranking de fiscais ordenado de forma decrescente pelo valor de devoluções
   * no período (Req 2.3.6).
   */
  async rankingFiscais(intervalo: IntervaloDatas): Promise<RankingItem[]> {
    return this.totaisPorPessoa('DEVOLUCAO', intervalo, 'fiscalId');
  }
}
