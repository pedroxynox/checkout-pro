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
