import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import {
  AdvertenciasService,
  SolicitacaoAdvertenciaResumo,
} from './advertencias.service';
import { CancelarSolicitacaoDto } from './dto/advertencias.dto';

/**
 * Controller das solicitações automáticas de advertência (por falta não
 * justificada). Decidir (listar/aprovar/cancelar) exige `ADVERTENCIAS_DECIDIR`
 * — gerente/supervisor. A criação das solicitações é feita pelo cron diário.
 */
@Controller('advertencias')
@Funcionalidade('ADVERTENCIAS_DECIDIR')
export class AdvertenciasController {
  constructor(private readonly service: AdvertenciasService) {}

  /** Solicitações pendentes de decisão (limpa as já justificadas). */
  @Get('solicitacoes/pendentes')
  async listarPendentes(): Promise<SolicitacaoAdvertenciaResumo[]> {
    return this.service.listarPendentes();
  }

  /** Quantidade de solicitações pendentes (para o badge). */
  @Get('solicitacoes/pendentes/contagem')
  async contagem(): Promise<{ total: number }> {
    return { total: await this.service.contarPendentes() };
  }

  /** Aprova: cria a advertência em Sanções e marca a solicitação como aprovada. */
  @Post('solicitacoes/:id/aprovar')
  @HttpCode(HttpStatus.OK)
  async aprovar(
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<SolicitacaoAdvertenciaResumo> {
    return this.service.aprovar(id, {
      id: usuario?.sub,
      nome: usuario?.nome ?? usuario?.login ?? 'Gestor',
    });
  }

  /** Cancela a solicitação (ex.: falta já justificada) — não lança advertência. */
  @Post('solicitacoes/:id/cancelar')
  @HttpCode(HttpStatus.OK)
  async cancelar(
    @Param('id') id: string,
    @Body() dto: CancelarSolicitacaoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<SolicitacaoAdvertenciaResumo> {
    return this.service.cancelar(id, dto.motivo, {
      id: usuario?.sub,
      nome: usuario?.nome ?? usuario?.login ?? 'Gestor',
    });
  }
}
