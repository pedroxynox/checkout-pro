/**
 * Erros de domínio do Cadastro Unificado de Colaboradores.
 *
 * Puros (sem Nest/Prisma) para manter a lógica testável. O
 * `DominioExceptionFilter` mapeia cada um para o status HTTP adequado.
 */
import { HttpStatus } from '@nestjs/common';
import { ErroDominio } from '../common/errors/erro-dominio';

export abstract class ColaboradoresError extends ErroDominio {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Matrícula (registro) já usada por outro colaborador. */
export class MatriculaColaboradorDuplicadaError extends ColaboradoresError {
  readonly statusHttp = HttpStatus.CONFLICT;
  constructor(matricula?: string) {
    super(
      matricula
        ? `Já existe um colaborador com a matrícula "${matricula}".`
        : 'Já existe um colaborador com esta matrícula.',
    );
  }
}

/** Login/código de operador já vinculado a outro colaborador. */
export class LoginColaboradorDuplicadoError extends ColaboradoresError {
  readonly statusHttp = HttpStatus.CONFLICT;
  constructor(login?: string) {
    super(
      login
        ? `O login "${login}" já está vinculado a outro colaborador.`
        : 'Este login já está vinculado a outro colaborador.',
    );
  }
}

/** Conta de acesso (login do app) já vinculada a outro colaborador. */
export class LoginAppDuplicadoError extends ColaboradoresError {
  readonly statusHttp = HttpStatus.CONFLICT;
  constructor() {
    super('Esta conta de acesso já está vinculada a outro colaborador.');
  }
}

/** Falta a senha de acesso ao criar fiscal/supervisor/gerente. */
export class SenhaAcessoObrigatoriaError extends ColaboradoresError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor() {
    super(
      'Defina uma senha de acesso (mínimo 6 caracteres) para fiscal, supervisor ou gerente.',
    );
  }
}

/** A matrícula já está em uso como login de outra conta de acesso. */
export class ContaAcessoExistenteError extends ColaboradoresError {
  readonly statusHttp = HttpStatus.CONFLICT;
  constructor() {
    super('Já existe uma conta de acesso com esta matrícula.');
  }
}

/** Conta de acesso (login do app) informada não existe. */
export class LoginAppInexistenteError extends ColaboradoresError {
  readonly statusHttp = HttpStatus.NOT_FOUND;
  constructor() {
    super('A conta de acesso informada não existe.');
  }
}

/** Colaborador inexistente. */
export class ColaboradorNaoEncontradoError extends ColaboradoresError {
  readonly statusHttp = HttpStatus.NOT_FOUND;
  constructor() {
    super('Colaborador não encontrado.');
  }
}
