import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { DataInicialModule } from '../data-inicial/data-inicial.module';
import { IncidenciasController } from './incidencias.controller';
import { IncidenciasService } from './incidencias.service';

/**
 * Módulo de Incidências de Escala (Fase 1 — evento "não retornou do
 * intervalo"). Registra/edita/remove incidências por data, auto-detecta
 * candidatos a partir do ponto dos fiscais, gera ranking e o resumo analítico
 * do colaborador (consumido pelo perfil).
 *
 * Importa o `NotificacoesModule` para o aviso automático ao cruzar o limite
 * mensal. O `PrismaService` é provido globalmente pelo `PrismaModule`. Exporta
 * o serviço para reuso pelo `ColaboradoresModule` (enriquecimento do perfil).
 */
@Module({
  imports: [NotificacoesModule, DataInicialModule],
  providers: [IncidenciasService],
  controllers: [IncidenciasController],
  exports: [IncidenciasService],
})
export class IncidenciasModule {}
