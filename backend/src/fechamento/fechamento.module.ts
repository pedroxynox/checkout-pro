import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { FechamentoController } from './fechamento.controller';
import { FechamentoService } from './fechamento.service';

/**
 * Módulo de Fechamento do dia: detecta quando todos os arquivos do dia estão
 * resolvidos (arrecadações + vendas) e notifica os gestores. Também expõe o
 * resumo inteligente do dia (controller). Usado por Arrecadação e Vendas.
 * PrismaService é global.
 */
@Module({
  imports: [NotificacoesModule],
  controllers: [FechamentoController],
  providers: [FechamentoService],
  exports: [FechamentoService],
})
export class FechamentoModule {}
