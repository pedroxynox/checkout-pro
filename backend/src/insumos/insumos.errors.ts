/**
 * Erros de domínio tipados do Modulo_Insumos. São erros puros (sem dependência
 * do Nest ou do banco) para manter a lógica de domínio testável de forma
 * isolada.
 */
import { HttpStatus } from '@nestjs/common';
import { ErroDominio } from '../common/errors/erro-dominio';

/** Classe base para os erros de domínio do controle de insumos. */
export abstract class InsumosError extends ErroDominio {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Lançado quando o código de barras escaneado não corresponde a um fardo
 * cadastrado — Requisito 3.1.3. O registro é rejeitado e o saldo de estoque
 * permanece inalterado.
 */
export class FardoNaoReconhecidoError extends InsumosError {
  readonly statusHttp = HttpStatus.NOT_FOUND;
  constructor(codigoBarras?: string) {
    super(
      codigoBarras !== undefined
        ? `Fardo não reconhecido para o código de barras "${codigoBarras}".`
        : 'Fardo não reconhecido.',
    );
  }
}

/**
 * Lançado quando a quantidade informada para uma retirada/consumo é inválida
 * (não inteira ou menor ou igual a zero).
 */
export class QuantidadeInvalidaError extends InsumosError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor(quantidade?: number) {
    super(
      quantidade !== undefined
        ? `Quantidade inválida (${quantidade}). Informe um inteiro maior que zero.`
        : 'Quantidade inválida. Informe um inteiro maior que zero.',
    );
  }
}

/**
 * Lançado quando um consumo/retirada excederia o saldo disponível — não se
 * pode registrar a saída de um insumo que não existe em estoque. Mantém o
 * saldo inalterado (a operação é rejeitada). Consumir exatamente o saldo
 * (deixando 0) é permitido; só o que passaria a negativo é bloqueado.
 */
export class EstoqueInsuficienteError extends InsumosError {
  readonly statusHttp = HttpStatus.CONFLICT;
  constructor(saldoAtual?: number, solicitado?: number, unidade?: string) {
    const u = unidade ? ` ${unidade}${(solicitado ?? 0) === 1 ? '' : 's'}` : '';
    super(
      saldoAtual !== undefined && solicitado !== undefined
        ? `Estoque insuficiente: há ${saldoAtual}${u} em estoque e foram solicitados ${solicitado}${u}. Não é possível registrar consumo além do disponível.`
        : 'Estoque insuficiente para registrar o consumo.',
    );
  }
}
