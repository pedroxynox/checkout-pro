import { Module } from '@nestjs/common';
import { EscalaDomingoModule } from '../escala-domingo/escala-domingo.module';
import { FeriasModule } from '../ferias/ferias.module';
import { EscalaExportacaoController } from './escala-exportacao.controller';
import { EscalaExportacaoService } from './escala-exportacao.service';

/**
 * Módulo da escala publicada (PDF/imagem enviados à equipe).
 *
 * Importa o rodízio de domingo (âncora dos grupos) e as férias (quem está de
 * férias aparece como tal, e não como falta). Feriados vêm da consulta
 * compartilhada `carregarMapaDeFeriados` — a MESMA que o `FeriadosService` usa —
 * sem depender do módulo de feriados: uma função sobre o Prisma (que é global)
 * dá a fonte única sem a aresta de módulo, e sem o risco de uma dependência
 * opcional degradar para "nenhum feriado existe". `PrismaService` é global.
 */
@Module({
  imports: [EscalaDomingoModule, FeriasModule],
  controllers: [EscalaExportacaoController],
  providers: [EscalaExportacaoService],
  exports: [EscalaExportacaoService],
})
export class EscalaExportacaoModule {}
