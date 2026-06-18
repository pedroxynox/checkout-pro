import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { SessaoFiscal } from '@prisma/client';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import { AlterarStatusDto } from './dto/fiscais.dto';
import { FiscaisService } from './fiscais.service';

/**
 * Controller do monitoramento de fiscais (Req 4.1, 4.2): alteração de status,
 * check-in/check-out e histórico de sessões. Liberado ao fiscal
 * (`@Funcionalidade('FISCAIS_STATUS')`). A emissão em tempo real é feita pelo
 * WebSocket Gateway (Tarefa 14).
 */
@Controller('fiscais')
@Funcionalidade('FISCAIS_STATUS')
export class FiscaisController {
  constructor(private readonly fiscaisService: FiscaisService) {}

  /** Altera o status atual de um fiscal (Req 4.1.1–4.1.3). */
  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  async alterarStatus(
    @Param('id') fiscalId: string,
    @Body() dto: AlterarStatusDto,
  ): Promise<SessaoFiscal> {
    return this.fiscaisService.alterarStatus(fiscalId, dto.status, new Date());
  }

  /** Realiza o check-in de um fiscal (Req 4.2.1, 4.2.3). */
  @Post(':id/check-in')
  @HttpCode(HttpStatus.OK)
  async checkIn(@Param('id') fiscalId: string): Promise<SessaoFiscal> {
    return this.fiscaisService.checkIn(fiscalId, new Date());
  }

  /** Realiza o check-out de um fiscal (Req 4.2.2). */
  @Post(':id/check-out')
  @HttpCode(HttpStatus.OK)
  async checkOut(@Param('id') fiscalId: string): Promise<SessaoFiscal> {
    return this.fiscaisService.checkOut(fiscalId, new Date());
  }

  /** Histórico de sessões (check-in/check-out) de um fiscal (Req 4.2.4). */
  @Get(':id/sessoes')
  async historicoSessoes(
    @Param('id') fiscalId: string,
  ): Promise<SessaoFiscal[]> {
    return this.fiscaisService.historicoSessoes(fiscalId);
  }
}
