import { Module } from '@nestjs/common';
import { EscalaDomingoModule } from '../escala-domingo/escala-domingo.module';
import { TiposContratoModule } from '../tipos-contrato/tipos-contrato.module';
import { FolgaService } from './folga.service';
import { JornadaVigenciaService } from './jornada-vigencia.service';

/**
 * Vigência da jornada (spec `jornada-5x2`, ADR 0027): a jornada prevista de cada
 * pessoa em cada dia, e a regra única de folga (`FolgaService`) que se apoia
 * nela. Sem controller nesta fase — a escrita das vigências entra com a tela da
 * ficha (Fase 4).
 */
@Module({
  imports: [TiposContratoModule, EscalaDomingoModule],
  providers: [JornadaVigenciaService, FolgaService],
  exports: [JornadaVigenciaService, FolgaService],
})
export class JornadaVigenciaModule {}
