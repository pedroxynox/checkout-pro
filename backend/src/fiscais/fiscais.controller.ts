import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { SessaoFiscal } from '@prisma/client';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import { AlterarStatusDto } from './dto/fiscais.dto';
import { FiscaisService } from './fiscais.service';

/**
 * Controller do monitoramento de fiscais (Req 4.1, 4.2). A **visualização** do
 * painel/histórico é liberada por `@Funcionalidade('FISCAIS_STATUS')` (todos os
 * perfis com acesso à área). Já **alterar status / check-in / check-out** só é
 * permitido ao **próprio fiscal** (dono da sessão) ou ao **gerente
 * desenvolvedor** — nem o gerente comum nem o supervisor podem alterar o status
 * de um fiscal. A emissão em tempo real é feita pelo WebSocket Gateway.
 */
@Controller('fiscais')
@Funcionalidade('FISCAIS_STATUS')
export class FiscaisController {
  constructor(private readonly fiscaisService: FiscaisService) {}

  /**
   * Garante que quem altera o status é o próprio fiscal (dono) ou o gerente
   * desenvolvedor; caso contrário, recusa.
   */
  private async exigirDonoOuDesenvolvedor(
    fiscalId: string,
    usuario: UsuarioAutenticado | undefined,
  ): Promise<void> {
    if (usuario?.perfil === 'GERENTE_DESENVOLVEDOR') {
      return;
    }
    const dono = await this.fiscaisService.pertenceAoUsuario(
      fiscalId,
      usuario?.sub,
    );
    if (!dono) {
      throw new ForbiddenException(
        'Apenas o próprio fiscal pode alterar o seu status.',
      );
    }
  }

  /** Altera o status atual de um fiscal (Req 4.1.1–4.1.3). */
  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  async alterarStatus(
    @Param('id') fiscalId: string,
    @Body() dto: AlterarStatusDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<SessaoFiscal> {
    await this.exigirDonoOuDesenvolvedor(fiscalId, usuario);
    return this.fiscaisService.alterarStatus(fiscalId, dto.status, new Date());
  }

  /** Realiza o check-in de um fiscal (Req 4.2.1, 4.2.3). */
  @Post(':id/check-in')
  @HttpCode(HttpStatus.OK)
  async checkIn(
    @Param('id') fiscalId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<SessaoFiscal> {
    await this.exigirDonoOuDesenvolvedor(fiscalId, usuario);
    return this.fiscaisService.checkIn(fiscalId, new Date());
  }

  /** Realiza o check-out de um fiscal (Req 4.2.2). */
  @Post(':id/check-out')
  @HttpCode(HttpStatus.OK)
  async checkOut(
    @Param('id') fiscalId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<SessaoFiscal> {
    await this.exigirDonoOuDesenvolvedor(fiscalId, usuario);
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
