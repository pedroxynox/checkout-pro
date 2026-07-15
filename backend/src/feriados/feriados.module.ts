import { Module } from '@nestjs/common';
import { FeriadosController } from './feriados.controller';
import { FeriadosService } from './feriados.service';

/**
 * Módulo de Feriados. Reconhece os feriados nacionais automaticamente e permite
 * ao gestor cadastrar os estaduais/municipais. Exporta o `FeriadosService` para
 * a Central de Jornada aplicar a regra de 100% nos feriados.
 */
@Module({
  controllers: [FeriadosController],
  providers: [FeriadosService],
  exports: [FeriadosService],
})
export class FeriadosModule {}
