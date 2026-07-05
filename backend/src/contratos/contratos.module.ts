import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { ContratosController } from './contratos.controller';
import { ContratosService } from './contratos.service';
import { ContratosAlertasService } from './contratos-alertas.service';

/**
 * Módulo dos Contratos de experiência (45 + 45 dias) dos operadores.
 *
 * Registra/decide os marcos, deriva o estado do contrato (sem estado
 * redundante persistido) e alimenta os cards, o resumo da carteira e a seção
 * "Tempo de casa" do perfil. Importa o `NotificacoesModule` para o cron diário
 * de alertas aos gestores. O `PrismaService` é global. Exporta o serviço para
 * reuso pelo `ColaboradoresModule` (perfil).
 */
@Module({
  imports: [NotificacoesModule],
  providers: [ContratosService, ContratosAlertasService],
  controllers: [ContratosController],
  exports: [ContratosService],
})
export class ContratosModule {}
