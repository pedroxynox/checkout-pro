import { Module } from '@nestjs/common';
import { InsumosModule } from '../insumos/insumos.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { RequisicoesController } from './requisicoes.controller';
import { RequisicoesService } from './requisicoes.service';

/**
 * Módulo de Requisições de insumos. Usa o `InsumosService` (entrada no estoque
 * ao aprovar) e o `NotificacoesService` (avisos a gestores/solicitante).
 */
@Module({
  imports: [InsumosModule, NotificacoesModule],
  providers: [RequisicoesService],
  controllers: [RequisicoesController],
  exports: [RequisicoesService],
})
export class RequisicoesModule {}
