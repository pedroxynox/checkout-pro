import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { PontoController } from './ponto.controller';
import { PontoService } from './ponto.service';
import { PontoAlertasService } from './ponto-alertas.service';
import { PontoOcrService } from './ponto-ocr.service';
import {
  LeitorComprovanteService,
  OcrServidorService,
} from './leitor-comprovante.service';

/**
 * Módulo do Registro de Ponto (leitor de comprovante) — Fase A.
 *
 * Registro manual das batidas do relógio físico + cálculo da jornada do dia +
 * alerta de excesso (a cada minuto). O `PrismaService` é global. A Fase B (OCR
 * do comprovante) entra em serviços complementares.
 */
@Module({
  imports: [NotificacoesModule],
  controllers: [PontoController],
  providers: [
    PontoService,
    PontoAlertasService,
    PontoOcrService,
    { provide: LeitorComprovanteService, useClass: OcrServidorService },
  ],
  exports: [PontoService],
})
export class PontoModule {}
