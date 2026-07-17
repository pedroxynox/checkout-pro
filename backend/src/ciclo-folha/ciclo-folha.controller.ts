import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import {
  CicloFolhaService,
  EstadoCicloFolha,
  EventoCicloView,
} from './ciclo-folha.service';
import { AcaoCicloDto } from './dto/ciclo-folha.dto';

/** Converte o parâmetro `ciclo` (query) em deslocamento (0/atual, ≤0). */
function deslocamentoDe(ciclo?: string): number {
  const n = Number(ciclo);
  return Number.isFinite(n) && n <= 0 ? Math.trunc(n) : 0;
}

/**
 * API de fechamento/reabertura do ciclo de folha (26→25).
 *
 * Ver o estado e a trilha, e FECHAR o ciclo, exige `CENTRAL_JORNADA` (gestão).
 * REABRIR um ciclo fechado exige autorização de administrador (`ADMIN_DADOS`).
 */
@Controller('ciclo-folha')
export class CicloFolhaController {
  constructor(private readonly service: CicloFolhaService) {}

  /** Estado do ciclo (aberto/fechado, quem fechou/reabriu). */
  @Get('status')
  @Funcionalidade('CENTRAL_JORNADA')
  status(@Query('ciclo') ciclo?: string): Promise<EstadoCicloFolha> {
    return this.service.status(deslocamentoDe(ciclo));
  }

  /** Trilha de fechamentos/reaberturas do ciclo (trazabilidade). */
  @Get('eventos')
  @Funcionalidade('CENTRAL_JORNADA')
  eventos(@Query('ciclo') ciclo?: string): Promise<EventoCicloView[]> {
    return this.service.eventos(deslocamentoDe(ciclo));
  }

  /** Fecha o ciclo (após revisão). Bloqueia modificações ordinárias. */
  @Post('fechar')
  @HttpCode(HttpStatus.OK)
  @Funcionalidade('CENTRAL_JORNADA')
  fechar(
    @Body() dto: AcaoCicloDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<EstadoCicloFolha> {
    return this.service.fechar(dto.ciclo ?? 0, usuario);
  }

  /** Reabre um ciclo fechado — exige autorização de administrador. */
  @Post('reabrir')
  @HttpCode(HttpStatus.OK)
  @Funcionalidade('ADMIN_DADOS')
  reabrir(
    @Body() dto: AcaoCicloDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<EstadoCicloFolha> {
    return this.service.reabrir(dto.ciclo ?? 0, usuario);
  }
}
