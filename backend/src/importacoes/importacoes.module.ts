import { Module } from '@nestjs/common';
import { ImportacoesController } from './importacoes.controller';
import { ImportacoesService } from './importacoes.service';

/**
 * Modulo_Importacoes: importação e validação dos quatro arquivos diários
 * (Req 1.1), status diário por arquivo (Req 1.2), histórico (Req 1.3) e
 * pendentes de fim do dia (Req 1.4).
 *
 * O `PrismaService` é provido globalmente pelo `PrismaModule`. Exporta o
 * `ImportacoesService` para uso pela camada de API (Tarefa 13) e pelos cron
 * jobs (Tarefa 15).
 */
@Module({
  providers: [ImportacoesService],
  controllers: [ImportacoesController],
  exports: [ImportacoesService],
})
export class ImportacoesModule {}
