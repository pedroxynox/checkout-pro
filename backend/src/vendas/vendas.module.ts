import { Module } from '@nestjs/common';
import { VendasController } from './vendas.controller';
import { VendasService } from './vendas.service';

/**
 * Módulo de Vendas por hora (Painel de Vendas): importa o arquivo .txt diário,
 * mantém o total em VendaDiaria (usado pelos indicadores) e fornece os totais
 * por período e a distribuição por hora para os gráficos. PrismaService é
 * global.
 */
@Module({
  providers: [VendasService],
  controllers: [VendasController],
  exports: [VendasService],
})
export class VendasModule {}
