import { Module } from '@nestjs/common';
import { TiposContratoController } from './tipos-contrato.controller';
import { TiposContratoService } from './tipos-contrato.service';

/**
 * Módulo de Tipos de Contrato de jornada (data-driven). Exporta o serviço para
 * que o cálculo da jornada (ponto/central/fiscais) possa resolver as regras do
 * contrato de cada colaborador — cabeamento previsto para a próxima fase.
 */
@Module({
  controllers: [TiposContratoController],
  providers: [TiposContratoService],
  exports: [TiposContratoService],
})
export class TiposContratoModule {}
