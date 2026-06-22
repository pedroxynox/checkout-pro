import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { ChecklistController } from './checklist.controller';
import { ChecklistService } from './checklist.service';

/**
 * Módulo do Modulo_Checklist (Req 5.1–5.3): checklists diários de abertura e
 * fechamento por upload de imagem, janelas fixas, estado rico (auditoria/
 * pontualidade), métricas de cumprimento, histórico e anti-fraude (foto
 * repetida). Importa o `NotificacoesModule` para o aviso de foto repetida.
 *
 * O `PrismaService` é provido globalmente pelo `PrismaModule`. Exporta o
 * `ChecklistService` para uso pela camada de API e pelos cron jobs.
 */
@Module({
  imports: [NotificacoesModule],
  providers: [ChecklistService],
  controllers: [ChecklistController],
  exports: [ChecklistService],
})
export class ChecklistModule {}
