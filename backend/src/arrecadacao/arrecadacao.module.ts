import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { ArrecadacaoController } from './arrecadacao.controller';
import { ArrecadacaoService } from './arrecadacao.service';

/**
 * Modulo_Arrecadacao: importa os arquivos .txt por tipo (troco solidário,
 * recargas, cancelamentos, devoluções) e fornece totais (dia/semana/mês) e
 * ranking por operador para os indicadores. PrismaService é global.
 *
 * Importa o NotificacoesModule para avisar os gerentes quando o fechamento do
 * dia é concluído (todos os arquivos enviados).
 */
@Module({
  imports: [NotificacoesModule],
  providers: [ArrecadacaoService],
  controllers: [ArrecadacaoController],
  exports: [ArrecadacaoService],
})
export class ArrecadacaoModule {}
