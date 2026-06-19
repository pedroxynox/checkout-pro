import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Perfil } from '../../acessos/acessos.domain';
import { PUBLICO_KEY } from '../decorators/publico.decorator';
import { UsuarioAutenticado } from '../decorators/usuario-atual.decorator';

/**
 * Guard de autenticação (Req 7.1). Exige um token JWT válido no cabeçalho
 * `Authorization: Bearer <token>`, valida sua assinatura e anexa a identidade
 * do usuário (`request.usuario`) para uso pelo `PerfilGuard` e pelos
 * controllers. Rotas marcadas com `@Publico()` (ex.: login) são liberadas.
 *
 * As mensagens de erro são em Português, conforme o padrão do produto.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const publico = this.reflector.getAllAndOverride<boolean>(PUBLICO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (publico) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      usuario?: UsuarioAutenticado;
    }>();

    const token = this.extrairToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException(
        'Autenticação necessária. Informe um token de acesso válido.',
      );
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        login: string;
        nome?: string | null;
        perfil: Perfil;
      }>(token);
      request.usuario = {
        sub: payload.sub,
        login: payload.login,
        nome: payload.nome ?? null,
        perfil: payload.perfil,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Token de acesso inválido ou expirado.');
    }
  }

  /** Extrai o token do cabeçalho "Bearer <token>"; retorna null se ausente. */
  private extrairToken(authorization?: string): string | null {
    if (!authorization) {
      return null;
    }
    const [tipo, valor] = authorization.split(' ');
    return tipo === 'Bearer' && valor ? valor : null;
  }
}
