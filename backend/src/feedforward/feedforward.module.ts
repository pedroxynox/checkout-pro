import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { FeedforwardController } from './feedforward.controller';
import { FeedforwardService } from './feedforward.service';
import { FeedforwardAlertasService } from './feedforward-alertas.service';

/**
 * Módulo do Feedforward (acompanhamento de desenvolvimento no perfil do
 * colaborador). Registra as rodadas (foto + registro do líder + pontos com
 * prazo + nota de evolução) e, via cron diário, avisa supervisores e gerentes
 * quando um prazo vence. O `PrismaService` e o `StorageModule` são globais.
 */
@Module({
  imports: [NotificacoesModule],
  providers: [FeedforwardService, FeedforwardAlertasService],
  controllers: [FeedforwardController],
  exports: [FeedforwardService],
})
export class FeedforwardModule {}
