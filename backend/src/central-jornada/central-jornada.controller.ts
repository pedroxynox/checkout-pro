import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import { MarcarDebitoDto } from './dto/central-jornada.dto';
import {
  CentralInconsistencias,
  CentralJornadaService,
  CentralResumo,
} from './central-jornada.service';

/** Interpreta o parâmetro de ciclo (deslocamento): 0 = atual, -1 = anterior... */
function deslocamentoDe(ciclo?: string): number {
  const n = Number(ciclo);
  if (!Number.isInteger(n) || n > 0 || n < -24) return 0;
  return n;
}

/**
 * Central de Jornada (uso gerencial — CENTRAL_JORNADA). Portal de controle da
 * jornada de cada colaborador no ciclo de folha (26→25): carga, horas extras
 * 50%/100%, horas que deve, horas de atestado, faltas, dias de TAC e saldo.
 */
@Controller('central-jornada')
@Funcionalidade('CENTRAL_JORNADA')
export class CentralJornadaController {
  constructor(private readonly service: CentralJornadaService) {}

  /** Resumo do ciclo (por pessoa + totais). `ciclo` opcional (0 atual, -1...). */
  @Get()
  resumo(@Query('ciclo') ciclo?: string): Promise<CentralResumo> {
    return this.service.resumoCiclo(deslocamentoDe(ciclo));
  }

  /** Painel de inconsistências do ciclo (incompletas, duplicadas, conflitos...). */
  @Get('inconsistencias')
  inconsistencias(
    @Query('ciclo') ciclo?: string,
  ): Promise<CentralInconsistencias> {
    return this.service.inconsistenciasCiclo(deslocamentoDe(ciclo));
  }

  /** Comparativo dos últimos `qtd` ciclos (1..12). */
  @Get('comparativos')
  comparativos(@Query('qtd') qtd?: string) {
    const n = Number(qtd);
    return this.service.comparativos(Number.isInteger(n) ? n : 6);
  }

  /** Detalhe diário de um colaborador no ciclo. */
  @Get('pessoa/:id')
  pessoa(@Param('id') id: string, @Query('ciclo') ciclo?: string) {
    return this.service.detalhePessoa(id, deslocamentoDe(ciclo));
  }

  /** Marca/desmarca uma falta como débito de horas (RH/gestão). */
  @Post('ausencia/:id/debito')
  @HttpCode(HttpStatus.OK)
  @Funcionalidade('CENTRAL_JORNADA')
  marcarDebito(@Param('id') id: string, @Body() dto: MarcarDebitoDto) {
    return this.service.marcarDebito(id, dto.debito);
  }
}
