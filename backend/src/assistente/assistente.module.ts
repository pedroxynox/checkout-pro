import { Module } from '@nestjs/common';
import { AssistenteController } from './assistente.controller';
import { AssistenteService } from './assistente.service';
import { GeminiClient } from './gemini.client';
import { ProcedimentosService } from './procedimentos.service';
import { FiscaisModule } from '../fiscais/fiscais.module';

/**
 * Módulo do assistente de IA (chat flutuante). Disponível a qualquer usuário
 * autenticado. Usa o `GeminiClient` (API do Google Gemini) e o `PrismaService`
 * (global) para persistir as conversas efêmeras (24h). O `ScheduleModule` do
 * `AppModule` habilita o cron de limpeza diária. O `ProcedimentosService`
 * fornece o passo a passo ilustrado das normativas.
 */
@Module({
  imports: [FiscaisModule],
  providers: [AssistenteService, GeminiClient, ProcedimentosService],
  controllers: [AssistenteController],
  exports: [AssistenteService],
})
export class AssistenteModule {}
