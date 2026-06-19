import { Module } from '@nestjs/common';
import { ArrecadacaoController } from './arrecadacao.controller';
import { ArrecadacaoService } from './arrecadacao.service';

/**
 * Modulo_Arrecadacao: importa os arquivos .txt por tipo (troco solidário,
 * recargas, cancelamentos, devoluções) e fornece totais (dia/semana/mês) e
 * ranking por operador para os indicadores. PrismaService é global.
 */
@Module({
  providers: [ArrecadacaoService],
  controllers: [ArrecadacaoController],
  exports: [ArrecadacaoService],
})
export class ArrecadacaoModule {}
