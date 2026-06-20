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
 * Controller do ciclo de Sacolas APAE (Req 2.6). A classe exige a
 * funcionalidade `LOTE_APAE` (liberada ao fiscal: visualizar e atualizar
 * saldo). As ações de **gestão do lote** — registrar e reiniciar — são
 * sobrepostas para `LOTE_APAE_GERENCIAR`, exclusiva do GERENTE (o fiscal não
 * pode adicionar nem reiniciar lotes).
 */
@Controller('lote-apae')
@Funcionalidade('LOTE_APAE')
export class LoteApaeController {
  constructor(private readonly loteApaeService: LoteApaeService) {}

  /** Registra um novo lote inicial (Req 2.6.1). Apenas GERENTE. */
  @Post()
  @Funcionalidade('LOTE_APAE_GERENCIAR')
  async registrarLoteInicial(@Body() dto: RegistrarLoteDto): Promise<LoteApae> {
    return this.loteApaeService.registrarLoteInicial(dto.quantidadeInicial);
  }

  /**
   * Atualiza o saldo restante do lote (Req 2.6.2–2.6.4). Liberado ao fiscal.
   * Ao zerar o saldo, o serviço encerra o lote automaticamente (lote vendido).
   */
  @Put(':id/saldo')
  async atualizarSaldo(
    @Param('id') id: string,
    @Body() dto: AtualizarSaldoDto,
  ): Promise<LoteApae> {
    return this.loteApaeService.atualizarSaldo(id, dto.saldoAtual);
  }

  /**
   * Reinicia o ciclo, encerrando o lote atual e abrindo um novo (Req 2.6.5).
   * Apenas GERENTE.
   */
  @Post(':id/reiniciar')
  @Funcionalidade('LOTE_APAE_GERENCIAR')
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

  /**
   * Lote em andamento (status ABERTO) ou `null` se não houver. Fonte
   * compartilhada do lote ativo entre dispositivos.
   */
  @Get('ativo')
  async ativo(): Promise<LoteApae | null> {
    return this.loteApaeService.loteAtivo();
  }
}
