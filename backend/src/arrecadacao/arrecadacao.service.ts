import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LinhaArrecadacao } from './arrecadacao.parser';
import {
  CONFIG_ARRECADACAO,
  TipoArrecadacao,
  inicioDaProximaSemana,
  inicioDaSemana,
  inicioDoDia,
  inicioDoMes,
  inicioDoProximoDia,
  inicioDoProximoMes,
} from './arrecadacao.domain';

export interface ResultadoUploadArrecadacao {
  tipo: TipoArrecadacao;
  data: Date;
  quantidade: number;
  total: number;
}

export interface ResumoArrecadacao {
  tipo: TipoArrecadacao;
  titulo: string;
  base: 'FIXA' | 'VENDAS';
  meta: number;
  sentido: 'MAIOR_MELHOR' | 'MENOR_MELHOR';
  totalDia: number;
  totalSemana: number;
  totalMes: number;
  quantidadeDia: number;
  // Soma da quantidade (ex.: itens cancelados), quando o arquivo informa.
  itensDia: number;
  itensSemana: number;
  itensMes: number;
  // Apenas para base 'VENDAS': vendas do período e o % (total / vendas * 100).
  vendasDia?: number;
  vendasSemana?: number;
  vendasMes?: number;
  percentualDia?: number;
  percentualSemana?: number;
  percentualMes?: number;
}

export interface ItemRankingArrecadacao {
  nome: string;
  total: number;
  /** Soma da quantidade (itens/cupons) do operador, quando informado. */
  quantidade: number | null;
}

function arredondar(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Serviço de arrecadação: importa as linhas de um arquivo (substituindo o dia),
 * e calcula totais (dia/semana/mês) e ranking por operador para os indicadores.
 */
@Injectable()
export class ArrecadacaoService {
  constructor(private readonly prisma: PrismaService) {}

  /** Substitui os lançamentos do tipo no dia informado pelos do arquivo. */
  async importar(
    tipo: TipoArrecadacao,
    data: Date,
    linhas: LinhaArrecadacao[],
  ): Promise<ResultadoUploadArrecadacao> {
    const dia = inicioDoDia(data);
    const proximo = inicioDoProximoDia(data);
    await this.prisma.$transaction([
      this.prisma.registroArrecadacao.deleteMany({
        where: { tipo, data: { gte: dia, lt: proximo } },
      }),
      this.prisma.registroArrecadacao.createMany({
        data: linhas.map((l) => ({
          tipo,
          data: dia,
          nome: l.nome,
          matricula: l.matricula ?? null,
          valor: l.valor,
          quantidade: l.quantidade ?? null,
        })),
      }),
    ]);
    const total = linhas.reduce((soma, l) => soma + l.valor, 0);
    return { tipo, data: dia, quantidade: linhas.length, total: arredondar(total) };
  }

  private async somar(
    tipo: TipoArrecadacao,
    gte: Date,
    lt: Date,
  ): Promise<number> {
    const r = await this.prisma.registroArrecadacao.aggregate({
      where: { tipo, data: { gte, lt } },
      _sum: { valor: true },
    });
    return arredondar(Number(r._sum.valor ?? 0));
  }

  private async somarVendas(gte: Date, lt: Date): Promise<number> {
    const r = await this.prisma.vendaDiaria.aggregate({
      where: { data: { gte, lt } },
      _sum: { valor: true },
    });
    return arredondar(Number(r._sum.valor ?? 0));
  }

  /** Soma da quantidade (itens/cupons) do tipo no intervalo. */
  private async somarItens(
    tipo: TipoArrecadacao,
    gte: Date,
    lt: Date,
  ): Promise<number> {
    const r = await this.prisma.registroArrecadacao.aggregate({
      where: { tipo, data: { gte, lt } },
      _sum: { quantidade: true },
    });
    return Number(r._sum.quantidade ?? 0);
  }

  /** Totais do dia, da semana (seg–dom) e do mês que contêm a data. */
  async resumo(tipo: TipoArrecadacao, data: Date): Promise<ResumoArrecadacao> {
    const config = CONFIG_ARRECADACAO[tipo];
    const totalDia = await this.somar(
      tipo,
      inicioDoDia(data),
      inicioDoProximoDia(data),
    );
    const totalSemana = await this.somar(
      tipo,
      inicioDaSemana(data),
      inicioDaProximaSemana(data),
    );
    const totalMes = await this.somar(
      tipo,
      inicioDoMes(data),
      inicioDoProximoMes(data),
    );
    const quantidadeDia = await this.prisma.registroArrecadacao.count({
      where: {
        tipo,
        data: { gte: inicioDoDia(data), lt: inicioDoProximoDia(data) },
      },
    });

    const itensDia = await this.somarItens(
      tipo,
      inicioDoDia(data),
      inicioDoProximoDia(data),
    );
    const itensSemana = await this.somarItens(
      tipo,
      inicioDaSemana(data),
      inicioDaProximaSemana(data),
    );
    const itensMes = await this.somarItens(
      tipo,
      inicioDoMes(data),
      inicioDoProximoMes(data),
    );

    const base: ResumoArrecadacao = {
      tipo,
      titulo: config.titulo,
      base: config.base,
      meta: config.meta,
      sentido: config.sentido,
      totalDia,
      totalSemana,
      totalMes,
      quantidadeDia,
      itensDia,
      itensSemana,
      itensMes,
    };

    if (config.base !== 'VENDAS') {
      return base;
    }

    // Indicador sobre vendas: calcula vendas do período e o percentual.
    const vendasDia = await this.somarVendas(
      inicioDoDia(data),
      inicioDoProximoDia(data),
    );
    const vendasSemana = await this.somarVendas(
      inicioDaSemana(data),
      inicioDaProximaSemana(data),
    );
    const vendasMes = await this.somarVendas(
      inicioDoMes(data),
      inicioDoProximoMes(data),
    );
    const pct = (valor: number, vendas: number): number =>
      vendas > 0 ? arredondar((valor / vendas) * 100) : 0;

    return {
      ...base,
      vendasDia,
      vendasSemana,
      vendasMes,
      percentualDia: pct(totalDia, vendasDia),
      percentualSemana: pct(totalSemana, vendasSemana),
      percentualMes: pct(totalMes, vendasMes),
    };
  }

  /** Ranking por operador (soma do valor) no intervalo [inicio, fim]. */
  async ranking(
    tipo: TipoArrecadacao,
    inicio: Date,
    fim: Date,
  ): Promise<ItemRankingArrecadacao[]> {
    const gte = inicioDoDia(inicio);
    const lt = inicioDoProximoDia(fim);
    const grupos = await this.prisma.registroArrecadacao.groupBy({
      by: ['nome'],
      where: { tipo, data: { gte, lt } },
      _sum: { valor: true, quantidade: true },
      orderBy: { _sum: { valor: 'desc' } },
    });
    return grupos.map((g) => ({
      nome: g.nome,
      total: arredondar(Number(g._sum.valor ?? 0)),
      quantidade:
        g._sum.quantidade === null || g._sum.quantidade === undefined
          ? null
          : Number(g._sum.quantidade),
    }));
  }
}
