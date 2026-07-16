import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  conjuntoBaseDoPerfil,
  conjuntoEfetivoDoPerfil,
  FUNCIONALIDADES_AJUSTAVEIS,
  OverridePermissao,
  Perfil,
  PERFIS_AJUSTAVEIS,
  permissoesEfetivas,
  podeSerAjustada,
} from '../acessos/acessos.domain';
import {
  AjustePermissaoInvalidoError,
  PerfilNaoAjustavelError,
  UsuarioPermissaoAdminError,
  UsuarioPermissaoNaoEncontradoError,
} from './permissoes.errors';

/** Estado de uma funcionalidade ajustável para um usuário, para o painel. */
export interface ItemPermissaoUsuario {
  funcionalidade: string;
  /** Vale de verdade agora (padrão efetivo do perfil ± ajuste do login). */
  efetiva: boolean;
  /** Padrão EFETIVO do perfil (código ± ajustes de perfil). */
  padraoDoPerfil: boolean;
  /** Se difere do padrão do perfil por um ajuste individual. */
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

/** Estado de uma funcionalidade no padrão de um perfil. */
export interface ItemPermissaoPerfil {
  funcionalidade: string;
  /** Ligada no padrão efetivo do perfil (código ± ajustes de perfil). */
  ligada: boolean;
  /** Valor definido em código (linha de base). */
  padraoDeCodigo: boolean;
  /** Se difere do padrão de código por um ajuste. */
  personalizada: boolean;
}

/** Padrão de um perfil para o painel. */
export interface PermissoesDoPerfil {
  perfil: Perfil;
  itens: ItemPermissaoPerfil[];
}

/** Resumo de um perfil ajustável (para a lista de perfis). */
export interface ResumoPerfil {
  perfil: Perfil;
  personalizados: number;
}

/** Entrada da trilha de auditoria (para o histórico). */
export interface ItemAuditoria {
  id: string;
  tipoAlvo: 'USUARIO' | 'PERFIL';
  loginAlvo: string | null;
  perfilAlvo: string | null;
  funcionalidade: string;
  concedida: boolean | null;
  acao: string;
  definidoPor: string | null;
  em: Date;
}

/**
 * Central de Permissões (uso exclusivo do ADMINISTRADOR). Modelo de três
 * camadas: padrão em CÓDIGO → ajustes de PERFIL (banco) → ajustes por LOGIN
 * (banco). Guardamos apenas DESVIOS. Cada mudança é auditada e invalida a
 * sessão dos afetados (bump de `tokenVersion`) para reentrar com as permissões
 * novas.
 */
@Injectable()
export class PermissoesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista de funcionalidades que o painel pode ajustar (ordem do catálogo). */
  catalogoAjustavel(): string[] {
    return [...FUNCIONALIDADES_AJUSTAVEIS];
  }

  private async overridesDoPerfil(
    perfil: Perfil,
  ): Promise<OverridePermissao[]> {
    return this.prisma.perfilPermissao.findMany({
      where: { perfil },
      select: { funcionalidade: true, concedida: true },
    });
  }

  private validarFuncionalidades(ligadas: string[]): void {
    const invalida = ligadas.find((f) => !podeSerAjustada(f));
    if (invalida) {
      throw new AjustePermissaoInvalidoError(invalida);
    }
  }

  // ======================= Ajustes POR LOGIN =======================

  /** Consulta as permissões (padrão do perfil + ajustes) de um usuário. */
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
    const perfilOverrides = await this.overridesDoPerfil(perfil);

    // Padrão do perfil = código ± ajustes de perfil. Efetivo = + ajustes login.
    const padraoPerfil = new Set<string>(
      conjuntoEfetivoDoPerfil(perfil, perfilOverrides),
    );
    const efetivas = new Set<string>(
      permissoesEfetivas(perfil, perfilOverrides, usuario.permissoes),
    );

