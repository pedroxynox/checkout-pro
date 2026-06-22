import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FechamentoService } from '../fechamento/fechamento.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import {
  EscalaEntry as EscalaEntryDom,
  escalaConsolidada,
} from '../fiscais/escala.domain';
import { LinhaVendaHora } from './vendas.parser';
import {
  NOMES_DIA_SEMANA,
  deslocarMeses,
  diasNoMes,
  horaParaMinutos,
  inicioDaProximaSemana,
  inicioDaSemana,
  inicioDoDia,
  inicioDoMes,
  inicioDoProximoDia,
  inicioDoProximoMes,
} from './vendas.domain';

export interface ResultadoUploadVendas {
  data: Date;
  horas: number;
  total: number;
  /** Verdadeiro se ESTE envio concluiu o fechamento do dia. */
  fechamentoConcluido: boolean;
}

export interface ItemVendaHora {
  hora: number;
  valor: number;
}

export interface VendasPorHora {
  total: number;
  horas: ItemVendaHora[];
}

export interface ResumoVendas {
  totalDia: number;
  totalSemana: number;
  totalMes: number;
}

/** Configuração do Painel de Vendas. */
export interface ConfigVendasResultado {
  metaMensal: number;
}

/** Comparativo entre o período atual e o equivalente anterior. */
export interface ComparativoVendas {
  atual: number;
  anterior: number;
  /** Variação % (null quando não há base anterior > 0). */
  variacao: number | null;
}

export interface PontoTendenciaVendas {
  data: string;
  valor: number;
}

export interface PontoCurvaHora {
  hora: number;
  /** Média de venda nessa hora num dia com movimento. */
  valor: number;
  /** Participação da hora no total do dia típico [0, 1]. */
  pct: number;
}

export interface PadraoDiaSemana {
  diaSemana: number;
  nome: string;
  /** Média do total diário nesse dia da semana. */
  media: number;
}

export interface LotacaoHora {
  hora: number;
  /** Participação da hora nas vendas [0, 1]. */
  pctVendas: number;
  /** Participação da hora na escala [0, 1]. */
  pctEscala: number;
  /** Média de pessoas escaladas nessa hora num dia típico. */
  escalados: number;
  /** Pessoas recomendadas (redistribuindo a equipe conforme as vendas). */
  recomendado: number;
  status: 'OK' | 'FALTA' | 'SOBRA';
}

export interface PainelVendas {
  metaMensal: number;
  /** Faturamento do mês até a data de referência. */
  arrecadadoMes: number;
  diasComVenda: number;
  diasNoMes: number;
  mediaDiaria: number;
  /** Projeção de fechamento do mês (run-rate). */
  projecaoFechamento: number;
  /** Progresso da meta [0, ...]. */
  metaProgresso: number;
  /** Projeção vs meta em % (null sem meta). */
  projecaoVsMeta: number | null;
  comparativos: {
    dia: ComparativoVendas;
    semana: ComparativoVendas;
    mes: ComparativoVendas;
  };
  tendencia: PontoTendenciaVendas[];
  curvaHoraria: PontoCurvaHora[];
  horaPico: number | null;
  /** Matriz 7x24 (dia da semana x hora) com a média de venda. */
  heatmap: number[][];
  padraoDiaSemana: PadraoDiaSemana[];
  lotacao: LotacaoHora[];
}

