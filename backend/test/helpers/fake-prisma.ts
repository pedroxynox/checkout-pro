/**
 * `PrismaService` falso, em memória, para os testes de integração ponta a
 * ponta (Tarefa 20).
 *
 * Implementa apenas as operações usadas pelos serviços exercitados
 * (importações, checklist e notificações), com a mesma semântica observável do
 * Prisma, permitindo testar o fluxo real controller → service → domínio →
 * persistência sem um banco PostgreSQL. Em uma máquina de desenvolvimento, os
 * mesmos fluxos podem ser exercitados contra um Postgres real.
 */
import { randomUUID } from 'crypto';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface PessoaSeed {
  id: string;
  nome: string;
}

export interface UsuarioSeed {
  id: string;
  login: string;
  perfil: 'GERENTE' | 'FISCAL';
  online: boolean;
}

function chaveChecklist(tipo: string, data: Date): string {
  return `${tipo}|${data.toISOString()}`;
}

/** Estado e implementação do Prisma falso. */
export class FakePrisma {
  operadores: PessoaSeed[] = [];
  fiscaisPessoa: PessoaSeed[] = [];
  usuarios: UsuarioSeed[] = [];

  registrosImportacao: Array<{
    id: string;
    tipo: string;
    dataReferencia: Date;
    importadoEm: Date;
    importadoPor: string | null;
    nomesNaoReconhecidos: string[];
    registros: Array<Record<string, unknown>>;
  }> = [];

  checklists = new Map<
    string,
    {
      id: string;
      tipo: string;
      data: Date;
      status: string;
      imagemUrl: string | null;
      enviadoPor: string | null;
      enviadoEm: Date | null;
    }
  >();

  notificacoes: Array<{
    id: string;
    usuarioId: string;
    titulo: string;
    mensagem: string;
    canalPush: boolean;
    canalInApp: boolean;
    criadaEm: Date;
  }> = [];

  // ----- prisma.operador -----
  operador = {
    findMany: async () =>
      this.operadores.map((o) => ({ id: o.id, nome: o.nome })),
  };

  // ----- prisma.fiscal -----
  fiscal = {
    findMany: async () =>
      this.fiscaisPessoa.map((f) => ({ id: f.id, nome: f.nome })),
  };

  // ----- prisma.usuario -----
  usuario = {
    findMany: async (args?: {
      where?: { online?: boolean; perfil?: string | { in: string[] } };
    }) => {
      const where = args?.where ?? {};
      return this.usuarios.filter((u) => {
        if (where.online !== undefined && u.online !== where.online) {
          return false;
        }
        if (where.perfil !== undefined) {
          const p = where.perfil;
          if (typeof p === 'string' ? u.perfil !== p : !p.in.includes(u.perfil)) {
            return false;
          }
        }
        return true;
      });
    },
  };

  // ----- prisma.registroImportacao -----
  registroImportacao = {
    create: async (args: { data: Record<string, unknown> }) => {
      const data = args.data;
      const registrosCreate =
        (data.registros as { create?: Array<Record<string, unknown>> })
          ?.create ?? [];
      const registro = {
        id: randomUUID(),
        tipo: data.tipo as string,
        dataReferencia: data.dataReferencia as Date,
        importadoEm: (data.importadoEm as Date) ?? new Date(),
        importadoPor: (data.importadoPor as string) ?? null,
        nomesNaoReconhecidos: (data.nomesNaoReconhecidos as string[]) ?? [],
        registros: registrosCreate.map((r) => ({ id: randomUUID(), ...r })),
      };
      this.registrosImportacao.push(registro);
      return registro;
    },
    findMany: async (args?: {
      where?: { dataReferencia?: { gte?: Date; lte?: Date } };
      select?: { tipo?: boolean };
    }) => {
      let lista = [...this.registrosImportacao];
      const intervalo = args?.where?.dataReferencia;
      if (intervalo) {
        lista = lista.filter((r) => {
          const t = r.dataReferencia.getTime();
          if (intervalo.gte && t < intervalo.gte.getTime()) return false;
          if (intervalo.lte && t > intervalo.lte.getTime()) return false;
          return true;
        });
      }
      if (args?.select?.tipo) {
        return lista.map((r) => ({ tipo: r.tipo }));
      }
      return lista;
    },
  };

  // ----- prisma.checklist -----
  checklist = {
    findUnique: async (args: {
      where: { tipo_data: { tipo: string; data: Date } };
    }) => {
      const { tipo, data } = args.where.tipo_data;
      return this.checklists.get(chaveChecklist(tipo, data)) ?? null;
    },
    create: async (args: { data: Record<string, unknown> }) => {
      const d = args.data;
      const registro = {
        id: randomUUID(),
        tipo: d.tipo as string,
        data: d.data as Date,
        status: (d.status as string) ?? 'PENDENTE',
        imagemUrl: (d.imagemUrl as string) ?? null,
        enviadoPor: (d.enviadoPor as string) ?? null,
        enviadoEm: (d.enviadoEm as Date) ?? null,
      };
      this.checklists.set(
        chaveChecklist(registro.tipo, registro.data),
        registro,
      );
      return registro;
    },
    upsert: async (args: {
      where: { tipo_data: { tipo: string; data: Date } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => {
      const { tipo, data } = args.where.tipo_data;
      const chave = chaveChecklist(tipo, data);
      const existente = this.checklists.get(chave);
      if (existente) {
        const atualizado = { ...existente, ...args.update } as typeof existente;
        this.checklists.set(chave, atualizado);
        return atualizado;
      }
      const criado = {
        id: randomUUID(),
        tipo,
        data,
        status: (args.create.status as string) ?? 'PENDENTE',
        imagemUrl: (args.create.imagemUrl as string) ?? null,
        enviadoPor: (args.create.enviadoPor as string) ?? null,
        enviadoEm: (args.create.enviadoEm as Date) ?? null,
      };
      this.checklists.set(chave, criado);
      return criado;
    },
  };

  // ----- prisma.notificacao -----
  notificacao = {
    create: async (args: { data: Record<string, unknown> }) => {
      const d = args.data;
      const registro = {
        id: randomUUID(),
        usuarioId: d.usuarioId as string,
        titulo: d.titulo as string,
        mensagem: d.mensagem as string,
        canalPush: Boolean(d.canalPush),
        canalInApp: Boolean(d.canalInApp),
        criadaEm: new Date(),
      };
      this.notificacoes.push(registro);
      return registro;
    },
    findMany: async (args?: {
      where?: { usuarioId?: string };
      orderBy?: { criadaEm?: 'asc' | 'desc' };
    }) => {
      let lista = [...this.notificacoes];
      if (args?.where?.usuarioId) {
        lista = lista.filter((n) => n.usuarioId === args.where!.usuarioId);
      }
      if (args?.orderBy?.criadaEm === 'desc') {
        lista.sort((a, b) => b.criadaEm.getTime() - a.criadaEm.getTime());
      }
      return lista;
    },
  };
}

/** Cria um `FakePrisma` e o devolve tipado como `PrismaService`. */
export function criarFakePrisma(): {
  fake: FakePrisma;
  prisma: PrismaService;
} {
  const fake = new FakePrisma();
  return { fake, prisma: fake as unknown as PrismaService };
}
