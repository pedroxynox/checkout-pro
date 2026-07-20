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
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import { EntradaCid } from './cid10.catalogo';
import {
  AtestadoDetalhado,
  AtestadosService,
  HistoricoCidItem,
  ResultadoAtestado,
} from './atestados.service';
import {
  BuscarCidDto,
  LancarAtestadoDto,
  PeriodoAtestadosDto,
} from './dto/atestados.dto';

/**
 * Controller dos ATESTADOS médicos. Liberado a quem lança faltas/ausências
 * (`OPERADORES_AUSENCIAS`) — mesmo público da ausência a prazo.
 */
@Controller('atestados')
@Funcionalidade('OPERADORES_AUSENCIAS')
export class AtestadosController {
  constructor(private readonly atestados: AtestadosService) {}

  /** Autocompletar do CID-10 (por código ou descrição). */
  @Get('cid')
  buscarCid(@Query() dto: BuscarCidDto): EntradaCid[] {
    return this.atestados.buscarCid(dto.busca ?? '');
  }

  /** Lança um atestado (cria o documento + as faltas justificadas do período). */
  @Post()
  async lancar(
    @Body() dto: LancarAtestadoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<ResultadoAtestado> {
    return this.atestados.lancar(
      {
        colaboradorId: dto.colaboradorId,
        inicio: new Date(dto.inicio),
        fim: new Date(dto.fim),
        cid: dto.cid,
        semCid: dto.semCid,
        observacao: dto.observacao,
      },
      { id: usuario?.sub, nome: usuario?.nome ?? usuario?.login },
    );
  }

  /** Lista os atestados que intersectam o período informado. */
  @Get()
  listar(@Query() dto: PeriodoAtestadosDto): Promise<AtestadoDetalhado[]> {
    return this.atestados.listar({
      inicio: new Date(dto.inicio),
      fim: new Date(dto.fim),
    });
  }

  /** Histórico de atestados de um colaborador, agrupado por CID. */
  @Get('colaborador/:id')
  historico(@Param('id') id: string): Promise<HistoricoCidItem[]> {
    return this.atestados.historicoColaborador(id);
  }

  /** Remove um atestado e as faltas diárias vinculadas (correção). */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remover(@Param('id') id: string): Promise<void> {
    await this.atestados.remover(id);
  }
}
