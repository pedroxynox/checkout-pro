import { HttpStatus } from '@nestjs/common';

/**
 * Base de todos os erros de domínio (puros, lançados pelos serviços). Cada erro
 * declara o próprio status HTTP em `statusHttp`, e o filtro global o utiliza —
 * eliminando o mapa central manual (e o risco de um erro novo cair em 500 por
 * esquecimento). O default 400 é um fallback seguro caso um erro não declare.
 */
export abstract class ErroDominio extends Error {
  readonly statusHttp: HttpStatus = HttpStatus.BAD_REQUEST;
  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
  }
}