function arredondar(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Data deslocada N dias (em UTC, a partir do início do dia). */
function addDias(data: Date, dias: number): Date {
  const d = inicioDoDia(data);
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

/** Janela (em dias) usada para os perfis típicos (curva, heatmap, padrão). */
const JANELA_PERFIL_DIAS = 90;

/**
 * Serviço de Vendas por hora (Painel de Vendas). Importa o arquivo .txt
 * (substituindo o dia), mantém o total diário em `VendaDiaria` (que alimenta
 * os percentuais dos indicadores) e fornece análises inteligentes: totais por
 * período, distribuição por hora, projeção de fechamento, comparativos por
 * data, tendência, curva horária típica, heatmap hora x dia da semana, padrão
 * por dia da semana e recomendação de lotação cruzando com a escala.
 */
@Injectable()
export class VendasService {
  private readonly logger = new Logger(VendasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fechamento: FechamentoService,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

  /** Substitui as vendas por hora do dia e atualiza o total em VendaDiaria. */
  async importar(
    data: Date,
    linhas: LinhaVendaHora[],
  ): Promise<ResultadoUploadVendas> {
    const dia = inicioDoDia(data);
    const proximo = inicioDoProximoDia(data);
    const total = arredondar(linhas.reduce((s, l) => s + l.valor, 0));
    // Captura se o dia já estava concluído antes deste envio (para notificar
    // o fechamento apenas na transição).
    const completoAntes = await this.fechamento.estaCompleto(data);
    await this.prisma.$transaction([
      this.prisma.vendaHora.deleteMany({
        where: { data: { gte: dia, lt: proximo } },
      }),
      this.prisma.vendaHora.createMany({
        data: linhas.map((l) => ({ data: dia, hora: l.hora, valor: l.valor })),
      }),
      this.prisma.vendaDiaria.upsert({
        where: { data: dia },
        create: { data: dia, valor: total },
        update: { valor: total },
      }),
    ]);
    const fechamentoConcluido = await this.fechamento.concluirSeCompletou(
      data,
      completoAntes,
    );
    // Avisos inteligentes (recorde, queda anômala, meta em risco) — best-effort.
    void this.avisarVendas(dia, total);
    return { data: dia, horas: linhas.length, total, fechamentoConcluido };
  }

  private async somar(gte: Date, lt: Date): Promise<number> {
    const r = await this.prisma.vendaHora.aggregate({
      where: { data: { gte, lt } },
      _sum: { valor: true },
    });
    return arredondar(Number(r._sum.valor ?? 0));
  }

  /** Soma os totais diários (VendaDiaria) no intervalo [gte, lt). */
  private async somarDiario(gte: Date, lt: Date): Promise<number> {
    const r = await this.prisma.vendaDiaria.aggregate({
      where: { data: { gte, lt } },
      _sum: { valor: true },
    });
    return arredondar(Number(r._sum.valor ?? 0));
  }

  /** Valor total de um dia específico (0 se não houver). */
  private async valorDoDia(dia: Date): Promise<number> {
    const r = await this.prisma.vendaDiaria.findUnique({
      where: { data: inicioDoDia(dia) },
    });
    return r ? arredondar(Number(r.valor)) : 0;
  }

  /** Totais do dia/semana/mês que contêm a data. */
  async resumo(data: Date): Promise<ResumoVendas> {
    const [totalDia, totalSemana, totalMes] = await Promise.all([
      this.somar(inicioDoDia(data), inicioDoProximoDia(data)),
      this.somar(inicioDaSemana(data), inicioDaProximaSemana(data)),
      this.somar(inicioDoMes(data), inicioDoProximoMes(data)),
    ]);
    return { totalDia, totalSemana, totalMes };
  }

  /**
   * Distribuição por hora (0..23) somada no intervalo [início, fim] (inclusive)
   * e o total do período. Serve tanto para um único dia (início=fim) quanto
   * para um intervalo personalizado.
   */
  async porHora(inicio: Date, fim: Date): Promise<VendasPorHora> {
    const gte = inicioDoDia(inicio);
    const lt = inicioDoProximoDia(fim);
    const regs = await this.prisma.vendaHora.findMany({
      where: { data: { gte, lt } },
      select: { hora: true, valor: true },
    });
    const mapa = new Map<number, number>();
    for (const r of regs) {
      mapa.set(r.hora, (mapa.get(r.hora) ?? 0) + Number(r.valor));
    }
    const horas = Array.from(mapa.entries())
      .map(([hora, valor]) => ({ hora, valor: arredondar(valor) }))
      .sort((a, b) => a.hora - b.hora);
    const total = arredondar(horas.reduce((s, h) => s + h.valor, 0));
    return { total, horas };
  }

  /** Indica se já há vendas enviadas no dia informado. */
  async status(data: Date): Promise<{ enviado: boolean }> {
    const qtd = await this.prisma.vendaHora.count({
      where: {
        data: { gte: inicioDoDia(data), lt: inicioDoProximoDia(data) },
      },
    });
    return { enviado: qtd > 0 };
  }

  // --------------------------- Configuração -------------------------------

  /** Configuração (singleton id 'vendas'); cria com defaults se não existir. */
  async obterConfig(): Promise<ConfigVendasResultado> {
    const cfg = await this.prisma.configVendas.upsert({
      where: { id: 'vendas' },
      update: {},
      create: { id: 'vendas', metaMensal: 0 },
    });
    return { metaMensal: Number(cfg.metaMensal) };
  }

  /** Atualiza a meta mensal (gestor). */
  async definirConfig(
    dados: { metaMensal?: number },
    atualizadoPor?: string,
  ): Promise<ConfigVendasResultado> {
    const data: { metaMensal?: number; atualizadoPor?: string } = {
      atualizadoPor,
    };
    if (typeof dados.metaMensal === 'number' && dados.metaMensal >= 0) {
      data.metaMensal = dados.metaMensal;
    }
    const cfg = await this.prisma.configVendas.upsert({
      where: { id: 'vendas' },
      update: data,
      create: { id: 'vendas', metaMensal: data.metaMensal ?? 0, atualizadoPor },
    });
    return { metaMensal: Number(cfg.metaMensal) };
  }

  // ----------------------------- Painel -----------------------------------

  /**
   * Painel inteligente consolidado de vendas para a data de referência
   * (padrão: hoje): meta e projeção de fechamento, comparativos por data,
   * tendência, curva horária típica, heatmap, padrão por dia da semana e
   * recomendação de lotação por hora.
   */
  async painel(dataRef: Date = new Date()): Promise<PainelVendas> {
    const ref = inicioDoDia(dataRef);
    const { metaMensal } = await this.obterConfig();

    // --- Mês atual (até a data de referência) e projeção (run-rate) ---
    const inicioMes = inicioDoMes(ref);
    const fimMtd = addDias(ref, 1); // exclusivo: inclui o dia de referência
    const totalDiasMes = diasNoMes(ref);
    const diasMtd = await this.prisma.vendaDiaria.findMany({
      where: { data: { gte: inicioMes, lt: fimMtd }, valor: { gt: 0 } },
      select: { id: true },
    });
    const diasComVenda = diasMtd.length;
    const arrecadadoMes = await this.somarDiario(inicioMes, fimMtd);
    const mediaDiaria =
      diasComVenda > 0 ? arredondar(arrecadadoMes / diasComVenda) : 0;
    const projecaoFechamento = arredondar(mediaDiaria * totalDiasMes);
    const metaProgresso =
      metaMensal > 0 ? arrecadadoMes / metaMensal : 0;
    const projecaoVsMeta =
      metaMensal > 0 ? arredondar((projecaoFechamento / metaMensal - 1) * 100) : null;

    // --- Comparativos por data ---
    const refAnterior = deslocarMeses(ref, -1);
    const variacao = (atual: number, anterior: number): number | null =>
      anterior > 0 ? arredondar((atual / anterior - 1) * 100) : null;

    const [
      diaAtual,
      diaAnterior,
      semanaAtual,
      semanaAnterior,
      mesAnterior,
    ] = await Promise.all([
      this.valorDoDia(ref),
      this.valorDoDia(refAnterior),
      this.somarDiario(addDias(ref, -6), addDias(ref, 1)),
      this.somarDiario(addDias(ref, -13), addDias(ref, -6)),
      this.somarDiario(inicioDoMes(refAnterior), addDias(refAnterior, 1)),
    ]);

    const comparativos = {
      dia: {
        atual: diaAtual,
        anterior: diaAnterior,
        variacao: variacao(diaAtual, diaAnterior),
      },
      semana: {
        atual: semanaAtual,
        anterior: semanaAnterior,
        variacao: variacao(semanaAtual, semanaAnterior),
      },
      mes: {
        atual: arrecadadoMes,
        anterior: mesAnterior,
        variacao: variacao(arrecadadoMes, mesAnterior),
      },
    };

    // --- Tendência (30 dias) ---
    const inicioTend = addDias(ref, -29);
    const diariosTend = await this.prisma.vendaDiaria.findMany({
      where: { data: { gte: inicioTend, lt: fimMtd } },
      select: { data: true, valor: true },
    });
    const mapaDiario = new Map<string, number>();
    for (const d of diariosTend) {
      mapaDiario.set(d.data.toISOString().slice(0, 10), Number(d.valor));
    }
    const tendencia: PontoTendenciaVendas[] = [];
    for (let i = 29; i >= 0; i--) {
      const dia = addDias(ref, -i);
      const iso = dia.toISOString().slice(0, 10);
      tendencia.push({ data: iso, valor: arredondar(mapaDiario.get(iso) ?? 0) });
    }

    // --- Perfis típicos (curva, heatmap, padrão por dia da semana) ---
    const inicioPerfil = addDias(ref, -(JANELA_PERFIL_DIAS - 1));
    const [horasPerfil, diariosPerfil] = await Promise.all([
      this.prisma.vendaHora.findMany({
        where: { data: { gte: inicioPerfil, lt: fimMtd } },
        select: { data: true, hora: true, valor: true },
      }),
      this.prisma.vendaDiaria.findMany({
        where: { data: { gte: inicioPerfil, lt: fimMtd }, valor: { gt: 0 } },
        select: { data: true, valor: true },
      }),
    ]);

    const { curvaHoraria, horaPico, heatmap } =
      this.calcularPerfilHorario(horasPerfil);
    const padraoDiaSemana = this.calcularPadraoDiaSemana(diariosPerfil);

    // --- Recomendação de lotação por hora (cruza com a escala) ---
    const lotacao = await this.calcularLotacao(curvaHoraria);

    return {
      metaMensal,
      arrecadadoMes,
      diasComVenda,
      diasNoMes: totalDiasMes,
      mediaDiaria,
      projecaoFechamento,
      metaProgresso,
      projecaoVsMeta,
      comparativos,
      tendencia,
      curvaHoraria,
      horaPico,
      heatmap,
      padraoDiaSemana,
      lotacao,
    };
  }

  /**
   * Curva horária típica (média por hora num dia com movimento) e heatmap
   * (média por dia da semana x hora), a partir dos registros por hora.
   */
  private calcularPerfilHorario(
    regs: { data: Date; hora: number; valor: unknown }[],
  ): {
    curvaHoraria: PontoCurvaHora[];
    horaPico: number | null;
    heatmap: number[][];
  } {
    const somaHora = new Array<number>(24).fill(0);
    const diasComVenda = new Set<string>();
    // Heatmap: soma por [dia da semana][hora] e dias distintos por dia da semana.
    const somaHeat: number[][] = Array.from({ length: 7 }, () =>
      new Array<number>(24).fill(0),
    );
    const diasPorSemana: Set<string>[] = Array.from({ length: 7 }, () => new Set());

    for (const r of regs) {
      const v = Number(r.valor);
      const iso = r.data.toISOString().slice(0, 10);
      const dow = r.data.getUTCDay();
      somaHora[r.hora] += v;
      diasComVenda.add(iso);
      somaHeat[dow][r.hora] += v;
      diasPorSemana[dow].add(iso);
    }

    const nDias = diasComVenda.size;
    const mediaHora = somaHora.map((s) => (nDias > 0 ? s / nDias : 0));
    const totalMedia = mediaHora.reduce((s, v) => s + v, 0);

    const curvaHoraria: PontoCurvaHora[] = mediaHora.map((valor, hora) => ({
      hora,
      valor: arredondar(valor),
      pct: totalMedia > 0 ? valor / totalMedia : 0,
    }));

    let horaPico: number | null = null;
    let maxMedia = 0;
    for (let h = 0; h < 24; h++) {
      if (mediaHora[h] > maxMedia) {
        maxMedia = mediaHora[h];
        horaPico = h;
      }
    }

    const heatmap: number[][] = somaHeat.map((linha, dow) => {
      const n = diasPorSemana[dow].size;
      return linha.map((s) => arredondar(n > 0 ? s / n : 0));
    });

    return { curvaHoraria, horaPico, heatmap };
  }

  /** Média do total diário por dia da semana (0=Dom..6=Sáb). */
  private calcularPadraoDiaSemana(
    diarios: { data: Date; valor: unknown }[],
  ): PadraoDiaSemana[] {
    const soma = new Array<number>(7).fill(0);
    const cont = new Array<number>(7).fill(0);
    for (const d of diarios) {
      const dow = d.data.getUTCDay();
      soma[dow] += Number(d.valor);
      cont[dow] += 1;
    }
    return soma.map((s, dow) => ({
      diaSemana: dow,
      nome: NOMES_DIA_SEMANA[dow],
      media: arredondar(cont[dow] > 0 ? s / cont[dow] : 0),
    }));
  }

  /**
   * Recomendação de lotação por hora: cruza a participação de vendas de cada
   * hora (curva típica) com a média de pessoas escaladas naquela hora (escala
   * consolidada de todos os dias da semana). Sinaliza FALTA (hora com muita
   * venda e pouca gente) ou SOBRA (o oposto).
   */
  private async calcularLotacao(
    curvaHoraria: PontoCurvaHora[],
  ): Promise<LotacaoHora[]> {
    const entries = (await this.prisma.escalaEntry.findMany()) as unknown as EscalaEntryDom[];

    // Média de pessoas cobrindo cada hora num dia típico (média entre os 7 dias).
    const coberturaHora = new Array<number>(24).fill(0);
    for (let dow = 0; dow < 7; dow++) {
      const itens = escalaConsolidada(entries, dow);
      for (const item of itens) {
        const ef = item.efetiva;
        if (ef === 'FOLGA') continue;
        const ent = horaParaMinutos(ef.entrada);
        const sai = horaParaMinutos(ef.saida);
        if (ent == null || sai == null || sai <= ent) continue;
        for (let h = 0; h < 24; h++) {
          // A pessoa cobre a hora h se o turno se sobrepõe ao intervalo [h, h+1).
          if (ent < (h + 1) * 60 && sai > h * 60) {
            coberturaHora[h] += 1;
          }
        }
      }
    }
    const escaladosHora = coberturaHora.map((c) => c / 7);
    const totalEscalados = escaladosHora.reduce((s, v) => s + v, 0);

    const lotacao: LotacaoHora[] = [];
    for (let h = 0; h < 24; h++) {
      const pctVendas = curvaHoraria[h]?.pct ?? 0;
      const escalados = escaladosHora[h];
      // Inclui apenas horas operacionais (com venda ou com gente escalada).
      if (pctVendas <= 0 && escalados <= 0) continue;
      const pctEscala = totalEscalados > 0 ? escalados / totalEscalados : 0;
      const recomendado = arredondar(totalEscalados * pctVendas);
      const diff = pctVendas - pctEscala;
      const status: LotacaoHora['status'] =
        diff > 0.03 ? 'FALTA' : diff < -0.03 ? 'SOBRA' : 'OK';
      lotacao.push({
        hora: h,
        pctVendas,
        pctEscala,
        escalados: arredondar(escalados),
        recomendado,
        status,
      });
    }
    return lotacao;
  }

  // --------------------------- Notificações -------------------------------

  /**
   * Avisos inteligentes ao importar um dia: dia recorde de vendas, queda
   * anômala (bem abaixo da média daquele dia da semana) e meta do mês em
   * risco. Best-effort: nunca quebra a importação.
   */
  private async avisarVendas(dia: Date, total: number): Promise<void> {
    if (!this.notificacoes || total <= 0) return;
    try {
      const gestores = await this.notificacoes.gestores();
      if (gestores.length === 0) return;

      // (a) Dia recorde: maior que todos os dias anteriores.
      const recordeAnterior = await this.prisma.vendaDiaria.aggregate({
        where: { data: { lt: dia } },
        _max: { valor: true },
      });
      const maxAnterior = Number(recordeAnterior._max.valor ?? 0);
      if (maxAnterior > 0 && total > maxAnterior) {
        await this.notificacoes.enviar(gestores, {
          titulo: '🏆 Dia recorde de vendas!',
          mensagem: `As vendas de hoje (R$${total.toFixed(2)}) superaram o recorde anterior de R$${maxAnterior.toFixed(2)}. Parabéns à equipe!`,
        });
      }

      // (b) Queda anômala: bem abaixo da média daquele dia da semana.
      const dow = dia.getUTCDay();
      const inicioJanela = addDias(dia, -(JANELA_PERFIL_DIAS - 1));
      const historico = await this.prisma.vendaDiaria.findMany({
        where: { data: { gte: inicioJanela, lt: dia }, valor: { gt: 0 } },
        select: { data: true, valor: true },
      });
      const mesmosDias = historico.filter((d) => d.data.getUTCDay() === dow);
      if (mesmosDias.length >= 3) {
        const media =
          mesmosDias.reduce((s, d) => s + Number(d.valor), 0) /
          mesmosDias.length;
        if (media > 0 && total < media * 0.7) {
          const queda = Math.round((1 - total / media) * 100);
          await this.notificacoes.enviar(gestores, {
            titulo: '⚠️ Queda nas vendas',
            mensagem: `As vendas de hoje (${NOMES_DIA_SEMANA[dow]}) estão ${queda}% abaixo da média desse dia da semana (R$${media.toFixed(2)}).`,
          });
        }
      }

      // (c) Meta do mês em risco (a partir do dia 10).
      const cfg = await this.obterConfig();
      if (cfg.metaMensal > 0 && dia.getUTCDate() >= 10) {
        const inicioMes = inicioDoMes(dia);
        const fimMtd = addDias(dia, 1);
        const totalMes = await this.somarDiario(inicioMes, fimMtd);
        const dias = await this.prisma.vendaDiaria.count({
          where: { data: { gte: inicioMes, lt: fimMtd }, valor: { gt: 0 } },
        });
        if (dias > 0) {
          const projecao = (totalMes / dias) * diasNoMes(dia);
          if (projecao < cfg.metaMensal * 0.9) {
            const falta = Math.round((1 - projecao / cfg.metaMensal) * 100);
            await this.notificacoes.enviar(gestores, {
              titulo: '📉 Meta do mês em risco',
              mensagem: `No ritmo atual, o mês deve fechar em R$${projecao.toFixed(2)} — ${falta}% abaixo da meta de R$${cfg.metaMensal.toFixed(2)}.`,
            });
          }
        }
      }
    } catch (erro) {
      this.logger.warn(`Falha ao avaliar avisos de vendas: ${String(erro)}`);
    }
  }

  /**
   * Remove os totais diários (VendaDiaria) que não têm detalhe por hora
   * (VendaHora) — ou seja, lançamentos manuais/antigos. Mantém apenas os dias
   * enviados por arquivo. Retorna quantos foram removidos.
   */
  async limparSemDetalheHora(): Promise<{ removidos: number }> {
    const dias = await this.prisma.vendaHora.findMany({
      distinct: ['data'],
      select: { data: true },
    });
    const comHora = dias.map((d) => d.data);
    const r = await this.prisma.vendaDiaria.deleteMany({
      where: { data: { notIn: comHora } },
    });
    return { removidos: r.count };
  }
}
