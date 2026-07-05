import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { DataInicialModule } from '../data-inicial/data-inicial.module';
import { FiscaisController } from './fiscais.controller';
import { FiscaisService } from './fiscais.service';
import { FiscaisHorarioService } from './fiscais-horario.service';
import { FiscaisAlertasService } from './fiscais-alertas.service';
import { EscalaController } from './escala.controller';
import { EscalaService } from './escala.service';
import { FiscaisGateway } from './fiscais.gateway';
import { FiscalStatusEventos } from './fiscais.eventos';

/**
 * Módulo do Modulo_Fiscais (Req 4.1–4.3): controle de jornada com 3 estados
 * (Disponível / Intervalo / Fora de expediente), painel em tempo real
 * (WebSocket), log de jornada (tempos) e escala de trabalho.
 *
 * Importa o `NotificacoesModule` para avisar os gestores nas transições de
 * status e nas faltas. O `PrismaService` é global.
 */
@Module({
  imports: [NotificacoesModule, DataInicialModule],
  providers: [
    FiscaisService,
    FiscaisHorarioService,
    FiscaisAlertasService,
    EscalaService,
    FiscalStatusEventos,
    FiscaisGateway,
  ],
  controllers: [FiscaisController, EscalaController],
  exports: [FiscaisService, EscalaService, FiscalStatusEventos],
})
export class FiscaisModule {}
