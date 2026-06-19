/**
 * Erros de domínio tipados do Modulo_Usuarios (gestão de pessoas/acessos).
 * Mapeados para status HTTP pelo DominioExceptionFilter.
 */
export abstract class UsuariosError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Matrícula (login) já utilizada por outro usuário (Req 7.1.4/7.1.6). */
export class MatriculaDuplicadaError extends UsuariosError {
  constructor(matricula?: string) {
    super(
      matricula
        ? `Já existe um usuário com a matrícula "${matricula}".`
        : 'Já existe um usuário com esta matrícula.',
    );
  }
}

/** Usuário não encontrado pelo id informado. */
export class UsuarioNaoEncontradoError extends UsuariosError {
  constructor() {
    super('Usuário não encontrado.');
  }
}

/** Operação não permitida (ex.: excluir o próprio usuário). */
export class OperacaoInvalidaError extends UsuariosError {
  constructor(mensagem: string) {
    super(mensagem);
  }
}
