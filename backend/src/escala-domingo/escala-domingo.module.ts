import { Module } from '@nestjs/common';
import { EscalaDomingoController } from './escala-domingo.controller';
import { EscalaDomingoService } from './escala-domingo.service';
import { FolgaService } from './folga.service';

/**
 * Módulo do rodízio de domingo: leitura/edição da âncora (ponto de partida) da
 * rotação por grupos (G1/G2/G3), guardada no singleton `ConfigSistema`.
 *
 * Exporta dois serviços:
 * - `EscalaDomingoService` — a âncora do rodízio;
 * - `FolgaService` — a **regra única de folga** (ficha + escala semanal),
 *   consumida pela equipe do dia, pela criação de falta, pela auto-cura e pelo
 *   Quadro de Operadores, para que todos respondam a mesma coisa.
 *
 * `PrismaService` é global.
 */
@Module({
  controllers: [EscalaDomingoController],
  providers: [EscalaDomingoService, FolgaService],
  exports: [EscalaDomingoService, FolgaService],
})
export class EscalaDomingoModule {}
