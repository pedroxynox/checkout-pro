/**
 * Lógica de domínio **pura** do Modulo_Insumos.
 *
 * Concentra o cálculo do saldo de estoque como soma dos movimentos
 * (Req 3.1.2, 3.1.4, 3.2.1, 3.2.2, 3.3.1, 3.3.2), a resolução de um fardo pelo
 * código de barras (Req 3.1.3) e a regra de alerta de estoque baixo na
 * fronteira do limite mínimo (Req 3.1.5, 3.2.3, 3.3.3).
 *
 * Por serem puras e determinísticas, podem ser exercitadas por testes de
 * propriedade (fast-check) sem qualquer infraestrutura.
 */

import {
  FardoNaoReconhecidoError,
  QuantidadeInvalidaError,
} from './insumos.errors';

/** Movimento de estoque reduzido ao seu efeito sobre o saldo (delta). */
export interface MovimentoDelta {
  delta: number;
}

/** Representação mínima de um fardo de sacolas. */
export interface FardoRef {
  codigoBarras: string;
  quantidadeSacolas: number;
}

/**
 * Calcula o saldo de estoque (Req 3.1.4, 3.2.1, 3.3.1) como o saldo inicial
 * somado a todos os deltas dos movimentos registrados. Por construção, o saldo
 * exibido em tempo real é exatamente esta soma.
 */
export function calcularSaldo(
  saldoInicial: number,
  movimentos: readonly MovimentoDelta[],
): number {
  return movimentos.reduce((acc, m) => acc + m.delta, saldoInicial);
}

/**
 * Resolve um fardo pelo código de barras (Req 3.1.3). Retorna o fardo
 * correspondente ou `null` quando o código não está cadastrado.
 */
export function resolverFardo<T extends FardoRef>(
  fardos: readonly T[],
  codigoBarras: string,
): T | null {
  return fardos.find((f) => f.codigoBarras === codigoBarras) ?? null;
}

/**
 * Calcula o delta (negativo) de uma retirada de fardo (Req 3.1.2): reduz o
 * saldo de sacolas exatamente pela quantidade de sacolas do fardo. Lança
 * `QuantidadeInvalidaError` se a quantidade do fardo não for um inteiro
 * positivo.
 */
export function deltaRetiradaFardo(quantidadeSacolas: number): number {
  if (!Number.isInteger(quantidadeSacolas) || quantidadeSacolas <= 0) {
    throw new QuantidadeInvalidaError(quantidadeSacolas);
  }
  return -quantidadeSacolas;
}

/**
 * Calcula o delta (negativo) de um consumo de insumo/bobina (Req 3.2.2,
 * 3.3.2): reduz o saldo pela quantidade consumida. Lança
 * `QuantidadeInvalidaError` para quantidade não inteira ou menor ou igual a
 * zero.
 */
export function deltaConsumo(quantidade: number): number {
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    throw new QuantidadeInvalidaError(quantidade);
  }
  return -quantidade;
}

/**
 * Resolve o delta de uma retirada de fardo a partir do conjunto de fardos
 * cadastrados (Req 3.1.2, 3.1.3). Lança `FardoNaoReconhecidoError` quando o
 * código de barras não corresponde a nenhum fardo — nesse caso o chamador
 * mantém o saldo inalterado.
 */
export function resolverDeltaFardo<T extends FardoRef>(
  fardos: readonly T[],
  codigoBarras: string,
): number {
  const fardo = resolverFardo(fardos, codigoBarras);
  if (!fardo) {
    throw new FardoNaoReconhecidoError(codigoBarras);
  }
  return deltaRetiradaFardo(fardo.quantidadeSacolas);
}

/**
 * Indica se o alerta de estoque baixo deve ser emitido (Req 3.1.5, 3.2.3,
 * 3.3.3): verdadeiro **se e somente se** o saldo for menor ou igual ao limite
 * mínimo configurado.
 */
