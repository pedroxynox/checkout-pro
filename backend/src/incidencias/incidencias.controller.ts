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
import { IncidenciaEscala } from '@prisma/client';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import {
  CriarIncidenciaDto,
  EditarIncidenciaDto,
  JustificarIncidenciaDto,
  ListarIncidenciasDto,
  RankingIncidenciasDto,
  SancoesDto,
  SugestoesIncidenciaDto,
} from './dto/incidencias.dto';
import { IncidenciasService, SugestaoIncidencia } from './incidencias.service';
import { ItemRankingIncidencias, ResumoSancoes } from './incidencias.domain';

/**
 * Controller das Incidências de Escala (Fase 1 — "não retornou do intervalo").
 *
 * Registrar/editar/remover são operações de gestão de escala/ausências
 * (`OPERADORES_AUSENCIAS`); a leitura (listagem, sugestões e ranking) segue a
 * mesma permissão da escala (`ESCALA_VISUALIZAR`). Cada método declara
 * explicitamente a sua funcionalidade para o `PerfilGuard` global.
 */
@Controller('escala/incidencias')
export class IncidenciasController {
  constructor(private readonly incidencias: IncidenciasService) {}

  /** Registra uma incidência (por colaborador, tipo e data). */
  @Post()
  @Funcionalidade('OPERADORES_AUSENCIAS')
  async registrar(
    @Body() dto: CriarIncidenciaDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<IncidenciaEscala> {
    return this.incidencias.registrar(dto, {
      id: usuario?.sub,
      nome: usuario?.nome ?? usuario?.login,
    });
  }

  /** Edita os campos editáveis de uma incidência (404 se não existir). */
  @Patch(':id')
  @Funcionalidade('OPERADORES_AUSENCIAS')
  async editar(
    @Param('id') id: string,
    @Body() dto: EditarIncidenciaDto,
  ): Promise<IncidenciaEscala> {
    return this.incidencias.editar(id, dto);
  }

  /** Justifica/reabre/injustifica um não-retorno DEPOIS do registro (abono). */
  @Patch(':id/justificativa')
  @Funcionalidade('OPERADORES_AUSENCIAS')
  async justificar(
    @Param('id') id: string,
    @Body() dto: JustificarIncidenciaDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<IncidenciaEscala> {
    return this.incidencias.justificar(
      id,
      { status: dto.status, motivo: dto.motivo, observacao: dto.observacao },
      { id: usuario?.sub, nome: usuario?.nome ?? usuario?.login },
    );
  }

  /** Remove uma incidência (404 se não existir). */
  @Delete(':id')
  @Funcionalidade('OPERADORES_AUSENCIAS')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remover(@Param('id') id: string): Promise<void> {
    await this.incidencias.remover(id);
  }

  /** Lista incidências pelos filtros informados, mais recentes primeiro. */
  @Get()
  @Funcionalidade('ESCALA_VISUALIZAR')
  async listar(
    @Query() filtros: ListarIncidenciasDto,
  ): Promise<IncidenciaEscala[]> {
    return this.incidencias.listar(filtros);
  }

  /** Sugestões auto-detectadas do ponto dos fiscais para uma data (?data=). */
  @Get('sugestoes')
  @Funcionalidade('ESCALA_VISUALIZAR')
  async sugestoes(
    @Query() dto: SugestoesIncidenciaDto,
  ): Promise<SugestaoIncidencia[]> {
    return this.incidencias.sugestoes(dto.data);
  }

  /** Ranking de incidências por colaborador na janela (?inicio=&fim=). */
  @Get('ranking')
  @Funcionalidade('ESCALA_VISUALIZAR')
  async ranking(
    @Query() dto: RankingIncidenciasDto,
  ): Promise<ItemRankingIncidencias[]> {
    return this.incidencias.ranking(dto.inicio, dto.fim, dto.tipo);
  }

  /** Panorama de sanções (advertência/suspensão) na janela (?inicio=&fim=). */
  @Get('sancoes')
  @Funcionalidade('ESCALA_VISUALIZAR')
  async sancoes(@Query() dto: SancoesDto): Promise<ResumoSancoes> {
    return this.incidencias.panoramaSancoes(dto.inicio, dto.fim);
  }
}
