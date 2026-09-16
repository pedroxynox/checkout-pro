import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { MetasModule } from '../metas/metas.module';
import { InsumosController } from './insumos.controller';
import { InsumosService } from './insumos.service';
import { InsumosProativoService } from './insumos-proativo.service';
import { IndicadorSacolasService } from './indicador-sacolas.service';
import { PedidosRecorrentesController } from './pedidos-recorrentes.controller';
import { PedidosRecorrentesService } from './pedidos-recorrentes.service';

/**
 * Módulo do Modulo_Insumos: controle de sacolas, bobinas, panos e demais
 * insumos, com saldo em tempo real, sistema proativo de auto-reposição e
 * pedidos recorrentes inteligentes.
 *
 * Importa `MetasModule` por causa do indicador SACOLAS (ADR 0022), cuja **meta**
 * é resolvida pelo `MetasService` — o mesmo ponto único que todas as outras metas
 * usam. O cálculo do valor apurado fica aqui, onde vive o denominador (as
 * entradas de sacola no estoque).
 */
@Module({
  imports: [NotificacoesModule, MetasModule],
  providers: [
    InsumosService,
    InsumosProativoService,
    IndicadorSacolasService,
    PedidosRecorrentesService,
  ],
  controllers: [InsumosController, PedidosRecorrentesController],
  exports: [InsumosService, IndicadorSacolasService],
})
export class InsumosModule {}