export function estoqueBaixo(saldo: number, limiteMinimo: number): boolean {
  return saldo <= limiteMinimo;
}

/** Movimento com data, para os cálculos do painel (consumo/entrada por período). */
export interface MovimentoComData {
  delta: number;
  dataHora: Date;
}

/**
 * Resumo de estoque de um insumo para o painel do almoxarifado. Tudo é medido
 * em **quantidade** (unidade base), nunca em R$:
 * - `saldo`: soma de todos os movimentos;
 * - `consumoSemana`/`entradaSemana`: quantidade consumida/recebida nos últimos
 *   7 dias (a partir de `agora`);
 * - `semanasRestantes`: previsão de ruptura = saldo ÷ consumo semanal (null
 *   quando não houve consumo, pois não há base para projetar).
 */
export interface ResumoEstoque {
  saldo: number;
  estoqueBaixo: boolean;
  consumoSemana: number;
  entradaSemana: number;
  semanasRestantes: number | null;
}

const UMA_SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

export function resumoEstoque(
  movimentos: readonly MovimentoComData[],
  limiteMinimo: number,
  agora: Date,
): ResumoEstoque {
  const saldo = calcularSaldo(0, movimentos);
  const inicioSemana = agora.getTime() - UMA_SEMANA_MS;
  let consumoSemana = 0;
  let entradaSemana = 0;
  for (const m of movimentos) {
    if (m.dataHora.getTime() >= inicioSemana) {
      if (m.delta < 0) {
        consumoSemana += -m.delta;
      } else {
        entradaSemana += m.delta;
      }
    }
  }
  const semanasRestantes = consumoSemana > 0 ? saldo / consumoSemana : null;
  return {
    saldo,
    estoqueBaixo: estoqueBaixo(saldo, limiteMinimo),
    consumoSemana,
    entradaSemana,
    semanasRestantes,
  };
}


// ==================== SISTEMA PROATIVO ====================

/**
 * Consumo por dia da semana (0=Dom..6=Sáb).
 * Usado para predicción ponderada y auto-reposição.
 */
export interface ConsumoPorDiaSemana {
  /** Dia da semana (0-6). */
  dia: number;
  /** Consumo médio nesse dia (unidade base). */
  media: number;
  /** Quantidade de amostras usadas na média. */
  amostras: number;
}

/**
 * Calcula o consumo médio por dia da semana, baseado nos últimos N dias de
 * movimentos. Retorna um array de 7 posições (Dom..Sáb).
 */
export function consumoPorDiaSemana(
  movimentos: readonly MovimentoComData[],
  diasHistorico = 28,
  agora: Date = new Date(),
): ConsumoPorDiaSemana[] {
  const limite = agora.getTime() - diasHistorico * 24 * 60 * 60 * 1000;
  const porDia: { total: number; count: number }[] = Array.from({ length: 7 }, () => ({
    total: 0,
    count: 0,
  }));

  // Agrupar consumos por dia do calendário.
  const diasVisto = new Map<string, { dia: number; consumo: number }>();
  for (const m of movimentos) {
    if (m.dataHora.getTime() < limite || m.delta >= 0) continue;
    const key = m.dataHora.toISOString().slice(0, 10);
    const existing = diasVisto.get(key);
    if (existing) {
      existing.consumo += -m.delta;
    } else {
      diasVisto.set(key, { dia: m.dataHora.getUTCDay(), consumo: -m.delta });
    }
  }

  for (const { dia, consumo } of diasVisto.values()) {
    porDia[dia].total += consumo;
    porDia[dia].count += 1;
  }

  return porDia.map((d, i) => ({
    dia: i,
    media: d.count > 0 ? Math.round(d.total / d.count) : 0,
    amostras: d.count,
  }));
}

/**
 * Predicción ponderada de ruptura: calcula cuántos días faltan para que el
 * saldo llegue a cero, usando el consumo medio por día de la semana.
 * Más preciso que la división lineal simple.
 *
 * Retorna null si no hay datos de consumo.
 */
