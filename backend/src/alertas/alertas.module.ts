import { Module } from '@nestjs/common';
import { ChecklistModule } from '../checklist/checklist.module';
import { RELOGIO, RelogioSistema } from '../common/relogio';
import { ImportacoesModule } from '../importacoes/importacoes.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { AlertasService } from './alertas.service';

/**
 * Módulo de alertas agendados (Tarefa 15). Reúne os serviços de checklist,
 * importações e notificações para os cron jobs de alerta, e fornece o relógio
 * injetável (`RELOGIO`). O `ScheduleModule.forRoot()` é registrado no
 * `AppModule`.
 */
@Module({
  imports: [ChecklistModule, ImportacoesModule, NotificacoesModule],
  providers: [AlertasService, { provide: RELOGIO, useClass: RelogioSistema }],
  exports: [AlertasService],
})
export class AlertasModule {}
