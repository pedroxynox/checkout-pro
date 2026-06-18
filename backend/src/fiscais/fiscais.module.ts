import { Module } from '@nestjs/common';
import { FiscaisController } from './fiscais.controller';
import { FiscaisService } from './fiscais.service';
import { EscalaController } from './escala.controller';
import { EscalaService } from './escala.service';
import { FiscaisGateway } from './fiscais.gateway';
import { FiscalStatusEventos } from './fiscais.eventos';

/**
 * Módulo do Modulo_Fiscais (Req 4.1–4.3): monitoramento de status em tempo
 * real, check-in/check-out e escala de trabalho com horários por dia, intervalo
 * variável, folga e horário especial individual.
 *
 * O `PrismaService` é provido globalmente pelo `PrismaModule`. Exporta os
 * serviços para uso pela camada de API e pelo WebSocket Gateway (Tarefas 13/14).
 */
@Module({
  providers: [
    FiscaisService,
    EscalaService,
    FiscalStatusEventos,
    FiscaisGateway,
  ],
  controllers: [FiscaisController, EscalaController],
  exports: [FiscaisService, EscalaService, FiscalStatusEventos],
})
export class FiscaisModule {}
