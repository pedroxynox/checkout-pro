/**
 * Erros de domínio tipados do módulo de Atestados. Puros (sem Nest/Prisma); a
 * camada HTTP os mapeia via `DominioExceptionFilter` usando `statusHttp`.
 */
import { HttpStatus } from '@nestjs/common';
import { ErroDominio } from '../common/errors/erro-dominio';

/** Classe base dos erros do módulo de atestados. */
export abstract class AtestadosError extends ErroDominio {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Período do atestado inválido (fim antes do início ou longo demais). */
export class PeriodoAtestadoInvalidoError extends AtestadosError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor(mensagem = 'Período do atestado inválido.') {
    super(mensagem);
  }
}

/** CID não informado e o atestado não foi marcado explicitamente "sem CID". */
export class CidObrigatorioError extends AtestadosError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor(
    mensagem = 'Informe o CID do atestado ou marque explicitamente "sem CID".',
  ) {
    super(mensagem);
  }
}

/** Atestado não encontrado (para consultar/remover). */
export class AtestadoNaoEncontradoError extends AtestadosError {
  readonly statusHttp = HttpStatus.NOT_FOUND;
  constructor(mensagem = 'Atestado não encontrado.') {
    super(mensagem);
  }
}