export function predicaoRuptura(
  saldo: number,
  consumoDiaSemana: ConsumoPorDiaSemana[],
  agora: Date = new Date(),
): number | null {
  const consumoMedioGeral =
    consumoDiaSemana.reduce((acc, d) => acc + d.media, 0) / 7;
  if (consumoMedioGeral <= 0) return null;

  let restante = saldo;
  let dias = 0;
  const maxDias = 365; // Limite para evitar loop infinito.

  while (restante > 0 && dias < maxDias) {
    const diaFuturo = new Date(agora.getTime() + dias * 24 * 60 * 60 * 1000);
    const diaSem = diaFuturo.getUTCDay();
    const consumoHoje = consumoDiaSemana[diaSem].media || consumoMedioGeral;
    restante -= consumoHoje;
    dias++;
  }

  return dias;
}

/**
 * Calcula a quantidade ideal de reposição (auto-reposição):
 * - Objetivo: manter estoque para N semanas de operação.
 * - Fórmula: (consumo semanal médio × semanas) - saldo atual.
 * - Arredondado para cima em embalagens inteiras.
 */
export function quantidadeReposicao(
  saldoAtual: number,
  consumoSemanal: number,
  semanasCobertura = 2,
  fatorEmbalagem = 1,
): number {
  if (consumoSemanal <= 0) return 0;
  const necessario = consumoSemanal * semanasCobertura;
  const deficit = necessario - saldoAtual;
  if (deficit <= 0) return 0;
  // Arredondar para cima em embalagens inteiras.
  return Math.ceil(deficit / fatorEmbalagem);
}

/**
 * Nível de urgência do estoque para UI (semáforo inteligente).
 * - CRITICO: saldo <= limiteMinimo (vai faltar muito em breve)
 * - ATENCAO: saldo <= 2× limiteMinimo (precisa repor em breve)
 * - OK: saldo está confortável
 */
export type NivelEstoque = 'CRITICO' | 'ATENCAO' | 'OK';

export function nivelEstoque(saldo: number, limiteMinimo: number): NivelEstoque {
  if (saldo <= limiteMinimo) return 'CRITICO';
  if (saldo <= limiteMinimo * 2) return 'ATENCAO';
  return 'OK';
}

/**
 * Resumo proativo de estoque (evolução do ResumoEstoque original).
 * Adiciona: predicción ponderada, nivel de urgencia, sugestão de reposição.
 */
export interface ResumoProativo extends ResumoEstoque {
  /** Dias estimados até ruptura (predicción ponderada por dia de semana). */
  diasAteRuptura: number | null;
  /** Nível de urgência: CRITICO, ATENCAO, OK. */
  nivel: NivelEstoque;
  /** Quantidade sugerida de reposição (em embalagens). */
  sugestaoReposicao: number;
  /** Consumo médio por dia da semana (últimos 28 dias). */
  consumoDiaSemana: ConsumoPorDiaSemana[];
}

export function resumoProativo(
  movimentos: readonly MovimentoComData[],
  limiteMinimo: number,
  fatorEmbalagem: number,
  agora: Date = new Date(),
): ResumoProativo {
  const base = resumoEstoque(movimentos, limiteMinimo, agora);
  const consumoDiaSemana = consumoPorDiaSemana(movimentos, 28, agora);
  const diasAteRuptura = predicaoRuptura(base.saldo, consumoDiaSemana, agora);
  const nivel = nivelEstoque(base.saldo, limiteMinimo);
  const sugestaoReposicao = quantidadeReposicao(
    base.saldo,
    base.consumoSemana,
    2,
    fatorEmbalagem,
  );

  return {
    ...base,
    diasAteRuptura,
    nivel,
    sugestaoReposicao,
    consumoDiaSemana,
  };
}
