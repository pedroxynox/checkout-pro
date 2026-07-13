import { Module } from '@nestjs/common';
import { PontoController } from './ponto.controller';
import { PontoService } from './ponto.service';

/**
 * Módulo do Registro de Ponto (leitor de papelito) — Fase A.
 *
 * Registro manual das batidas do relógio físico + cálculo da jornada do dia.
 * O `PrismaService` é global. A Fase B (OCR do papelito) e o alerta de excesso
 * entram em módulos/serviços complementares.
 */
@Module({
  controllers: [PontoController],
  providers: [PontoService],
  exports: [PontoService],
})
export class PontoModule {}
