import { Module } from '@nestjs/common';
import { NotificacoesController } from './notificacoes.controller';
import { NotificacoesService } from './notificacoes.service';

/**
 * Módulo transversal de Notificações (Req 7.3, 5.3.3, 5.3.4): entrega em duplo
 * canal (push + in-app), resolução de alvos (fiscais online + login gerencial)
 * e histórico por usuário.
 *
 * O `PrismaService` é provido globalmente pelo `PrismaModule`. Exporta o
 * `NotificacoesService` para uso por todos os módulos (insumos, checklist,
 * importações) e pelos cron jobs (Tarefas 13/15).
 */
@Module({
  providers: [NotificacoesService],
  controllers: [NotificacoesController],
  exports: [NotificacoesService],
})
export class NotificacoesModule {}
