import { Module } from '@nestjs/common';
import { FechamentoModule } from '../fechamento/fechamento.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { ArrecadacaoController } from './arrecadacao.controller';
import { ArrecadacaoService } from './arrecadacao.service';
import { IndicadoresInteligenteService } from './indicadores-inteligente.service';
import { IndicadoresResumoService } from './indicadores-resumo.service';

/**
 * Modulo_Arrecadacao: importa os arquivos .txt por tipo (troco solidário,
 * recargas, cancelamentos, devoluções) e fornece totais (dia/semana/mês) e
 * ranking por operador para os indicadores. PrismaService é global.
 *
 * Inclui a camada de inteligência (tendência, comparativo, projeção, operador
 * do mês, anomalias) e o resumo diário automático (cron).
 *
 * Importa o FechamentoModule para concluir e avisar os gestores quando todos
 * os arquivos do dia são resolvidos, e o NotificacoesModule para o resumo.
 */
@Module({
  imports: [FechamentoModule, NotificacoesModule],
  providers: [
    ArrecadacaoService,
    IndicadoresInteligenteService,
    IndicadoresResumoService,
  ],
  controllers: [ArrecadacaoController],
  exports: [ArrecadacaoService, IndicadoresInteligenteService],
})
export class ArrecadacaoModule {}
