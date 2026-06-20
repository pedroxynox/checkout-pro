import { Module } from '@nestjs/common';
import { FechamentoModule } from '../fechamento/fechamento.module';
import { VendasController } from './vendas.controller';
import { VendasService } from './vendas.service';

/**
 * Módulo de Vendas por hora (Painel de Vendas): importa o arquivo .txt diário,
 * mantém o total em VendaDiaria (usado pelos indicadores) e fornece os totais
 * por período e a distribuição por hora para os gráficos. PrismaService é
 * global.
 *
 * Importa o FechamentoModule para concluir e avisar os gestores quando todos
 * os arquivos do dia são resolvidos.
 */
@Module({
  imports: [FechamentoModule],
  providers: [VendasService],
  controllers: [VendasController],
  exports: [VendasService],
})
export class VendasModule {}
