import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { FeriadosModule } from '../feriados/feriados.module';
import { FiscaisModule } from '../fiscais/fiscais.module';
import { DataInicialModule } from '../data-inicial/data-inicial.module';
import { EscalaDomingoModule } from '../escala-domingo/escala-domingo.module';
import { CicloFolhaModule } from '../ciclo-folha/ciclo-folha.module';
import { PontoController } from './ponto.controller';
import { PontoService } from './ponto.service';
import { PontoAlertasService } from './ponto-alertas.service';
import { PontoOcrService } from './ponto-ocr.service';

/**
 * Módulo do Registro de Ponto (leitor de comprovante) — Fase A + B.
 *
 * Registro das batidas + cálculo da jornada + alerta de excesso (a cada
 * minuto) + interpretação do comprovante (texto lido no APK pelo ML Kit). O
 * `PrismaService` é global. Não há OCR de imagem no servidor.
 */
@Module({
  imports: [
    NotificacoesModule,
    FeriadosModule,
    FiscaisModule,
    DataInicialModule,
    EscalaDomingoModule,
    CicloFolhaModule,
  ],
  controllers: [PontoController],
  providers: [PontoService, PontoAlertasService, PontoOcrService],
  exports: [PontoService],
})
export class PontoModule {}
