import { Module } from '@nestjs/common';
import { AcessosModule } from '../acessos/acessos.module';
import { CicloFolhaModule } from '../ciclo-folha/ciclo-folha.module';
import { EscalaDomingoModule } from '../escala-domingo/escala-domingo.module';
import { TiposContratoModule } from '../tipos-contrato/tipos-contrato.module';
import { FolgaService } from './folga.service';
import { JornadaColaboradorController } from './jornada-colaborador.controller';
import { JornadaColaboradorService } from './jornada-colaborador.service';
import { JornadaVigenciaService } from './jornada-vigencia.service';

/**
 * Vigência da jornada (spec `jornada-5x2`, ADR 0027): a jornada prevista de cada
 * pessoa em cada dia, e a regra única de folga (`FolgaService`) que se apoia
 * nela. A escrita das vigências pela ficha (`/colaboradores/:id/jornada`,
 * Fase 4) fica no `JornadaColaboradorService`.
 */
@Module({
  imports: [
    TiposContratoModule,
    EscalaDomingoModule,
    CicloFolhaModule,
    AcessosModule,
  ],
  controllers: [JornadaColaboradorController],
  providers: [JornadaVigenciaService, FolgaService, JornadaColaboradorService],
  exports: [JornadaVigenciaService, FolgaService, JornadaColaboradorService],
})
export class JornadaVigenciaModule {}
