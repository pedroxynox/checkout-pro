import { HttpStatus } from '@nestjs/common';
import { ErroDominio } from '../common/errors/erro-dominio';

/**
 * O ciclo de folha que contém a data está FECHADO — modificações ordinárias
 * (registrar/corrigir/excluir batida, marcar débito) ficam bloqueadas até uma
 * reabertura autorizada.
 */
export class CicloFechadoError extends ErroDominio {
  readonly statusHttp = HttpStatus.CONFLICT;

  constructor() {
    super(
      'O ciclo de folha deste período está fechado. Reabra o ciclo (com autorização) antes de alterar.',
    );
  }
}

/** Só é possível reabrir um ciclo que esteja fechado. */
export class CicloNaoFechadoError extends ErroDominio {
  readonly statusHttp = HttpStatus.CONFLICT;

  constructor() {
    super('Este ciclo não está fechado.');
  }
}
