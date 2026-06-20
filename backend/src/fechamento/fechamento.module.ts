import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { FechamentoService } from './fechamento.service';

/**
 * Módulo de Fechamento do dia: detecta quando todos os arquivos do dia estão
 * resolvidos (arrecadações + vendas) e notifica os gestores. Usado por
 * Arrecadação e Vendas. PrismaService é global.
 */
@Module({
  imports: [NotificacoesModule],
  providers: [FechamentoService],
  exports: [FechamentoService],
})
export class FechamentoModule {}
