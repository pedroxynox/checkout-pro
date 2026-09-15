import { Module } from '@nestjs/common';
import { MetasController } from './metas.controller';
import { MetasService } from './metas.service';

/**
 * Módulo das Metas mensais (Centro de Controle ▸ Metas). Fonte única de verdade
 * das metas por período mensal (VENDAS, RECARGAS_CELULAR, CANCELAMENTO_ITENS,
 * CANCELAMENTO_CUPOM, DEVOLUCOES). Exporta o MetasService para que os módulos
 * de Vendas, Arrecadação e Assistente usem a meta do mês ao colorir/projetar os
 * indicadores. PrismaService é global.
 *
 * A meta de VENDAS é derivada: o serviço a calcula somando as estimativas
 * diárias (`estimativas_venda_dia`) em vez de aceitar um valor digitado — por
 * isso lê essa tabela direto pelo Prisma, sem depender do VendasService (que
 * já depende deste módulo).
 */
@Module({
  providers: [MetasService],
  controllers: [MetasController],
  exports: [MetasService],
})
export class MetasModule {}
