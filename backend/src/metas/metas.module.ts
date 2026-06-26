import { Module } from '@nestjs/common';
import { MetasController } from './metas.controller';
import { MetasService } from './metas.service';

/**
 * Módulo das Metas mensais (Centro de Controle ▸ Metas). Fonte única de verdade
 * das metas por período mensal (VENDAS, RECARGAS_CELULAR, CANCELAMENTO_ITENS,
 * CANCELAMENTO_CUPOM, DEVOLUCOES). Exporta o MetasService para que os módulos
 * de Vendas e Arrecadação usem a meta do mês ao colorir/projetar os
 * indicadores. PrismaService é global.
 */
@Module({
  providers: [MetasService],
  controllers: [MetasController],
  exports: [MetasService],
})
export class MetasModule {}
