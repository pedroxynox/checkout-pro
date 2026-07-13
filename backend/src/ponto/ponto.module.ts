import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { PontoController } from './ponto.controller';
import { PontoService } from './ponto.service';
import { PontoAlertasService } from './ponto-alertas.service';

/**
 * Módulo do Registro de Ponto (leitor de papelito) — Fase A.
 *
 * Registro manual das batidas do relógio físico + cálculo da jornada do dia +
 * alerta de excesso (a cada minuto). O `PrismaService` é global. A Fase B (OCR
 * do papelito) entra em serviços complementares.
 */
@Module({
  imports: [NotificacoesModule],
  controllers: [PontoController],
  providers: [PontoService, PontoAlertasService],
  exports: [PontoService],
})
export class PontoModule {}
