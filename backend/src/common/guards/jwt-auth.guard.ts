import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Perfil } from '../../acessos/acessos.domain';
import { PrismaService } from '../../prisma/prisma.service';
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
    private readonly prisma: PrismaService,
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

    let payload: {
      sub: string;
      login: string;
      nome?: string | null;
      perfil: Perfil;
      tokenVersion?: number;
    };
    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Token de acesso inválido ou expirado.');
    }

    // Verificação de revogação: comparada FORA do try/catch acima para que a
    // UnauthorizedException de "sessão expirada" não seja remapeada para
    // "token inválido". Uma leitura por PK (indexada) por requisição — na mesma
    // consulta trazemos os ajustes de permissão por login (Central de
    // Permissões), sem custo de round-trip adicional.
    const [usuario, perfilOverrides] = await Promise.all([
      this.prisma.usuario.findUnique({
        where: { id: payload.sub },
        select: {
          tokenVersion: true,
          permissoes: { select: { funcionalidade: true, concedida: true } },
        },
      }),
      // Ajustes do PADRÃO do perfil (Central de Permissões). Tabela minúscula e
      // indexada por perfil; consulta barata feita em paralelo.
      this.prisma.perfilPermissao.findMany({
        where: { perfil: payload.perfil },
        select: { funcionalidade: true, concedida: true },
      }),
    ]);
    // Rejeita se o usuário foi removido ou se o token foi revogado
    // (versão diferente da atual — ex.: após redefinição de senha ou mudança
    // de permissões). Tokens antigos sem `tokenVersion` são tratados como 0.
    if (!usuario || usuario.tokenVersion !== (payload.tokenVersion ?? 0)) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    request.usuario = {
      sub: payload.sub,
      login: payload.login,
      nome: payload.nome ?? null,
      perfil: payload.perfil,
      permissoesOverrides: usuario.permissoes,
      perfilOverrides,
    };
    return true;
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
