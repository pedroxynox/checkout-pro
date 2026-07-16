/**
 * Erros de domínio da Central de Permissões. Cada um declara o próprio
 * `statusHttp`; o filtro global de exceções os mapeia para a resposta HTTP.
 */
import { HttpStatus } from '@nestjs/common';
import { ErroDominio } from '../common/errors/erro-dominio';

export abstract class PermissoesError extends ErroDominio {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Usuário-alvo não encontrado. */
export class UsuarioPermissaoNaoEncontradoError extends PermissoesError {
  readonly statusHttp = HttpStatus.NOT_FOUND;
  constructor(mensagem = 'Usuário não encontrado.') {
    super(mensagem);
  }
}

/** Tentativa de ajustar as permissões do ADMINISTRADOR (acesso total imutável). */
export class UsuarioPermissaoAdminError extends PermissoesError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor(
    mensagem = 'O Administrador tem acesso total e não pode ser ajustado.',
  ) {
    super(mensagem);
  }
}

/** Funcionalidade inexistente ou protegida (não ajustável por login). */
export class AjustePermissaoInvalidoError extends PermissoesError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor(funcionalidade: string) {
    super(
      `A funcionalidade "${funcionalidade}" não pode ser ajustada por este painel.`,
    );
  }
}

/** Perfil cujo padrão não é editável (ADMINISTRADOR/IMPORTADOR ou inválido). */
export class PerfilNaoAjustavelError extends PermissoesError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor(perfil: string) {
    super(`O padrão do perfil "${perfil}" não pode ser ajustado.`);
  }
}
