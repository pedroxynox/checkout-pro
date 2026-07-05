import { Module } from '@nestjs/common';
import { AcessosModule } from '../acessos/acessos.module';
import { FiscaisModule } from '../fiscais/fiscais.module';
import { IncidenciasModule } from '../incidencias/incidencias.module';
import { MetasModule } from '../metas/metas.module';
import { ColaboradoresController } from './colaboradores.controller';
import { ColaboradoresService } from './colaboradores.service';
import { PerfilColaboradorService } from './perfil-colaborador.service';

/**
 * Cadastro Unificado de Colaboradores: pessoa canônica (matrícula como
 * registro) + identificadores (login/matrícula). Base para a seção
 * "Colaboradores", os perfis e a resolução dos movimentos de arrecadação.
 *
 * Importa o `AcessosModule` para criar/atualizar a conta de acesso (login do
 * app) ao cadastrar fiscal/supervisor/gerente, o `FiscaisModule` para mostrar
 * status/jornada no perfil, o `IncidenciasModule` para a seção de incidências
 * de escala do perfil e o `MetasModule` para resolver as metas globais mensais
 * usadas na meta individual derivada do score. O `PrismaService` é global.
 */
@Module({
  imports: [AcessosModule, FiscaisModule, IncidenciasModule, MetasModule],
  providers: [ColaboradoresService, PerfilColaboradorService],
  controllers: [ColaboradoresController],
  exports: [ColaboradoresService],
})
export class ColaboradoresModule {}
