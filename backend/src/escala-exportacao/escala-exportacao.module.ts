import { Module } from '@nestjs/common';
import { EscalaDomingoModule } from '../escala-domingo/escala-domingo.module';
import { FeriasModule } from '../ferias/ferias.module';
import { EscalaExportacaoController } from './escala-exportacao.controller';
import { EscalaExportacaoService } from './escala-exportacao.service';

/**
 * Módulo da escala publicada (PDF/imagem enviados à equipe).
 *
 * Importa o rodízio de domingo (âncora dos grupos) e as férias (quem está de
 * férias aparece como tal, e não como falta). Feriados são lidos direto do
 * banco + da regra dos nacionais, sem depender do módulo de feriados, para não
 * criar uma dependência só por uma consulta. `PrismaService` é global.
 */
@Module({
  imports: [EscalaDomingoModule, FeriasModule],
  controllers: [EscalaExportacaoController],
  providers: [EscalaExportacaoService],
  exports: [EscalaExportacaoService],
})
export class EscalaExportacaoModule {}
