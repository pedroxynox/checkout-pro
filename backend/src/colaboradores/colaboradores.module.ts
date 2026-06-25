import { Module } from '@nestjs/common';
import { ColaboradoresController } from './colaboradores.controller';
import { ColaboradoresService } from './colaboradores.service';

/**
 * Cadastro Unificado de Colaboradores: pessoa canônica (matrícula como
 * registro) + identificadores (login/matrícula). Base para a seção
 * "Colaboradores", os perfis e a resolução dos movimentos de arrecadação.
 *
 * O `PrismaService` é provido globalmente pelo `PrismaModule`.
 */
@Module({
  providers: [ColaboradoresService],
  controllers: [ColaboradoresController],
  exports: [ColaboradoresService],
})
export class ColaboradoresModule {}
