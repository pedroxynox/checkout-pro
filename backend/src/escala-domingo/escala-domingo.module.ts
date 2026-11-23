import { Module } from '@nestjs/common';
import { CicloFolhaModule } from '../ciclo-folha/ciclo-folha.module';
import { EscalaDomingoController } from './escala-domingo.controller';
import { EscalaDomingoService } from './escala-domingo.service';
import { RodizioFolgasController } from './rodizio-folgas.controller';
import { RodizioFolgasService } from './rodizio-folgas.service';

/**
 * Módulo dos rodízios por grupo (G1/G2/G3):
 *
 * - **rodízio de domingo** (regime 6x1): a âncora (ponto de partida), guardada
 *   no singleton `ConfigSistema`;
 * - **rodízio de folgas** (5x2, spec `jornada-5x2`, Fase 3): as vigências de
 *   `rodizio_folgas_vigencias`, com validação, avisos e prévia.
 *
 * Exporta o `EscalaDomingoService` (a âncora do rodízio). A regra única de folga
 * (`FolgaService`) mudou-se para o módulo `jornada-vigencia`, porque passou a
 * depender da vigência da jornada de cada pessoa (spec `jornada-5x2`).
 *
 * `PrismaService` é global.
 */
@Module({
  imports: [CicloFolhaModule],
  controllers: [EscalaDomingoController, RodizioFolgasController],
  providers: [EscalaDomingoService, RodizioFolgasService],
  exports: [EscalaDomingoService, RodizioFolgasService],
})
export class EscalaDomingoModule {}
