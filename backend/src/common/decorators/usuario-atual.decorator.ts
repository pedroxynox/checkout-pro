import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { OverridePermissao, Perfil } from '../../acessos/acessos.domain';

/**
 * Identidade do usuário autenticado, extraída do token JWT pelo
 * `JwtAuthGuard` e anexada à requisição.
 */
export interface UsuarioAutenticado {
  sub: string;
  login: string;
  nome?: string | null;
  perfil: Perfil;
  /**
   * Ajustes de permissão por login (Central de Permissões), carregados pelo
   * `JwtAuthGuard` a partir do banco. Ausente/vazio = usa o padrão do perfil.
   */
  permissoesOverrides?: OverridePermissao[];
  /**
   * Ajustes do PADRÃO do perfil (Central de Permissões ▸ Padrões por perfil),
   * carregados pelo `JwtAuthGuard`. Aplicados antes dos ajustes por login.
   */
  perfilOverrides?: OverridePermissao[];
}

/**
 * Decorator de parâmetro que injeta a identidade do usuário autenticado
 * (preenchida pelo `JwtAuthGuard`) no handler do controller.
 */
export const UsuarioAtual = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UsuarioAutenticado | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ usuario?: UsuarioAutenticado }>();
    return request.usuario;
  },
);
