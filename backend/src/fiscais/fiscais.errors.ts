/**
 * Erros de domínio do Modulo_Fiscais. Puros (sem dependência do Nest); são
 * traduzidos para HTTP pelo filtro global de exceções. Cada erro declara o
 * próprio status HTTP em `statusHttp`.
 */
import { HttpStatus } from '@nestjs/common';
import { ErroDominio } from '../common/errors/erro-dominio';

/** Status informado não pertence ao conjunto válido de status de fiscal. */
export class StatusInvalidoError extends ErroDominio {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor(status: string) {
    super(`Status inválido: ${status}.`);
  }
}

/** O usuário autenticado não está vinculado a um fiscal. */
export class FiscalNaoEncontradoError extends ErroDominio {
  readonly statusHttp = HttpStatus.NOT_FOUND;
  constructor() {
    super('Seu usuário não está vinculado a um fiscal.');
  }
}

/** O fiscal já possui registros de ponto hoje — não pode marcar falta. */
export class JaIniciouJornadaError extends ErroDominio {
  readonly statusHttp = HttpStatus.CONFLICT;
  constructor() {
    super('Você já iniciou a jornada hoje. Não é possível informar falta.');
  }
}

/** O fiscal já marcou falta hoje — não pode registrar ponto. */
export class FaltaRegistradaError extends ErroDominio {
  readonly statusHttp = HttpStatus.CONFLICT;
  constructor() {
    super('Você já informou falta hoje. Não é possível registrar ponto.');
  }
}

/** O fiscal está de folga hoje — não pode registrar ponto nem falta. */
export class FiscalDeFolgaError extends ErroDominio {
  readonly statusHttp = HttpStatus.CONFLICT;
  constructor() {
    super('Hoje é seu dia de folga. Não é possível registrar ponto ou falta.');
  }
}
