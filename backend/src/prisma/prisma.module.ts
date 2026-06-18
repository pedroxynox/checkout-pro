import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Módulo global de acesso ao banco de dados. Exporta o `PrismaService` para
 * que qualquer módulo funcional possa injetá-lo sem reimportá-lo.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
