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
  IntervaloCiclosView,
} from './ciclo-folha.service';
import { AcaoCicloDto, IntervaloCicloDto } from './dto/ciclo-folha.dto';

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

  /**
   * Ciclos tocados por um período, com o estado de cada um e quantos dias lhe
   * cabem. Consulta apenas informativa, para o app avisar antes de salvar.
   *
   * A permissão é mais ampla que o resto do controller de propósito: quem
   * programa atestado, ausência a prazo ou férias tem `OPERADORES_CRUD`/
   * `OPERADORES_AUSENCIAS`, não `CENTRAL_JORNADA` — sem isso o aviso daria 403
   * exatamente para quem precisa dele. Não expõe nada além do rótulo do ciclo e
   * se está aberto ou fechado.
   */
  @Get('intervalo')
  @Funcionalidade('CENTRAL_JORNADA', 'OPERADORES_CRUD', 'OPERADORES_AUSENCIAS')
  intervalo(@Query() dto: IntervaloCicloDto): Promise<IntervaloCiclosView> {
    return this.service.consultarIntervalo(
      new Date(dto.inicio),
      new Date(dto.fim),
    );
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
