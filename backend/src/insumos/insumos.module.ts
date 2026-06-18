import { Module } from '@nestjs/common';
import { InsumosController } from './insumos.controller';
import { InsumosService } from './insumos.service';

/**
 * Módulo do Modulo_Insumos (Req 3.1–3.3): controle de sacolas por fardo,
 * bobinas por PDV, panos e demais insumos, com saldo em tempo real (soma dos
 * movimentos) e alerta de estoque baixo.
 *
 * O `PrismaService` é provido globalmente pelo `PrismaModule`. Exporta o
 * `InsumosService` para uso pela camada de API (Tarefa 13).
 */
@Module({
  providers: [InsumosService],
  controllers: [InsumosController],
  exports: [InsumosService],
})
export class InsumosModule {}
