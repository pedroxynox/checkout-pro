/**
 * Erros de domínio do Cadastro Unificado de Colaboradores.
 *
 * Puros (sem Nest/Prisma) para manter a lógica testável. O
 * `DominioExceptionFilter` mapeia cada um para o status HTTP adequado.
 */
export abstract class ColaboradoresError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Matrícula (registro) já usada por outro colaborador. */
export class MatriculaColaboradorDuplicadaError extends ColaboradoresError {
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
  constructor() {
    super('Esta conta de acesso já está vinculada a outro colaborador.');
  }
}

/** Falta a senha de acesso ao criar fiscal/supervisor/gerente. */
export class SenhaAcessoObrigatoriaError extends ColaboradoresError {
  constructor() {
    super(
      'Defina uma senha de acesso (mínimo 4 caracteres) para fiscal, supervisor ou gerente.',
    );
  }
}

/** A matrícula já está em uso como login de outra conta de acesso. */
export class ContaAcessoExistenteError extends ColaboradoresError {
  constructor() {
    super('Já existe uma conta de acesso com esta matrícula.');
  }
}

/** Conta de acesso (login do app) informada não existe. */
export class LoginAppInexistenteError extends ColaboradoresError {
  constructor() {
    super('A conta de acesso informada não existe.');
  }
}

/** Colaborador inexistente. */
export class ColaboradorNaoEncontradoError extends ColaboradoresError {
  constructor() {
    super('Colaborador não encontrado.');
  }
}
