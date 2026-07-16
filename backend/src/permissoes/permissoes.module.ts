import { Module } from '@nestjs/common';
import { PermissoesController } from './permissoes.controller';
import { PermissoesService } from './permissoes.service';

/**
 * Central de Permissões (Centro de Controle ▸ Permissões, só ADMINISTRADOR).
 * Ajusta permissões POR LOGIN como desvios do padrão do perfil, com auditoria e
 * invalidação de sessão do usuário-alvo. PrismaService é global.
 */
@Module({
  controllers: [PermissoesController],
  providers: [PermissoesService],
})
export class PermissoesModule {}
