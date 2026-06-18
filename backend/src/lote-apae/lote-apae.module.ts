import { Module } from '@nestjs/common';
import { LoteApaeController } from './lote-apae.controller';
import { LoteApaeService } from './lote-apae.service';

/**
 * Módulo do ciclo de Lote de Sacolas APAE (Req 2.6): registro do lote inicial,
 * atualização de saldo com cálculo de vendida/percentual, reinício preservando
 * histórico e listagem do histórico de lotes encerrados.
 *
 * O `PrismaService` é provido globalmente pelo `PrismaModule`. Exporta o
 * `LoteApaeService` para uso pela camada de API (Tarefa 13).
 */
@Module({
  providers: [LoteApaeService],
  controllers: [LoteApaeController],
  exports: [LoteApaeService],
})
export class LoteApaeModule {}
