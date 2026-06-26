import { Module } from '@nestjs/common';
import { FechamentoModule } from '../fechamento/fechamento.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { MetasModule } from '../metas/metas.module';
import { VendasController } from './vendas.controller';
import { VendasService } from './vendas.service';

/**
 * Módulo de Vendas por hora (Painel de Vendas): importa o arquivo .txt diário,
 * mantém o total em VendaDiaria (usado pelos indicadores) e fornece os totais
 * por período, a distribuição por hora e o painel inteligente (projeção,
 * comparativos, tendência, curva típica, heatmap, padrão e lotação).
 *
 * Importa o FechamentoModule para concluir e avisar os gestores quando todos
 * os arquivos do dia são resolvidos, e o NotificacoesModule para os avisos
 * inteligentes de vendas (recorde, queda, meta em risco). PrismaService é
 * global.
 */
@Module({
  imports: [FechamentoModule, NotificacoesModule, MetasModule],
  providers: [VendasService],
  controllers: [VendasController],
  exports: [VendasService],
})
export class VendasModule {}
