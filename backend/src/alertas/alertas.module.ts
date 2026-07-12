import { Module } from '@nestjs/common';
import { ChecklistModule } from '../checklist/checklist.module';
import { RELOGIO, RelogioSistema } from '../common/relogio';
import { ArrecadacaoModule } from '../arrecadacao/arrecadacao.module';
import { FechamentoModule } from '../fechamento/fechamento.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { AlertasService } from './alertas.service';
import { SaudacaoDiariaService } from './saudacao-diaria.service';

/**
 * Módulo de alertas agendados (Tarefa 15). Reúne os serviços de checklist,
 * arrecadação (indicadores pendentes do dia), fechamento (lembrete das 22:20
 * para concluir o fechamento) e notificações para os cron jobs de alerta, e
 * fornece o relógio injetável (`RELOGIO`). O `ScheduleModule.forRoot()` é
 * registrado no `AppModule`.
 */
@Module({
  imports: [
    ChecklistModule,
    ArrecadacaoModule,
    FechamentoModule,
    NotificacoesModule,
  ],
  providers: [
    AlertasService,
    SaudacaoDiariaService,
    { provide: RELOGIO, useClass: RelogioSistema },
  ],
  exports: [AlertasService],
})
export class AlertasModule {}
