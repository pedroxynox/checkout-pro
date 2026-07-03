/**
 * Erros de domínio tipados do ciclo de Lote de Sacolas APAE. São erros puros
 * (sem dependência do Nest ou do banco) para manter a lógica de domínio
 * testável de forma isolada.
 */
import { HttpStatus } from '@nestjs/common';
import { ErroDominio } from '../common/errors/erro-dominio';

/** Classe base para os erros de domínio do lote de sacolas APAE. */
export abstract class LoteApaeError extends ErroDominio {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Lançado quando o saldo atual informado é maior que o saldo anterior do lote
 * — Requisito 2.6.4. A atualização é rejeitada e o lote permanece inalterado.
 */
export class SaldoInvalidoError extends LoteApaeError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor(saldoAtual?: number, saldoAnterior?: number) {
    super(
      saldoAtual !== undefined && saldoAnterior !== undefined
        ? `Saldo atual (${saldoAtual}) não pode ser maior que o saldo anterior (${saldoAnterior}).`
        : 'O saldo atual não pode ser maior que o saldo anterior.',
    );
  }
}

/**
 * Lançado quando a quantidade inicial informada para um lote é inválida
 * (não inteira ou menor que zero).
 */
export class QuantidadeInicialInvalidaError extends LoteApaeError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor(quantidade?: number) {
    super(
      quantidade !== undefined
        ? `Quantidade inicial inválida (${quantidade}). Informe um inteiro maior ou igual a zero.`
        : 'Quantidade inicial inválida. Informe um inteiro maior ou igual a zero.',
    );
  }
}
