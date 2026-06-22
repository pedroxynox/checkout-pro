import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { InsumosController } from './insumos.controller';
import { InsumosService } from './insumos.service';
import { InsumosProativoService } from './insumos-proativo.service';

/**
 * Módulo do Modulo_Insumos (Req 3.1–3.3): controle de sacolas por fardo,
 * bobinas, panos e demais insumos, com saldo em tempo real (soma dos
 * movimentos), alerta de estoque baixo e sistema proativo de auto-reposição.
 *
 * O `PrismaService` é provido globalmente pelo `PrismaModule`. Exporta o
 * `InsumosService` para uso pela camada de API e pelo cron proativo.
 */
@Module({
  imports: [NotificacoesModule],
  providers: [InsumosService, InsumosProativoService],
  controllers: [InsumosController],
  exports: [InsumosService],
})
export class InsumosModule {}
