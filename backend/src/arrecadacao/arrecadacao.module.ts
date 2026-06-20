import { Module } from '@nestjs/common';
import { FechamentoModule } from '../fechamento/fechamento.module';
import { ArrecadacaoController } from './arrecadacao.controller';
import { ArrecadacaoService } from './arrecadacao.service';

/**
 * Modulo_Arrecadacao: importa os arquivos .txt por tipo (troco solidário,
 * recargas, cancelamentos, devoluções) e fornece totais (dia/semana/mês) e
 * ranking por operador para os indicadores. PrismaService é global.
 *
 * Importa o FechamentoModule para concluir e avisar os gestores quando todos
 * os arquivos do dia são resolvidos.
 */
@Module({
  imports: [FechamentoModule],
  providers: [ArrecadacaoService],
  controllers: [ArrecadacaoController],
  exports: [ArrecadacaoService],
})
export class ArrecadacaoModule {}
