import { Module } from '@nestjs/common';
import { CicloFolhaController } from './ciclo-folha.controller';
import { CicloFolhaService } from './ciclo-folha.service';

/**
 * Módulo do fechamento/reabertura do ciclo de folha (26→25).
 *
 * Autônomo (só depende do Prisma global + do cálculo puro de período), para ser
 * importado tanto pelo Ponto quanto pela Central de Jornada sem dependência
 * circular. Exporta `CicloFolhaService` (estado + `exigirCicloAberto`).
 */
@Module({
  controllers: [CicloFolhaController],
  providers: [CicloFolhaService],
  exports: [CicloFolhaService],
})
export class CicloFolhaModule {}
