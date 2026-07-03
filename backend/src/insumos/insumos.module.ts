import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { InsumosController } from './insumos.controller';
import { InsumosService } from './insumos.service';
import { InsumosProativoService } from './insumos-proativo.service';
import { PedidosRecorrentesController } from './pedidos-recorrentes.controller';
import { PedidosRecorrentesService } from './pedidos-recorrentes.service';

/**
 * Módulo do Modulo_Insumos: controle de sacolas, bobinas, panos e demais
 * insumos, com saldo em tempo real, sistema proativo de auto-reposição e
 * pedidos recorrentes inteligentes.
 */
@Module({
  imports: [NotificacoesModule],
  providers: [
    InsumosService,
    InsumosProativoService,
    PedidosRecorrentesService,
  ],
  controllers: [InsumosController, PedidosRecorrentesController],
  exports: [InsumosService],
})
export class InsumosModule {}
