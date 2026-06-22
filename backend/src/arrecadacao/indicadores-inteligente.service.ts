import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ArrecadacaoService } from './arrecadacao.service';
import {
  CONFIG_ARRECADACAO,
  TipoArrecadacao,
  inicioDoDia,
  inicioDoMes,
  inicioDoProximoDia,
  inicioDoProximoMes,
  inicioDaSemana,
  inicioDaProximaSemana,
} from './arrecadacao.domain';

/** Um ponto da série temporal (um dia). */
export interface PontoTendencia {
  data: string;
  total: number;
  /** % sobre vendas do dia (apenas base VENDAS). */
  percentual?: number;
}

/** Comparação de um período atual vs o anterior. */
export interface Comparativo {
  atual: number;
  anterior: number;
  /** Variação percentual ((atual-anterior)/anterior*100); null se anterior=0. */
  variacao: number | null;
}

/** Projeção de fechamento de mês. */
export interface ProjecaoMes {
  tipo: TipoArrecadacao;
  base: 'FIXA' | 'VENDAS';
  meta: number;
  acumuladoMes: number;
  /** Dias transcorridos no mês (incluindo hoje). */
  diasTranscorridos: number;
  /** Dias totais do mês. */
  diasDoMes: number;
  /** Projeção ao ritmo atual (base FIXA). */
  projecao: number;
  /** Meta diária derivada (meta mensal / dias do mês) — base FIXA. */
  metaDiaria: number;
  /** Quanto deveria ter acumulado até hoje para ir no ritmo. */
  metaAcumuladaHoje: number;
  /** true se a projeção cumpre a meta. */
  vaiCumprir: boolean;
}

