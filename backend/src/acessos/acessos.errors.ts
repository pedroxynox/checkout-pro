/**
 * Erros de domínio tipados do Modulo_Acessos.
 *
 * São erros puros (sem dependência do Nest ou do banco) para que a lógica de
 * domínio permaneça testável de forma isolada. A camada de API mapeará cada um
 * deles para a resposta HTTP apropriada (Tarefa 13).
 */
import { HttpStatus } from '@nestjs/common';
import { ErroDominio } from '../common/errors/erro-dominio';

/** Classe base para os erros de domínio do módulo de acessos. */
export abstract class AcessosError extends ErroDominio {
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
  readonly statusHttp = HttpStatus.UNAUTHORIZED;
  constructor(mensagem = 'Credenciais inválidas.') {
    super(mensagem);
  }
}

/**
 * Lançado quando um usuário com perfil de fiscal tenta acessar uma
 * funcionalidade restrita ao perfil de gerente — Requisito 7.2.4.
 */
export class PermissaoInsuficienteError extends AcessosError {
  readonly statusHttp = HttpStatus.FORBIDDEN;
  constructor(
    mensagem = 'Permissão insuficiente para acessar esta funcionalidade.',
  ) {
    super(mensagem);
  }
}


/**
 * Lançado quando o login existe e a senha está certa, mas a **ficha** ligada a
 * ele já não dá acesso ao app: a pessoa foi desligada (`ativo = false`) ou passou
 * a uma função sem acesso (operador) — ADR 0023.
 *
 * É um erro à parte, e não `CredenciaisInvalidasError`, de propósito. "Credenciais
 * inválidas" mandaria a pessoa tentar a senha de novo e mandaria o gestor procurar
 * um problema que não existe; o que aconteceu foi uma decisão de cadastro, e a
 * mensagem tem de dizer isso. Vale a contrapartida de revelar que o login existe:
 * quem tenta entrar é alguém que já teve acesso e sabe disso, e o gestor que
 * investiga "por que ele não entra?" precisa da resposta.
 */
export class AcessoRevogadoError extends AcessosError {
  readonly statusHttp = HttpStatus.UNAUTHORIZED;
  constructor(
    mensagem = 'Este acesso foi encerrado. Fale com a gerência: a função ou a situação do cadastro não dá mais entrada no app.',
  ) {
    super(mensagem);
  }
}
