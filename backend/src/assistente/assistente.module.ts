import { Module } from '@nestjs/common';
import { AssistenteController } from './assistente.controller';
import { AssistenteService } from './assistente.service';
import { GeminiClient } from './gemini.client';

/**
 * Módulo do assistente de IA (chat flutuante). Disponível a qualquer usuário
 * autenticado. Usa o `GeminiClient` (API do Google Gemini) e o `PrismaService`
 * (global) para persistir as conversas efêmeras (24h). O `ScheduleModule` do
 * `AppModule` habilita o cron de limpeza diária.
 */
@Module({
  providers: [AssistenteService, GeminiClient],
  controllers: [AssistenteController],
  exports: [AssistenteService],
})
export class AssistenteModule {}
