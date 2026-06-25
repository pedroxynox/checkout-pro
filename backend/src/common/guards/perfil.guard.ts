import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AcessosService } from '../../acessos/acessos.service';
import { FUNCIONALIDADE_KEY } from '../decorators/funcionalidade.decorator';
import { UsuarioAutenticado } from '../decorators/usuario-atual.decorator';

/**
 * Guard de autorização por perfil (Req 7.2). Lê a funcionalidade protegida
 * (definida por `@Funcionalidade(...)`) e exige autorização do perfil do
 * usuário autenticado via `AcessosService.exigirAutorizacao`, que se apoia em
 * `FUNCIONALIDADES_FISCAL` para decidir o acesso do fiscal. O gerente tem
 * acesso total.
 *
 * Deve ser aplicado após o `JwtAuthGuard` (que anexa `request.usuario`).
 */
@Injectable()
export class PerfilGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly acessosService: AcessosService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const meta = this.reflector.getAllAndOverride<
      string | string[] | undefined
    >(FUNCIONALIDADE_KEY, [context.getHandler(), context.getClass()]);

    // Normaliza para lista (o decorator pode declarar uma ou mais).
    const funcionalidades =
      meta == null ? [] : Array.isArray(meta) ? meta : [meta];

    // Sem funcionalidade declarada, basta estar autenticado.
    if (funcionalidades.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ usuario?: UsuarioAutenticado }>();
    const usuario = request.usuario;
    if (!usuario) {
      throw new ForbiddenException('Usuário não autenticado.');
    }

    // Autoriza se o perfil tiver acesso a QUALQUER uma das funcionalidades
    // (semântica OR). Lança PermissaoInsuficienteError quando nenhuma é
    // permitida; o filtro de exceções mapeia para 403 com mensagem em PT.
    this.acessosService.exigirAlgumaAutorizacao(
      usuario.perfil,
      funcionalidades,
    );
    return true;
  }
}
