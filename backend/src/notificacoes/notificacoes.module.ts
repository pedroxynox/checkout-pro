import { Module } from '@nestjs/common';
import { NotificacoesController } from './notificacoes.controller';
import { NotificacaoEventos } from './notificacoes.eventos';
import { NotificacoesGateway } from './notificacoes.gateway';
import { NotificacoesService } from './notificacoes.service';

/**
 * Módulo transversal de Notificações (Req 7.3, 5.3.3, 5.3.4): entrega em duplo
 * canal (push + in-app), resolução de alvos (fiscais online + login gerencial)
 * e histórico por usuário. Entrega em tempo real via WebSocket
 * (`NotificacoesGateway`), por usuário.
 *
 * O `PrismaService` é provido globalmente pelo `PrismaModule` e o `JwtService`
 * pelo `SegurancaModule` (global). Exporta o `NotificacoesService` para uso por
 * todos os módulos (insumos, checklist, importações) e pelos cron jobs.
 */
@Module({
  providers: [NotificacoesService, NotificacaoEventos, NotificacoesGateway],
  controllers: [NotificacoesController],
  exports: [NotificacoesService],
})
export class NotificacoesModule {}
