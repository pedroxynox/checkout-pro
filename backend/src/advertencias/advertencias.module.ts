import { Module } from '@nestjs/common';
import { IncidenciasModule } from '../incidencias/incidencias.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { AdvertenciasController } from './advertencias.controller';
import { AdvertenciasService } from './advertencias.service';

/**
 * Módulo de solicitações automáticas de advertência por falta não justificada
 * (ADR 0013). O cron diário cria as solicitações e notifica os gestores; o
 * gerente aprova (cria a advertência via `IncidenciasService`) ou cancela.
 *
 * O `ScheduleModule.forRoot()` é registrado no `AppModule`; o `PrismaService` é
 * global. Importa `IncidenciasModule` (criar a advertência em Sanções) e
 * `NotificacoesModule` (avisar os gestores).
 */
@Module({
  imports: [IncidenciasModule, NotificacoesModule],
  providers: [AdvertenciasService],
  controllers: [AdvertenciasController],
  exports: [AdvertenciasService],
})
export class AdvertenciasModule {}
