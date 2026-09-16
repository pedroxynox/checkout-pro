import { Module } from '@nestjs/common';
import { FechamentoModule } from '../fechamento/fechamento.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { MetasModule } from '../metas/metas.module';
import { DataInicialModule } from '../data-inicial/data-inicial.module';
import { ArrecadacaoController } from './arrecadacao.controller';
import { ArrecadacaoService } from './arrecadacao.service';
import { CancelamentosTotaisService } from './cancelamentos-totais.service';
import { HistoricoIndicadoresService } from './historico-indicadores.service';
import { IndicadoresInteligenteService } from './indicadores-inteligente.service';
import { IndicadoresResumoService } from './indicadores-resumo.service';

/**
 * Modulo_Arrecadacao: importa os arquivos .txt por tipo (troco solidário,
 * recargas, cancelamentos, devoluções) e fornece totais (dia/semana/mês) e
 * ranking por operador para os indicadores. PrismaService é global.
 *
 * Inclui a camada de inteligência (tendência, comparativo, projeção, operador
 * do mês, anomalias), o resumo diário automático (cron), o Histórico de
 * Indicadores (janela móvel de meses com foto mensal e limpeza automática) e o
 * indicador **calculado** Cancelamentos Totais (soma das duas metades de
 * cancelamento sobre as vendas — sem arquivo próprio de importação).
 *
 * Importa o FechamentoModule para concluir e avisar os gestores quando todos
 * os arquivos do dia são resolvidos, e o NotificacoesModule para o resumo.
 */
@Module({
  imports: [
    FechamentoModule,
    NotificacoesModule,
    MetasModule,
    DataInicialModule,
  ],
  providers: [
    ArrecadacaoService,
    IndicadoresInteligenteService,
    IndicadoresResumoService,
    HistoricoIndicadoresService,
    CancelamentosTotaisService,
  ],
  controllers: [ArrecadacaoController],
  exports: [
    ArrecadacaoService,
    IndicadoresInteligenteService,
    HistoricoIndicadoresService,
    CancelamentosTotaisService,
  ],
})
export class ArrecadacaoModule {}
