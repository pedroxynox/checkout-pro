import { Module } from '@nestjs/common';
import { FeriadosModule } from '../feriados/feriados.module';
import { CentralJornadaController } from './central-jornada.controller';
import { CentralJornadaService } from './central-jornada.service';

/**
 * Módulo da Central de Jornada. Agrega a jornada do ciclo de folha (26→25) por
 * colaborador do contrato "6x1 - 2x1", reaproveitando o cálculo do Relógio
 * Ponto e os feriados. O `PrismaService` é global.
 */
@Module({
  imports: [FeriadosModule],
  controllers: [CentralJornadaController],
  providers: [CentralJornadaService],
  exports: [CentralJornadaService],
})
export class CentralJornadaModule {}
