import { Module } from '@nestjs/common';
import { FiscaisModule } from '../fiscais/fiscais.module';
import { ColaboradoresController } from './colaboradores.controller';
import { ColaboradoresService } from './colaboradores.service';
import { PerfilColaboradorService } from './perfil-colaborador.service';

/**
 * Cadastro Unificado de Colaboradores: pessoa canônica (matrícula como
 * registro) + identificadores (login/matrícula). Base para a seção
 * "Colaboradores", os perfis e a resolução dos movimentos de arrecadação.
 *
 * Importa o `FiscaisModule` para, no perfil, mostrar o status online/offline e
 * a jornada do fiscal a partir da conta de acesso vinculada (usuarioId).
 * O `PrismaService` é provido globalmente pelo `PrismaModule`.
 */
@Module({
  imports: [FiscaisModule],
  providers: [ColaboradoresService, PerfilColaboradorService],
  controllers: [ColaboradoresController],
  exports: [ColaboradoresService],
})
export class ColaboradoresModule {}
