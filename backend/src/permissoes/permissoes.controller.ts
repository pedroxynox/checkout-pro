import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import { DefinirPermissoesDto } from './dto/permissoes.dto';
import {
  ItemAuditoria,
  PermissoesDoPerfil,
  PermissoesDoUsuario,
  PermissoesService,
  ResumoPerfil,
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

  // ---- Padrões por perfil ----

  /** Resumo dos perfis ajustáveis (com contagem de itens personalizados). */
  @Get('perfis')
  perfis(): Promise<ResumoPerfil[]> {
    return this.service.listarPerfis();
  }

  /** Padrão (código ± ajustes) de um perfil ajustável. */
  @Get('perfil/:perfil')
  doPerfil(@Param('perfil') perfil: string): Promise<PermissoesDoPerfil> {
    return this.service.permissoesDoPerfil(perfil);
  }

  /** Define o padrão de um perfil (afeta todos os usuários do perfil). */
  @Put('perfil/:perfil')
  definirPerfil(
    @Param('perfil') perfil: string,
    @Body() dto: DefinirPermissoesDto,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ): Promise<PermissoesDoPerfil> {
    return this.service.definirPerfil(perfil, dto.permissoes, admin?.login);
  }

  /** Restaura o perfil ao padrão de código (remove os ajustes de perfil). */
  @Post('perfil/:perfil/restaurar')
  @HttpCode(HttpStatus.OK)
  restaurarPerfil(
    @Param('perfil') perfil: string,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ): Promise<PermissoesDoPerfil> {
    return this.service.restaurarPerfil(perfil, admin?.login);
  }

  // ---- Histórico (auditoria) ----

  /** Últimas mudanças de permissão (por login e por perfil). */
  @Get('historico')
  historico(@Query('limite') limite?: string): Promise<ItemAuditoria[]> {
    const n = Number(limite);
    return this.service.historico(Number.isFinite(n) && n > 0 ? n : 100);
  }
}
