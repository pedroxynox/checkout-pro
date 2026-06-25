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

/** Colaborador inexistente. */
export class ColaboradorNaoEncontradoError extends ColaboradoresError {
  constructor() {
    super('Colaborador não encontrado.');
  }
}
