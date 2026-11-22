import { Module } from '@nestjs/common';
import { EscalaDomingoController } from './escala-domingo.controller';
import { EscalaDomingoService } from './escala-domingo.service';

/**
 * Módulo do rodízio de domingo: leitura/edição da âncora (ponto de partida) da
 * rotação por grupos (G1/G2/G3), guardada no singleton `ConfigSistema`.
 *
 * Exporta o `EscalaDomingoService` (a âncora do rodízio). A regra única de folga
 * (`FolgaService`) mudou-se para o módulo `jornada-vigencia`, porque passou a
 * depender da vigência da jornada de cada pessoa (spec `jornada-5x2`).
 *
 * `PrismaService` é global.
 */
@Module({
  controllers: [EscalaDomingoController],
  providers: [EscalaDomingoService],
  exports: [EscalaDomingoService],
})
export class EscalaDomingoModule {}
