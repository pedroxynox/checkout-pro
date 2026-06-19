import { Module } from '@nestjs/common';
import { AcessosModule } from '../acessos/acessos.module';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';

/**
 * Modulo_Usuarios: gestão de pessoas/acessos (cadastro com login por matrícula,
 * listagem, redefinição de senha e remoção), restrita ao gerente.
 *
 * Importa o AcessosModule para reutilizar o hash de senha (bcrypt). O
 * PrismaService é global.
 */
@Module({
  imports: [AcessosModule],
  providers: [UsuariosService],
  controllers: [UsuariosController],
  exports: [UsuariosService],
})
export class UsuariosModule {}
