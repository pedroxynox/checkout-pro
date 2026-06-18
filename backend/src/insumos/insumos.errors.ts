/**
 * Erros de domínio tipados do Modulo_Insumos. São erros puros (sem dependência
 * do Nest ou do banco) para manter a lógica de domínio testável de forma
 * isolada.
 */

/** Classe base para os erros de domínio do controle de insumos. */
export abstract class InsumosError extends Error {
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
  constructor(quantidade?: number) {
    super(
      quantidade !== undefined
        ? `Quantidade inválida (${quantidade}). Informe um inteiro maior que zero.`
        : 'Quantidade inválida. Informe um inteiro maior que zero.',
    );
  }
}
