import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { CheckoutsController } from './checkouts.controller';
import { CheckoutsService } from './checkouts.service';

/**
 * Seção Check-Outs: reportes de avaria de equipamentos por caixa (com foto),
 * notificação à gestão e resolução. A quantidade de caixas vive em
 * `ConfigSistema`. PrismaService e OBJECT_STORAGE são globais; NotificacoesModule
 * fornece o envio de avisos por permissão.
 */
@Module({
  imports: [NotificacoesModule],
  controllers: [CheckoutsController],
  providers: [CheckoutsService],
})
export class CheckoutsModule {}