function arredondar(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Serviço de inteligência dos indicadores: tendência histórica, comparativo
 * com período anterior, projeção de fechamento de mês, meta diária, operador
 * do mês e detecção de anomalias. Lê a mesma base (RegistroArrecadacao +
 * VendaDiaria) usada pelos indicadores.
 */
@Injectable()
export class IndicadoresInteligenteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly arrecadacao: ArrecadacaoService,
  ) {}

  private async somar(tipo: TipoArrecadacao, gte: Date, lt: Date): Promise<number> {
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

  /**
   * Série temporal dos últimos `dias` dias até `dataFim` (inclusive). Para base
   * VENDAS, calcula o % sobre as vendas de cada dia.
   */
  async tendencia(
    tipo: TipoArrecadacao,
    dataFim: Date,
    dias = 30,
  ): Promise<PontoTendencia[]> {
    const config = CONFIG_ARRECADACAO[tipo];
    const fim = inicioDoProximoDia(dataFim);
    const inicio = new Date(fim.getTime() - dias * 24 * 60 * 60 * 1000);

    const [registros, vendas] = await Promise.all([
      this.prisma.registroArrecadacao.findMany({
        where: { tipo, data: { gte: inicio, lt: fim } },
        select: { data: true, valor: true },
      }),
      config.base === 'VENDAS'
        ? this.prisma.vendaDiaria.findMany({
            where: { data: { gte: inicio, lt: fim } },
            select: { data: true, valor: true },
          })
        : Promise.resolve([] as { data: Date; valor: unknown }[]),
    ]);

    // Acumula por dia (chave ISO yyyy-mm-dd).
    const totalPorDia = new Map<string, number>();
    for (const r of registros) {
      const k = r.data.toISOString().slice(0, 10);
      totalPorDia.set(k, (totalPorDia.get(k) ?? 0) + Number(r.valor));
    }
    const vendasPorDia = new Map<string, number>();
    for (const v of vendas) {
      const k = v.data.toISOString().slice(0, 10);
      vendasPorDia.set(k, (vendasPorDia.get(k) ?? 0) + Number(v.valor));
    }

    const pontos: PontoTendencia[] = [];
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date(fim.getTime() - (i + 1) * 24 * 60 * 60 * 1000);
      const k = d.toISOString().slice(0, 10);
      const total = arredondar(totalPorDia.get(k) ?? 0);
      const ponto: PontoTendencia = { data: k, total };
      if (config.base === 'VENDAS') {
        const vd = vendasPorDia.get(k) ?? 0;
        ponto.percentual = vd > 0 ? arredondar((total / vd) * 100) : 0;
      }
      pontos.push(ponto);
    }
    return pontos;
  }

  /** Comparativo do mês atual vs o mês anterior (e semana vs semana anterior). */
  async comparativo(
    tipo: TipoArrecadacao,
    data: Date,
  ): Promise<{ mes: Comparativo; semana: Comparativo }> {
    const inicioMesAtual = inicioDoMes(data);
    const inicioMesProximo = inicioDoProximoMes(data);
    const inicioMesAnterior = new Date(
      Date.UTC(data.getUTCFullYear(), data.getUTCMonth() - 1, 1),
    );

    const inicioSemAtual = inicioDaSemana(data);
    const inicioSemProxima = inicioDaProximaSemana(data);
    const inicioSemAnterior = new Date(
      inicioSemAtual.getTime() - 7 * 24 * 60 * 60 * 1000,
    );

    const [mesAtual, mesAnterior, semAtual, semAnterior] = await Promise.all([
      this.somar(tipo, inicioMesAtual, inicioMesProximo),
      this.somar(tipo, inicioMesAnterior, inicioMesAtual),
      this.somar(tipo, inicioSemAtual, inicioSemProxima),
      this.somar(tipo, inicioSemAnterior, inicioSemAtual),
    ]);

    const variacao = (atual: number, anterior: number): number | null =>
      anterior > 0 ? arredondar(((atual - anterior) / anterior) * 100) : null;

    return {
      mes: { atual: mesAtual, anterior: mesAnterior, variacao: variacao(mesAtual, mesAnterior) },
      semana: {
        atual: semAtual,
        anterior: semAnterior,
        variacao: variacao(semAtual, semAnterior),
      },
    };
  }

  /** Projeção de fechamento de mês ao ritmo atual + meta diária derivada. */
  async projecaoMes(tipo: TipoArrecadacao, data: Date): Promise<ProjecaoMes> {
    const config = CONFIG_ARRECADACAO[tipo];
    const meta = await this.arrecadacao.metaDe(tipo);
    const acumuladoMes = await this.somar(
      tipo,
      inicioDoMes(data),
      inicioDoProximoMes(data),
    );

    const diasDoMes = new Date(
      Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + 1, 0),
    ).getUTCDate();
    const diasTranscorridos = data.getUTCDate();

    let projecao: number;
    let metaDiaria: number;
    let metaAcumuladaHoje: number;
    let vaiCumprir: boolean;

    if (config.base === 'FIXA') {
      projecao =
        diasTranscorridos > 0
          ? arredondar((acumuladoMes / diasTranscorridos) * diasDoMes)
          : 0;
      metaDiaria = arredondar(meta / diasDoMes);
      metaAcumuladaHoje = arredondar(metaDiaria * diasTranscorridos);
      vaiCumprir = projecao >= meta;
    } else {
      // VENDAS: meta é um % máximo. "Projeção" = % acumulado do mês.
      const vendasMes = await this.somarVendas(
        inicioDoMes(data),
        inicioDoProximoMes(data),
      );
      const pctMes = vendasMes > 0 ? arredondar((acumuladoMes / vendasMes) * 100) : 0;
      projecao = pctMes;
      metaDiaria = meta; // o alvo (% máximo) é o mesmo todos os dias
      metaAcumuladaHoje = meta;
      vaiCumprir = pctMes <= meta;
    }

    return {
      tipo,
      base: config.base,
      meta,
      acumuladoMes,
      diasTranscorridos,
      diasDoMes,
      projecao,
      metaDiaria,
      metaAcumuladaHoje,
      vaiCumprir,
    };
  }

  /**
   * Operador do mês: melhor desempenho combinando contribuição positiva
   * (troco solidário + recargas) no mês. Retorna o top operador.
   */
  async operadorDoMes(data: Date): Promise<{ nome: string; total: number } | null> {
    const gte = inicioDoMes(data);
    const lt = inicioDoProximoMes(data);
    const registros = await this.prisma.registroArrecadacao.findMany({
      where: {
        tipo: { in: ['TROCO_SOLIDARIO', 'RECARGAS_CELULAR'] },
        data: { gte, lt },
      },
      select: { nome: true, valor: true },
    });
    if (registros.length === 0) return null;

    const totais = new Map<string, number>();
    for (const r of registros) {
      totais.set(r.nome, (totais.get(r.nome) ?? 0) + Number(r.valor));
    }
    let melhor: { nome: string; total: number } | null = null;
    for (const [nome, total] of totais.entries()) {
      if (!melhor || total > melhor.total) {
        melhor = { nome, total: arredondar(total) };
      }
    }
    return melhor;
  }

  /**
   * Detecta operadores com cancelamentos muito acima da média da equipe no mês
   * (≥ 2× a média). Sinaliza possíveis problemas para revisão gerencial.
   */
  async anomalias(
    data: Date,
  ): Promise<{ tipo: TipoArrecadacao; nome: string; total: number; media: number }[]> {
    const gte = inicioDoMes(data);
    const lt = inicioDoProximoMes(data);
    const tipos: TipoArrecadacao[] = [
      'CANCELAMENTO_ITENS',
      'CANCELAMENTO_CUPOM',
      'DEVOLUCOES',
    ];
    const resultado: {
      tipo: TipoArrecadacao;
      nome: string;
      total: number;
      media: number;
    }[] = [];

    for (const tipo of tipos) {
      const registros = await this.prisma.registroArrecadacao.findMany({
        where: { tipo, data: { gte, lt } },
        select: { nome: true, valor: true },
      });
      if (registros.length === 0) continue;

      const totais = new Map<string, number>();
      for (const r of registros) {
        totais.set(r.nome, (totais.get(r.nome) ?? 0) + Number(r.valor));
      }
      const valores = [...totais.values()];
      const media = valores.reduce((a, b) => a + b, 0) / valores.length;
      if (media <= 0) continue;

      for (const [nome, total] of totais.entries()) {
        if (total >= media * 2 && valores.length >= 3) {
          resultado.push({
            tipo,
            nome,
            total: arredondar(total),
            media: arredondar(media),
          });
        }
      }
    }
    return resultado;
  }
}
