import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  conjuntoBaseDoPerfil,
  FUNCIONALIDADES_AJUSTAVEIS,
  OverridePermissao,
  Perfil,
  permissoesEfetivas,
  podeSerAjustada,
} from '../acessos/acessos.domain';
import {
  AjustePermissaoInvalidoError,
  UsuarioPermissaoAdminError,
  UsuarioPermissaoNaoEncontradoError,
} from './permissoes.errors';

/** Estado de uma funcionalidade ajustável para um usuário, para o painel. */
export interface ItemPermissaoUsuario {
  funcionalidade: string;
  /** Vale de verdade agora (padrão do perfil ± ajuste). */
  efetiva: boolean;
  /** Valor padrão do perfil (sem ajustes). */
  padraoDoPerfil: boolean;
  /** Se difere do padrão por um ajuste manual. */
  personalizada: boolean;
}

/** Visão completa das permissões de um usuário para o painel do admin. */
export interface PermissoesDoUsuario {
  usuarioId: string;
  login: string;
  nome: string | null;
  perfil: Perfil;
  /** true para o próprio ADMINISTRADOR: acesso total e não ajustável. */
  acessoTotal: boolean;
  itens: ItemPermissaoUsuario[];
}

/**
 * Central de Permissões (uso exclusivo do ADMINISTRADOR): consulta e ajusta as
 * permissões POR LOGIN. O perfil continua definindo o padrão; aqui guardamos
 * apenas os DESVIOS (`UsuarioPermissao`). Cada mudança é auditada e invalida a
 * sessão do usuário-alvo (bump de `tokenVersion`) para reentrar já com as
 * permissões novas.
 */
@Injectable()
export class PermissoesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista de funcionalidades que o painel pode ajustar (ordem do catálogo). */
  catalogoAjustavel(): string[] {
    return [...FUNCIONALIDADES_AJUSTAVEIS];
  }

  /** Consulta as permissões (padrão + ajustes) de um usuário para o painel. */
  async permissoesDoUsuario(usuarioId: string): Promise<PermissoesDoUsuario> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        login: true,
        nome: true,
        perfil: true,
        permissoes: { select: { funcionalidade: true, concedida: true } },
      },
    });
    if (!usuario) {
      throw new UsuarioPermissaoNaoEncontradoError();
    }

    const perfil = usuario.perfil as Perfil;
    const acessoTotal = perfil === 'ADMINISTRADOR';
    const base = new Set<string>(conjuntoBaseDoPerfil(perfil));
    const efetivas = new Set<string>(permissoesEfetivas(perfil, usuario.permissoes));

    const itens: ItemPermissaoUsuario[] = FUNCIONALIDADES_AJUSTAVEIS.map(
      (funcionalidade) => {
        const padraoDoPerfil = acessoTotal || base.has(funcionalidade);
        const efetiva = acessoTotal || efetivas.has(funcionalidade);
        return {
          funcionalidade,
          efetiva,
          padraoDoPerfil,
          personalizada: efetiva !== padraoDoPerfil,
        };
      },
    );

    return {
      usuarioId: usuario.id,
      login: usuario.login,
      nome: usuario.nome ?? null,
      perfil,
      acessoTotal,
      itens,
    };
  }

  /**
   * Define as permissões EFETIVAS ajustáveis de um usuário a partir da lista de
   * funcionalidades que devem ficar LIGADAS. O serviço calcula os desvios em
   * relação ao padrão do perfil e persiste apenas esses desvios. Idempotente.
   *
   * Regras de segurança:
   * - Não permite ajustar o ADMINISTRADOR (acesso total imutável).
   * - Ignora/recusa funcionalidades protegidas ou inexistentes.
   */
  async definirPermissoes(
    usuarioId: string,
    ligadas: string[],
    definidoPor?: string,
  ): Promise<PermissoesDoUsuario> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, login: true, perfil: true },
    });
    if (!usuario) {
      throw new UsuarioPermissaoNaoEncontradoError();
    }
    const perfil = usuario.perfil as Perfil;
    if (perfil === 'ADMINISTRADOR') {
      throw new UsuarioPermissaoAdminError();
    }

    // Só funcionalidades ajustáveis (existentes e não protegidas).
    const invalida = ligadas.find((f) => !podeSerAjustada(f));
    if (invalida) {
      throw new AjustePermissaoInvalidoError(invalida);
    }

    const ligadasSet = new Set<string>(ligadas);
    const base = new Set<string>(conjuntoBaseDoPerfil(perfil));

    // Um override existe só quando o desejado difere do padrão do perfil.
    const overridesDesejados: OverridePermissao[] = [];
    for (const funcionalidade of FUNCIONALIDADES_AJUSTAVEIS) {
      const desejada = ligadasSet.has(funcionalidade);
      const padrao = base.has(funcionalidade);
      if (desejada !== padrao) {
        overridesDesejados.push({ funcionalidade, concedida: desejada });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // Substitui o conjunto de ajustes do usuário pelos desejados.
      await tx.usuarioPermissao.deleteMany({ where: { usuarioId } });
      if (overridesDesejados.length > 0) {
        await tx.usuarioPermissao.createMany({
          data: overridesDesejados.map((o) => ({
            usuarioId,
            funcionalidade: o.funcionalidade,
            concedida: o.concedida,
            definidoPor: definidoPor ?? null,
          })),
        });
      }
      // Auditoria (append-only) de cada desvio aplicado.
      if (overridesDesejados.length > 0) {
        await tx.permissaoAuditoria.createMany({
          data: overridesDesejados.map((o) => ({
            usuarioAlvoId: usuarioId,
            loginAlvo: usuario.login,
            funcionalidade: o.funcionalidade,
            concedida: o.concedida,
            acao: 'AJUSTE',
            definidoPor: definidoPor ?? null,
          })),
        });
      }
      // Invalida a sessão do usuário-alvo para reentrar com as novas permissões.
      await tx.usuario.update({
        where: { id: usuarioId },
        data: { tokenVersion: { increment: 1 } },
      });
    });

    return this.permissoesDoUsuario(usuarioId);
  }

  /**
   * Restaura o usuário ao padrão do perfil: remove todos os ajustes e invalida
   * a sessão. Registra a restauração na auditoria.
   */
  async restaurarPadrao(
    usuarioId: string,
    definidoPor?: string,
  ): Promise<PermissoesDoUsuario> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, login: true, perfil: true },
    });
    if (!usuario) {
      throw new UsuarioPermissaoNaoEncontradoError();
    }
    if ((usuario.perfil as Perfil) === 'ADMINISTRADOR') {
      throw new UsuarioPermissaoAdminError();
    }

    await this.prisma.$transaction(async (tx) => {
      const removidos = await tx.usuarioPermissao.deleteMany({
        where: { usuarioId },
      });
      if (removidos.count > 0) {
        await tx.permissaoAuditoria.create({
          data: {
            usuarioAlvoId: usuarioId,
            loginAlvo: usuario.login,
            funcionalidade: '*',
            concedida: null,
            acao: 'RESTAURACAO',
            definidoPor: definidoPor ?? null,
          },
        });
        await tx.usuario.update({
          where: { id: usuarioId },
          data: { tokenVersion: { increment: 1 } },
        });
      }
    });

    return this.permissoesDoUsuario(usuarioId);
  }
}
