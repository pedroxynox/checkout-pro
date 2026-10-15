/**
 * Erros de domínio tipados do Feedforward. São erros puros (sem dependência do
 * banco) para manter as regras testáveis de forma isolada; o filtro global os
 * traduz para a resposta HTTP usando o `statusHttp` de cada um.
 */
import { HttpStatus } from '@nestjs/common';
import { ErroDominio } from '../common/errors/erro-dominio';

/** Classe base para os erros de domínio do feedforward. */
export abstract class FeedforwardError extends ErroDominio {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Lançado ao tentar alterar (editar, prorrogar ou remover) um ponto que já foi
 * revisado. O resultado registrado é histórico e não muda.
 */
export class PontoJaRevisadoError extends FeedforwardError {
  readonly statusHttp = HttpStatus.CONFLICT;
  constructor() {
    super(
      'Este ponto já foi revisado (atingido ou não atingido) e não pode mais ser alterado.',
    );
  }
}

/** Lançado quando o novo prazo de uma prorrogação não é válido. */
export class ProrrogacaoInvalidaError extends FeedforwardError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
}
