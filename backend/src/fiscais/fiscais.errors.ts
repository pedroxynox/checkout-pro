/**
 * Erros de domínio do Modulo_Fiscais. Puros (sem dependência do Nest); são
 * traduzidos para HTTP pelo filtro global de exceções.
 */

/** Status informado não pertence ao conjunto válido de status de fiscal. */
export class StatusInvalidoError extends Error {
  constructor(status: string) {
    super(`Status inválido: ${status}.`);
    this.name = 'StatusInvalidoError';
  }
}

/** O usuário autenticado não está vinculado a um fiscal. */
export class FiscalNaoEncontradoError extends Error {
  constructor() {
    super('Seu usuário não está vinculado a um fiscal.');
    this.name = 'FiscalNaoEncontradoError';
  }
}
