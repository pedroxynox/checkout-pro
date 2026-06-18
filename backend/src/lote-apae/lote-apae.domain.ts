/**
 * Lógica de domínio **pura** do ciclo de Lote de Sacolas APAE.
 *
 * Concentra o cálculo da quantidade vendida e do percentual vendido
 * (Req 2.6.2, 2.6.3), a validação de atualização de saldo (Req 2.6.4) e a
 * regra de reinício de lote preservando o histórico (Req 2.6.5, 2.6.6).
 *
 * Por serem puras e determinísticas, podem ser exercitadas por testes de
 * propriedade (fast-check) sem qualquer infraestrutura.
 */

import {
  QuantidadeInicialInvalidaError,
  SaldoInvalidoError,
} from './lote-apae.errors';

export type StatusLote = 'ABERTO' | 'ENCERRADO';

/** Estado de um lote de sacolas APAE. */
export interface LoteApaeEstado {
  quantidadeInicial: number;
  saldoAtual: number;
  quantidadeVendida: number;
  dataInicio: Date;
  dataEncerramento: Date | null;
  status: StatusLote;
}

/**
 * Calcula a quantidade total vendida de um lote (Req 2.6.2): a diferença entre
 * a quantidade inicial e o saldo atual.
 */
export function calcularQuantidadeVendida(
  quantidadeInicial: number,
  saldoAtual: number,
): number {
  return quantidadeInicial - saldoAtual;
}

/**
 * Calcula o percentual vendido do lote (Req 2.6.3): quantidade total vendida
 * dividida pela quantidade inicial, sempre no intervalo [0, 1]. Quando a
 * quantidade inicial é zero (sem denominador), retorna 0.
 */
export function calcularPercentualVendido(
  quantidadeInicial: number,
  quantidadeVendida: number,
): number {
  if (quantidadeInicial <= 0) {
    return 0;
  }
  const p = quantidadeVendida / quantidadeInicial;
  if (p < 0) {
    return 0;
  }
  if (p > 1) {
    return 1;
  }
  return p;
}

/**
 * Indica se uma atualização de saldo é válida (Req 2.6.4): o saldo atual não
 * pode ser maior que o saldo anterior e não pode ser negativo.
 */
export function atualizacaoSaldoValida(
  saldoAnterior: number,
  saldoAtual: number,
): boolean {
  return saldoAtual >= 0 && saldoAtual <= saldoAnterior;
}

/**
 * Cria o estado inicial de um lote (Req 2.6.1): saldo igual à quantidade
 * inicial, nada vendido, status ABERTO. Lança
 * `QuantidadeInicialInvalidaError` para quantidade inválida.
 */
export function criarLote(
  quantidadeInicial: number,
  dataInicio: Date,
): LoteApaeEstado {
  if (!Number.isInteger(quantidadeInicial) || quantidadeInicial < 0) {
    throw new QuantidadeInicialInvalidaError(quantidadeInicial);
  }
  return {
    quantidadeInicial,
    saldoAtual: quantidadeInicial,
    quantidadeVendida: 0,
    dataInicio,
    dataEncerramento: null,
    status: 'ABERTO',
  };
}

/**
 * Aplica uma atualização de saldo a um lote aberto (Req 2.6.2, 2.6.3). Retorna
 * um **novo** estado com o saldo atualizado e a quantidade vendida recalculada
 * (`quantidadeInicial - saldoAtual`). Não muta o lote original. Rejeita
 * atualizações inválidas lançando `SaldoInvalidoError` (Req 2.6.4) — nesse caso
 * o chamador mantém o lote inalterado.
 */
export function atualizarSaldo(
  lote: LoteApaeEstado,
  novoSaldo: number,
): LoteApaeEstado {
  if (!atualizacaoSaldoValida(lote.saldoAtual, novoSaldo)) {
    throw new SaldoInvalidoError(novoSaldo, lote.saldoAtual);
  }
  return {
    ...lote,
    saldoAtual: novoSaldo,
    quantidadeVendida: calcularQuantidadeVendida(
      lote.quantidadeInicial,
      novoSaldo,
    ),
  };
}

/**
 * Reinicia o ciclo de lote (Req 2.6.5, 2.6.6): encerra o lote atual preservando
 * a quantidade inicial, a quantidade total vendida e as datas de início e
 * encerramento, e inicia um novo lote com a quantidade vendida zerada.
 *
 * @param lote lote atual a ser encerrado.
 * @param dataEncerramento data/hora do encerramento do lote atual.
 * @param novaQuantidadeInicial quantidade inicial do novo lote recebido.
 * @param dataInicioNovo data de início do novo lote.
 */
export function reiniciarLote(
  lote: LoteApaeEstado,
  dataEncerramento: Date,
  novaQuantidadeInicial: number,
  dataInicioNovo: Date,
): { encerrado: LoteApaeEstado; novo: LoteApaeEstado } {
  const encerrado: LoteApaeEstado = {
    ...lote,
    // Congela a quantidade total vendida do lote no momento do encerramento.
    quantidadeVendida: calcularQuantidadeVendida(
      lote.quantidadeInicial,
      lote.saldoAtual,
    ),
    dataEncerramento,
    status: 'ENCERRADO',
  };
  const novo = criarLote(novaQuantidadeInicial, dataInicioNovo);
  return { encerrado, novo };
}
