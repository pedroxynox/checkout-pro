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

/** O fiscal já possui registros de ponto hoje — não pode marcar falta. */
export class JaIniciouJornadaError extends Error {
  constructor() {
    super('Você já iniciou a jornada hoje. Não é possível informar falta.');
    this.name = 'JaIniciouJornadaError';
  }
}

/** O fiscal já marcou falta hoje — não pode registrar ponto. */
export class FaltaRegistradaError extends Error {
  constructor() {
    super('Você já informou falta hoje. Não é possível registrar ponto.');
    this.name = 'FaltaRegistradaError';
  }
}
