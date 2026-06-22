import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ArrecadacaoService } from './arrecadacao.service';
import {
  CONFIG_ARRECADACAO,
  TipoArrecadacao,
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

/** Severidade de um alerta do painel de atenção. */
export type Severidade = 'CRITICO' | 'ATENCAO';

/** Tendência de um alerta vs a semana anterior. */
export type TendenciaAlerta = 'PIORANDO' | 'MELHORANDO' | 'ESTAVEL';

/** Um alerta do painel "Precisa de atenção". */
export interface AlertaAtencao {
  /** META = indicador fora/em risco; OPERADOR = pessoa acima da média. */
  categoria: 'META' | 'OPERADOR';
  severidade: Severidade;
  tipo: TipoArrecadacao;
  titulo: string;
  /** Mensagem principal (gap quantificado). */
  mensagem: string;
  /** Ação sugerida ao gestor. */
  acaoSugerida: string;
  /** Tendência vs semana anterior (apenas alertas de META). */
  tendencia?: TendenciaAlerta;
  detalheTendencia?: string;
  /** Texto da projeção de fechamento (apenas META base FIXA). */
  projecaoTexto?: string;
  /** Dados do operador (apenas alertas de OPERADOR). */
  operadorNome?: string;
  operadorValor?: number;
  operadorItens?: number;
  ticketMedio?: number;
  autorizadoPor?: string;
}

/** Resposta do painel "Precisa de atenção". */
export interface PainelAtencao {
  criticos: number;
  emAtencao: number;
  tudoCerto: boolean;
  alertas: AlertaAtencao[];
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
   * Colaborador do mês: melhor SCORE LÍQUIDO no mês —
   * contribuição (troco solidário + recargas) menos os erros (cancelamento
   * de itens). O cancelamento de CUPOM não entra (costuma ser autorizado
   * pela gestão, não é falha do operador) e as devoluções são dos fiscais.
   */
  async operadorDoMes(data: Date): Promise<{ nome: string; total: number } | null> {
    const gte = inicioDoMes(data);
    const lt = inicioDoProximoMes(data);
    const registros = await this.prisma.registroArrecadacao.findMany({
      where: {
        tipo: { in: ['TROCO_SOLIDARIO', 'RECARGAS_CELULAR', 'CANCELAMENTO_ITENS'] },
        data: { gte, lt },
      },
      select: { nome: true, valor: true, tipo: true },
    });
    if (registros.length === 0) return null;

    const score = new Map<string, number>();
    for (const r of registros) {
      const v = Number(r.valor);
      const delta = r.tipo === 'CANCELAMENTO_ITENS' ? -v : v;
      score.set(r.nome, (score.get(r.nome) ?? 0) + delta);
    }
    let melhor: { nome: string; total: number } | null = null;
    for (const [nome, total] of score.entries()) {
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

  /** Ação sugerida por tipo de indicador. */
  private acaoSugerida(tipo: TipoArrecadacao): string {
    switch (tipo) {
      case 'TROCO_SOLIDARIO':
        return 'Incentivar a arrecadação de troco solidário nos caixas.';
      case 'RECARGAS_CELULAR':
        return 'Estimular a oferta de recargas de celular aos clientes.';
      case 'CANCELAMENTO_ITENS':
        return 'Revisar os itens cancelados de maior valor com os operadores.';
      case 'CANCELAMENTO_CUPOM':
        return 'Revisar as autorizações de cancelamento de cupom.';
      case 'DEVOLUCOES':
        return 'Verificar os motivos das devoluções com os fiscais.';
      default:
        return 'Revisar o indicador.';
    }
  }

  /**
   * Painel "Precisa de atenção" completo: metas em risco (com gap quantificado,
   * tendência vs semana anterior e projeção) e operadores acima da média
   * (por VALOR, com itens, ticket médio e quem autorizou). Ordenado por
   * severidade (críticos primeiro).
   */
  async painelAtencao(data: Date): Promise<PainelAtencao> {
    const alertas: AlertaAtencao[] = [];

    for (const tipo of Object.keys(CONFIG_ARRECADACAO) as TipoArrecadacao[]) {
      const config = CONFIG_ARRECADACAO[tipo];
      const [resumo, comparativo, projecao] = await Promise.all([
        this.arrecadacao.resumo(tipo, data),
        this.comparativo(tipo, data),
        this.projecaoMes(tipo, data),
      ]);
      const meta = resumo.meta;

      // Tendência (semana vs semana anterior).
      const v = comparativo.semana.variacao;
      let tendencia: TendenciaAlerta | undefined;
      let detalheTendencia: string | undefined;
      if (v !== null) {
        const piora =
          config.sentido === 'MENOR_MELHOR' ? v > 10 : v < -10;
        const melhora =
          config.sentido === 'MENOR_MELHOR' ? v < -10 : v > 10;
        tendencia = piora ? 'PIORANDO' : melhora ? 'MELHORANDO' : 'ESTAVEL';
        detalheTendencia = `${v >= 0 ? '+' : ''}${v}% vs semana passada`;
      }

      if (config.sentido === 'MENOR_MELHOR') {
        const pct = resumo.percentualMes ?? 0;
        let severidade: Severidade | null = null;
        if (pct > meta * 1.5) severidade = 'CRITICO';
        else if (pct > meta) severidade = 'ATENCAO';
        if (severidade) {
          const vendasMes = resumo.vendasMes ?? 0;
          const limiteR$ = (meta / 100) * vendasMes;
          const excedente = arredondar(Math.max(0, resumo.totalMes - limiteR$));
          alertas.push({
            categoria: 'META',
            severidade,
            tipo,
            titulo: config.titulo,
            mensagem: `${pct}% das vendas no mês — R$${excedente} acima do limite de ${meta}%.`,
            acaoSugerida: this.acaoSugerida(tipo),
            tendencia,
            detalheTendencia,
          });
        }
      } else {
        // MAIOR_MELHOR: julga pelo RITMO (ritmo ideal até hoje).
        const ritmoIdeal = projecao.metaAcumuladaHoje;
        let severidade: Severidade | null = null;
        if (resumo.totalMes < ritmoIdeal * 0.6) severidade = 'CRITICO';
        else if (resumo.totalMes < ritmoIdeal * 0.9) severidade = 'ATENCAO';
        if (severidade) {
          const falta = arredondar(Math.max(0, meta - resumo.totalMes));
          alertas.push({
            categoria: 'META',
            severidade,
            tipo,
            titulo: config.titulo,
            mensagem: `R$${resumo.totalMes} de R$${meta} no mês — faltam R$${falta}.`,
            acaoSugerida: this.acaoSugerida(tipo),
            tendencia,
            detalheTendencia,
            projecaoTexto: projecao.vaiCumprir
              ? `Projeção: R$${projecao.projecao} ✅ no ritmo da meta`
              : `Projeção: R$${projecao.projecao} ⚠️ abaixo da meta`,
          });
        }
      }
    }

    // Operadores acima da média (por VALOR) nos cancelamentos/devoluções.
    const ofensores = await this.topOfensores(data);
    for (const o of ofensores) {
      alertas.push({
        categoria: 'OPERADOR',
        severidade: o.total >= o.media * 3 ? 'CRITICO' : 'ATENCAO',
        tipo: o.tipo,
        titulo: CONFIG_ARRECADACAO[o.tipo].titulo,
        mensagem: `${o.nome} — R$${o.total}${o.itens > 0 ? ` em ${o.itens} ${o.itens === 1 ? 'item' : 'itens'}` : ''} (média da equipe R$${o.media}).`,
        acaoSugerida: this.acaoSugerida(o.tipo),
        operadorNome: o.nome,
        operadorValor: o.total,
        operadorItens: o.itens,
        ticketMedio: o.ticketMedio,
        autorizadoPor: o.autorizadoPor ?? undefined,
      });
    }

    // Ordena: críticos primeiro, depois por categoria (META antes de OPERADOR).
    const peso = (a: AlertaAtencao): number =>
      (a.severidade === 'CRITICO' ? 0 : 10) + (a.categoria === 'META' ? 0 : 1);
    alertas.sort((a, b) => peso(a) - peso(b));

    const criticos = alertas.filter((a) => a.severidade === 'CRITICO').length;
    const emAtencao = alertas.filter((a) => a.severidade === 'ATENCAO').length;

    return {
      criticos,
      emAtencao,
      tudoCerto: alertas.length === 0,
      alertas,
    };
  }

  /**
   * Top operadores acima da média (≥2×) por VALOR nos cancelamentos e
   * devoluções do mês, enriquecidos com itens, ticket médio e autorizador.
   */
  private async topOfensores(data: Date): Promise<
    {
      tipo: TipoArrecadacao;
      nome: string;
      total: number;
      media: number;
      itens: number;
      ticketMedio: number;
      autorizadoPor: string | null;
    }[]
  > {
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
      itens: number;
      ticketMedio: number;
      autorizadoPor: string | null;
    }[] = [];

    for (const tipo of tipos) {
      const registros = await this.prisma.registroArrecadacao.findMany({
        where: { tipo, data: { gte, lt } },
        select: {
          nome: true,
          valor: true,
          quantidade: true,
          autorizadoPor: true,
        },
      });
      if (registros.length === 0) continue;

      // Agrega por operador (por VALOR).
      const agg = new Map<
        string,
        { total: number; itens: number; maiorValor: number; autorizadoPor: string | null }
      >();
      for (const r of registros) {
        const atual = agg.get(r.nome) ?? {
          total: 0,
          itens: 0,
          maiorValor: 0,
          autorizadoPor: null,
        };
        const valor = Number(r.valor);
        atual.total += valor;
        atual.itens += r.quantidade ?? 0;
        if (valor > atual.maiorValor) {
          atual.maiorValor = valor;
          atual.autorizadoPor = r.autorizadoPor ?? null;
        }
        agg.set(r.nome, atual);
      }

      const valores = [...agg.values()].map((a) => a.total);
      const media = valores.reduce((a, b) => a + b, 0) / valores.length;
      if (media <= 0 || valores.length < 3) continue;

      for (const [nome, a] of agg.entries()) {
        if (a.total >= media * 2) {
          resultado.push({
            tipo,
            nome,
            total: arredondar(a.total),
            media: arredondar(media),
            itens: a.itens,
            ticketMedio: a.itens > 0 ? arredondar(a.total / a.itens) : arredondar(a.total),
            autorizadoPor: a.autorizadoPor,
          });
        }
      }
    }

    // Ordena por valor desc.
    return resultado.sort((a, b) => b.total - a.total);
  }
}
