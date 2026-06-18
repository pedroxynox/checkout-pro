import { Module } from '@nestjs/common';
import { ChecklistController } from './checklist.controller';
import { ChecklistService } from './checklist.service';

/**
 * Módulo do Modulo_Checklist (Req 5.1–5.3): checklists diários de abertura e
 * fechamento por upload de imagem, janelas fixas de execução e alerta de
 * pendência no horário-limite.
 *
 * O `PrismaService` é provido globalmente pelo `PrismaModule`. Exporta o
 * `ChecklistService` para uso pela camada de API e pelos cron jobs
 * (Tarefas 13/15).
 */
@Module({
  providers: [ChecklistService],
  controllers: [ChecklistController],
  exports: [ChecklistService],
})
export class ChecklistModule {}
