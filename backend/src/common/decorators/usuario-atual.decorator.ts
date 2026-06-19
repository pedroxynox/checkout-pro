import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Perfil } from '../../acessos/acessos.domain';

/**
 * Identidade do usuário autenticado, extraída do token JWT pelo
 * `JwtAuthGuard` e anexada à requisição.
 */
export interface UsuarioAutenticado {
  sub: string;
  login: string;
  nome?: string | null;
  perfil: Perfil;
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
