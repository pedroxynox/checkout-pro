import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { StatusRequisicao } from '@prisma/client';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import { CriarRequisicaoDto, NegarRequisicaoDto } from './dto/requisicoes.dto';
import { RequisicaoResumo, RequisicoesService } from './requisicoes.service';

/**
 * Controller de Requisições de insumos. Criar e listar é liberado ao fiscal
 * (`@Funcionalidade('INSUMOS')`); aprovar e negar exigem `INSUMOS_GERENCIAR`
 * (gerente ou supervisor).
 */
@Controller('requisicoes')
@Funcionalidade('INSUMOS')
export class RequisicoesController {
  constructor(private readonly service: RequisicoesService) {}

  /** Cria uma requisição (fiscal). */
  @Post()
  async criar(
    @Body() dto: CriarRequisicaoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<RequisicaoResumo> {
    return this.service.criar(
      dto.insumoId,
      dto.quantidade,
      dto.observacao,
      usuario?.sub,
    );
  }

  /** Lista as requisições, opcionalmente filtradas por status. */
  @Get()
  async listar(
    @Query('status') status?: StatusRequisicao,
  ): Promise<RequisicaoResumo[]> {
    return this.service.listar(status);
  }

  /** Quantidade de requisições pendentes (para o badge). */
  @Get('pendentes/contagem')
  async pendentes(): Promise<{ total: number }> {
    return { total: await this.service.contarPendentes() };
  }

  /** Remove TODAS as requisições (administrativo, apenas gerente). */
  @Delete()
  @Funcionalidade('ADMIN_DADOS')
  async limparTodas(): Promise<{ removidos: number }> {
    return { removidos: await this.service.limparTodas() };
  }

  /** Aprova uma requisição (gerente/supervisor). */
  @Post(':id/aprovar')
  @HttpCode(HttpStatus.OK)
  @Funcionalidade('INSUMOS_GERENCIAR')
  async aprovar(
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<RequisicaoResumo> {
    return this.service.aprovar(id, usuario?.sub);
  }

  /** Nega uma requisição (gerente/supervisor). */
  @Post(':id/negar')
  @HttpCode(HttpStatus.OK)
  @Funcionalidade('INSUMOS_GERENCIAR')
  async negar(
    @Param('id') id: string,
    @Body() dto: NegarRequisicaoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<RequisicaoResumo> {
    return this.service.negar(id, dto.motivo, usuario?.sub);
  }
}
