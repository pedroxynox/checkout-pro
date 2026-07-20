import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { DataInicialModule } from '../data-inicial/data-inicial.module';
import { CicloFolhaModule } from '../ciclo-folha/ciclo-folha.module';
import { AtestadosController } from './atestados.controller';
import { AtestadosService } from './atestados.service';

/**
 * Módulo de ATESTADOS médicos (documento + CID + regra do INSS). Cria as faltas
 * justificadas do período via Prisma (global). Importa Notificações (avisos),
 * Data Inicial (validação de data) e Ciclo de Folha (bloquear ciclo fechado).
 */
@Module({
  imports: [NotificacoesModule, DataInicialModule, CicloFolhaModule],
  providers: [AtestadosService],
  controllers: [AtestadosController],
  exports: [AtestadosService],
})
export class AtestadosModule {}
