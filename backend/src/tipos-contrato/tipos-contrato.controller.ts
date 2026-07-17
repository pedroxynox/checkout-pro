import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TipoContratoJornada } from '@prisma/client';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  AlternarAtivoDto,
  AtualizarTipoContratoDto,
  CriarTipoContratoDto,
} from './dto/tipos-contrato.dto';
import { TiposContratoService } from './tipos-contrato.service';

/**
 * Tipos de contrato de jornada (Centro de Controle). Criar/editar/ativar as
 * REGRAS de jornada afeta o cálculo (horas extras, TAC, folha), por isso o
 * gate é `ADMIN_DADOS` (apenas administrador).
 */
@Controller('tipos-contrato')
@Funcionalidade('ADMIN_DADOS')
export class TiposContratoController {
  constructor(private readonly service: TiposContratoService) {}

  /** Lista os contratos. `incluirInativos=1` traz também os desativados. */
  @Get()
  listar(
    @Query('incluirInativos') incluirInativos?: string,
  ): Promise<TipoContratoJornada[]> {
    const incluir = incluirInativos === '1' || incluirInativos === 'true';
    return this.service.listar(incluir);
  }

  /** Cria um novo tipo de contrato. */
  @Post()
  criar(@Body() dto: CriarTipoContratoDto): Promise<TipoContratoJornada> {
    return this.service.criar(dto);
  }

  /** Edita um tipo de contrato. */
  @Patch(':id')
  atualizar(
    @Param('id') id: string,
    @Body() dto: AtualizarTipoContratoDto,
  ): Promise<TipoContratoJornada> {
    return this.service.atualizar(id, dto);
  }

  /** Ativa/desativa um tipo de contrato. */
  @Patch(':id/ativo')
  definirAtivo(
    @Param('id') id: string,
    @Body() dto: AlternarAtivoDto,
  ): Promise<TipoContratoJornada> {
    return this.service.definirAtivo(id, dto.ativo);
  }

  /** Remove um tipo de contrato (o padrão não pode ser removido). */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remover(@Param('id') id: string): Promise<void> {
    await this.service.remover(id);
  }
}
