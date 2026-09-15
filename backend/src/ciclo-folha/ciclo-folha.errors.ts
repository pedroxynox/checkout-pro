import { HttpStatus } from '@nestjs/common';
import { ErroDominio } from '../common/errors/erro-dominio';

/**
 * O ciclo de folha que contém a data (ou algum dos ciclos tocados por um
 * período) está FECHADO — modificações ordinárias (registrar/corrigir/excluir
 * batida, lançar atestado ou ausência a prazo) ficam bloqueadas até uma
 * reabertura autorizada.
 *
 * Recebe opcionalmente os rótulos dos ciclos fechados: num período longo, que
 * pode atravessar o corte 26→25, dizer QUAL ciclo trava a operação é a diferença
 * entre um erro acionável e um "está fechado" sem pista de onde mexer.
 */
export class CicloFechadoError extends ErroDominio {
  readonly statusHttp = HttpStatus.CONFLICT;

  constructor(ciclosFechados: readonly string[] = []) {
    super(CicloFechadoError.montarMensagem(ciclosFechados));
  }

  private static montarMensagem(ciclos: readonly string[]): string {
    if (ciclos.length === 0) {
      return 'O ciclo de folha deste período está fechado. Reabra o ciclo (com autorização) antes de alterar.';
    }
    if (ciclos.length === 1) {
      return `O ciclo de folha ${ciclos[0]} está fechado. Reabra o ciclo (com autorização) antes de alterar.`;
    }
    return `Estes ciclos de folha estão fechados: ${ciclos.join(' e ')}. Reabra-os (com autorização) antes de alterar.`;
  }
}

/** Só é possível reabrir um ciclo que esteja fechado. */
export class CicloNaoFechadoError extends ErroDominio {
  readonly statusHttp = HttpStatus.CONFLICT;

  constructor() {
    super('Este ciclo não está fechado.');
  }
}
