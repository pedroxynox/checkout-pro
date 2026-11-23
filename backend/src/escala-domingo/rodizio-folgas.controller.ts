import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import { DefinirRodizioFolgasDto } from './dto/rodizio-folgas.dto';
import {
  RodizioFolgasConfig,
  RodizioFolgasService,
  SimulacaoRodizioFolgas,
} from './rodizio-folgas.service';

/**
 * Rodízio de folgas do 5x2 (`config/rodizio-folgas`, spec `jornada-5x2`,
 * Fase 3). Configuração do Centro de Controle: mesma permissão do rodízio de
 * domingo (`ESCALA_DOMINGO_CONFIG`).
 */
@Controller('config/rodizio-folgas')
@Funcionalidade('ESCALA_DOMINGO_CONFIG')
export class RodizioFolgasController {
  constructor(private readonly service: RodizioFolgasService) {}

  /** Vigências (com avisos), a vigente e a prévia das próximas semanas. */
  @Get()
  obter(): Promise<RodizioFolgasConfig> {
    return this.service.obter();
  }

  /** Grava (cria ou substitui) a vigência que começa na data informada. */
  @Put()
  definir(
    @Body() dto: DefinirRodizioFolgasDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<RodizioFolgasConfig> {
    return this.service.definir(dto, usuario?.login);
  }

  /** Valida e mostra avisos e prévia, sem gravar. */
  @Post('simular')
  @HttpCode(200)
  simular(
    @Body() dto: DefinirRodizioFolgasDto,
  ): Promise<SimulacaoRodizioFolgas> {
    return this.service.simular(dto);
  }
}
