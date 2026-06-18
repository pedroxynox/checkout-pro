import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { LoteApae } from '@prisma/client';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  AtualizarSaldoDto,
  RegistrarLoteDto,
  ReiniciarLoteDto,
} from './dto/lote-apae.dto';
import { LoteApaeService } from './lote-apae.service';

/**
 * Controller do ciclo de Lote de Sacolas APAE (Req 2.6): registro do lote
 * inicial, atualização de saldo, reinício preservando histórico e listagem do
 * histórico. Liberado ao fiscal (`@Funcionalidade('LOTE_APAE')`).
 */
@Controller('lote-apae')
@Funcionalidade('LOTE_APAE')
export class LoteApaeController {
  constructor(private readonly loteApaeService: LoteApaeService) {}

  /** Registra um novo lote inicial (Req 2.6.1). */
  @Post()
  async registrarLoteInicial(@Body() dto: RegistrarLoteDto): Promise<LoteApae> {
    return this.loteApaeService.registrarLoteInicial(dto.quantidadeInicial);
  }

  /** Atualiza o saldo restante do lote (Req 2.6.2–2.6.4). */
  @Put(':id/saldo')
  async atualizarSaldo(
    @Param('id') id: string,
    @Body() dto: AtualizarSaldoDto,
  ): Promise<LoteApae> {
    return this.loteApaeService.atualizarSaldo(id, dto.saldoAtual);
  }

  /** Reinicia o ciclo, encerrando o lote atual e abrindo um novo (Req 2.6.5). */
  @Post(':id/reiniciar')
  async reiniciar(
    @Param('id') id: string,
    @Body() dto: ReiniciarLoteDto,
  ): Promise<{ encerrado: LoteApae; novo: LoteApae }> {
    return this.loteApaeService.reiniciarLote(id, dto.novaQuantidadeInicial);
  }

  /** Histórico de lotes encerrados (Req 2.6.7). */
  @Get('historico')
  async historico(): Promise<LoteApae[]> {
    return this.loteApaeService.historicoLotes();
  }
}
