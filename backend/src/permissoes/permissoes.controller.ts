import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import { DefinirPermissoesDto } from './dto/permissoes.dto';
import {
  PermissoesDoUsuario,
  PermissoesService,
} from './permissoes.service';

/**
 * Central de Permissões — painel do Centro de Controle para ajustar permissões
 * POR LOGIN. Toda a área exige `PERMISSOES_GERENCIAR`, funcionalidade que só o
 * ADMINISTRADOR possui (não pertence a nenhum perfil e não é ajustável).
 */
@Controller('permissoes')
@Funcionalidade('PERMISSOES_GERENCIAR')
export class PermissoesController {
  constructor(private readonly service: PermissoesService) {}

  /** Catálogo de funcionalidades ajustáveis por login (ordem do catálogo). */
  @Get('catalogo')
  catalogo(): { funcionalidades: string[] } {
    return { funcionalidades: this.service.catalogoAjustavel() };
  }

  /** Permissões (padrão do perfil + ajustes) de um usuário. */
  @Get('usuario/:id')
  doUsuario(@Param('id') id: string): Promise<PermissoesDoUsuario> {
    return this.service.permissoesDoUsuario(id);
  }

  /** Define as permissões ajustáveis LIGADAS de um usuário. */
  @Put('usuario/:id')
  definir(
    @Param('id') id: string,
    @Body() dto: DefinirPermissoesDto,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ): Promise<PermissoesDoUsuario> {
    return this.service.definirPermissoes(id, dto.permissoes, admin?.login);
  }

  /** Restaura o usuário ao padrão do seu perfil (remove todos os ajustes). */
  @Post('usuario/:id/restaurar')
  @HttpCode(HttpStatus.OK)
  restaurar(
    @Param('id') id: string,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ): Promise<PermissoesDoUsuario> {
    return this.service.restaurarPadrao(id, admin?.login);
  }
}
