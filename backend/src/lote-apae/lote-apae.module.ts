import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { LoteApaeController } from './lote-apae.controller';
import { LoteApaeService } from './lote-apae.service';

/**
 * Módulo do ciclo de Lote de Sacolas APAE (Req 2.6): registro do lote inicial,
 * atualização de saldo com cálculo de vendida/percentual, reinício preservando
 * histórico, histórico de lotes, configuração (preço/meta), análises
 * (tendência, velocidade, previsão, arrecadação) e notificações.
 *
 * Importa o `NotificacoesModule` para avisar os gestores (meta atingida, lote
 * acabando). O `PrismaService` é provido globalmente.
 */
@Module({
  imports: [NotificacoesModule],
  providers: [LoteApaeService],
  controllers: [LoteApaeController],
  exports: [LoteApaeService],
})
export class LoteApaeModule {}
