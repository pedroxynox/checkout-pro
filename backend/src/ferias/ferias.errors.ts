/**
 * Erros de domínio tipados do módulo de Férias. Erros puros (sem Nest/Prisma);
 * a camada de API os mapeia para a resposta HTTP pelo `statusHttp`.
 */
import { HttpStatus } from '@nestjs/common';
import { ErroDominio } from '../common/errors/erro-dominio';

/** Classe base para os erros de domínio das férias. */
export abstract class FeriasError extends ErroDominio {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Período inválido (data final antes da inicial ou longo demais). */
export class PeriodoFeriasInvalidoError extends FeriasError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor(mensagem = 'Período de férias inválido.') {
    super(mensagem);
  }
}

/** O novo período se sobrepõe a férias já cadastradas do colaborador. */
export class FeriasSobrepostaError extends FeriasError {
  readonly statusHttp = HttpStatus.CONFLICT;
  constructor(
    mensagem = 'Já existem férias cadastradas que se sobrepõem a este período.',
  ) {
    super(mensagem);
  }
}

/** As férias informadas (para remover) não existem. */
export class FeriasNaoEncontradaError extends FeriasError {
  readonly statusHttp = HttpStatus.NOT_FOUND;
  constructor(mensagem = 'Férias não encontradas.') {
    super(mensagem);
  }
}

/** O colaborador informado não existe. */
export class ColaboradorFeriasNaoEncontradoError extends FeriasError {
  readonly statusHttp = HttpStatus.NOT_FOUND;
  constructor(mensagem = 'Colaborador não encontrado.') {
    super(mensagem);
  }
}
