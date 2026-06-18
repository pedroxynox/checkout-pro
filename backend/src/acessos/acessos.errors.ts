/**
 * Erros de domínio tipados do Modulo_Acessos.
 *
 * São erros puros (sem dependência do Nest ou do banco) para que a lógica de
 * domínio permaneça testável de forma isolada. A camada de API mapeará cada um
 * deles para a resposta HTTP apropriada (Tarefa 13).
 */

/** Classe base para os erros de domínio do módulo de acessos. */
export abstract class AcessosError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
    // Mantém a cadeia de protótipos correta ao estender Error em TS/ES5+.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Lançado quando as credenciais informadas não correspondem a um usuário
 * cadastrado (login inexistente ou senha incorreta) — Requisito 7.1.3.
 */
export class CredenciaisInvalidasError extends AcessosError {
  constructor(mensagem = 'Credenciais inválidas.') {
    super(mensagem);
  }
}

/**
 * Lançado quando um usuário com perfil de fiscal tenta acessar uma
 * funcionalidade restrita ao perfil de gerente — Requisito 7.2.4.
 */
export class PermissaoInsuficienteError extends AcessosError {
  constructor(
    mensagem = 'Permissão insuficiente para acessar esta funcionalidade.',
  ) {
    super(mensagem);
  }
}