    const itens: ItemPermissaoUsuario[] = FUNCIONALIDADES_AJUSTAVEIS.map(
      (funcionalidade) => {
        const padraoDoPerfil = acessoTotal || padraoPerfil.has(funcionalidade);
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
   * Define as permissões ajustáveis LIGADAS de um usuário. Persiste apenas os
   * desvios em relação ao padrão EFETIVO do perfil. Idempotente. Não ajusta o
   * ADMINISTRADOR nem funcionalidades protegidas.
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
    this.validarFuncionalidades(ligadas);

    const perfilOverrides = await this.overridesDoPerfil(perfil);
    const ligadasSet = new Set<string>(ligadas);
    const padraoPerfil = new Set<string>(
      conjuntoEfetivoDoPerfil(perfil, perfilOverrides),
    );

    // Um ajuste por login existe só quando difere do padrão efetivo do perfil.
    const desejados: OverridePermissao[] = [];
    for (const funcionalidade of FUNCIONALIDADES_AJUSTAVEIS) {
      const desejada = ligadasSet.has(funcionalidade);
      if (desejada !== padraoPerfil.has(funcionalidade)) {
        desejados.push({ funcionalidade, concedida: desejada });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.usuarioPermissao.deleteMany({ where: { usuarioId } });
      if (desejados.length > 0) {
        await tx.usuarioPermissao.createMany({
          data: desejados.map((o) => ({
            usuarioId,
            funcionalidade: o.funcionalidade,
            concedida: o.concedida,
            definidoPor: definidoPor ?? null,
          })),
        });
        await tx.permissaoAuditoria.createMany({
          data: desejados.map((o) => ({
            usuarioAlvoId: usuarioId,
            loginAlvo: usuario.login,
            funcionalidade: o.funcionalidade,
            concedida: o.concedida,
            acao: 'AJUSTE',
            definidoPor: definidoPor ?? null,
          })),
        });
      }
      await tx.usuario.update({
        where: { id: usuarioId },
        data: { tokenVersion: { increment: 1 } },
      });
    });

    return this.permissoesDoUsuario(usuarioId);
  }

  /** Restaura o usuário ao padrão do perfil (remove os ajustes individuais). */
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

  // ======================= Padrões POR PERFIL =======================

  /** Resumo dos perfis ajustáveis (com a contagem de itens personalizados). */
  async listarPerfis(): Promise<ResumoPerfil[]> {
    const overrides = await this.prisma.perfilPermissao.groupBy({
      by: ['perfil'],
      _count: { _all: true },
    });
    const mapa = new Map<string, number>(
      overrides.map((o) => [o.perfil as string, o._count._all]),
    );
    return PERFIS_AJUSTAVEIS.map((perfil) => ({
      perfil,
      personalizados: mapa.get(perfil) ?? 0,
    }));
  }

  private garantirPerfilAjustavel(perfil: string): Perfil {
    if (!PERFIS_AJUSTAVEIS.includes(perfil as Perfil)) {
      throw new PerfilNaoAjustavelError(perfil);
    }
    return perfil as Perfil;
  }

  /** Consulta o padrão (código ± ajustes) de um perfil ajustável. */
  async permissoesDoPerfil(perfilBruto: string): Promise<PermissoesDoPerfil> {
    const perfil = this.garantirPerfilAjustavel(perfilBruto);
    const overrides = await this.overridesDoPerfil(perfil);
    const codeBase = new Set<string>(conjuntoBaseDoPerfil(perfil));
    const efetivo = new Set<string>(conjuntoEfetivoDoPerfil(perfil, overrides));

    const itens: ItemPermissaoPerfil[] = FUNCIONALIDADES_AJUSTAVEIS.map(
      (funcionalidade) => {
        const ligada = efetivo.has(funcionalidade);
        const padraoDeCodigo = codeBase.has(funcionalidade);
        return {
          funcionalidade,
          ligada,
          padraoDeCodigo,
          personalizada: ligada !== padraoDeCodigo,
        };
      },
    );
    return { perfil, itens };
  }

  /**
   * Define o padrão de um perfil a partir das funcionalidades LIGADAS. Persiste
   * apenas os desvios em relação ao código. Afeta TODOS os usuários do perfil,
   * então invalida a sessão de todos eles (bump de `tokenVersion`).
   */
  async definirPerfil(
    perfilBruto: string,
    ligadas: string[],
    definidoPor?: string,
  ): Promise<PermissoesDoPerfil> {
    const perfil = this.garantirPerfilAjustavel(perfilBruto);
    this.validarFuncionalidades(ligadas);

    const ligadasSet = new Set<string>(ligadas);
    const codeBase = new Set<string>(conjuntoBaseDoPerfil(perfil));

    const desejados: OverridePermissao[] = [];
    for (const funcionalidade of FUNCIONALIDADES_AJUSTAVEIS) {
      const desejada = ligadasSet.has(funcionalidade);
      if (desejada !== codeBase.has(funcionalidade)) {
        desejados.push({ funcionalidade, concedida: desejada });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.perfilPermissao.deleteMany({ where: { perfil } });
      if (desejados.length > 0) {
        await tx.perfilPermissao.createMany({
          data: desejados.map((o) => ({
            perfil,
            funcionalidade: o.funcionalidade,
            concedida: o.concedida,
            definidoPor: definidoPor ?? null,
          })),
        });
        await tx.permissaoAuditoria.createMany({
          data: desejados.map((o) => ({
            perfilAlvo: perfil,
            funcionalidade: o.funcionalidade,
            concedida: o.concedida,
            acao: 'AJUSTE',
            definidoPor: definidoPor ?? null,
          })),
        });
      }
      // Afeta todos os usuários do perfil: força reentrada para valer.
      await tx.usuario.updateMany({
        where: { perfil },
        data: { tokenVersion: { increment: 1 } },
      });
    });

    return this.permissoesDoPerfil(perfil);
  }

  /** Restaura o perfil ao padrão de código (remove os ajustes de perfil). */
  async restaurarPerfil(
    perfilBruto: string,
    definidoPor?: string,
  ): Promise<PermissoesDoPerfil> {
    const perfil = this.garantirPerfilAjustavel(perfilBruto);
    await this.prisma.$transaction(async (tx) => {
      const removidos = await tx.perfilPermissao.deleteMany({
        where: { perfil },
      });
      if (removidos.count > 0) {
        await tx.permissaoAuditoria.create({
          data: {
            perfilAlvo: perfil,
            funcionalidade: '*',
            concedida: null,
            acao: 'RESTAURACAO',
            definidoPor: definidoPor ?? null,
          },
        });
        await tx.usuario.updateMany({
          where: { perfil },
          data: { tokenVersion: { increment: 1 } },
        });
      }
    });
    return this.permissoesDoPerfil(perfil);
  }

  // ======================= Histórico (auditoria) =======================

  /** Últimas mudanças de permissão (login e perfil), mais recentes primeiro. */
  async historico(limite = 100): Promise<ItemAuditoria[]> {
    const take = Math.min(Math.max(limite, 1), 300);
    const registros = await this.prisma.permissaoAuditoria.findMany({
      orderBy: { em: 'desc' },
      take,
    });
    return registros.map((r) => ({
      id: r.id,
      tipoAlvo: r.perfilAlvo ? 'PERFIL' : 'USUARIO',
      loginAlvo: r.loginAlvo ?? null,
      perfilAlvo: r.perfilAlvo ?? null,
      funcionalidade: r.funcionalidade,
      concedida: r.concedida,
      acao: r.acao,
      definidoPor: r.definidoPor ?? null,
      em: r.em,
    }));
  }
}
