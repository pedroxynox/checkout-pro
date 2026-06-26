import { Injectable } from '@nestjs/common';
import {
  Colaborador,
  FuncaoColaborador,
  Prisma,
  TurnoColaborador,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizarLogin, normalizarMatricula } from './colaboradores.domain';
import {
  ColaboradorNaoEncontradoError,
  LoginAppDuplicadoError,
  LoginAppInexistenteError,
  LoginColaboradorDuplicadoError,
  MatriculaColaboradorDuplicadaError,
} from './colaboradores.errors';

/** Dados de cadastro/edição de um colaborador. */
export interface ColaboradorInput {
  nome: string;
  matricula: string;
  login?: string | null;
  funcao?: FuncaoColaborador;
  genero?: string | null;
  turno?: TurnoColaborador | null;
  entradaSemana?: string | null;
  saidaSemana?: string | null;
  entradaFds?: string | null;
  saidaFds?: string | null;
  folgaDiaSemana?: number | null;
  /**
   * Conta de acesso do app (Usuario.id) vinculada a este colaborador. É o elo
   * que liga a ficha ao login — e, por ele, ao status online/offline e à
   * jornada do fiscal. String vazia na edição = desvincular.
   */
  usuarioId?: string | null;
}

/** Um login (conta de acesso) disponível para vincular a um colaborador. */
export interface LoginColaborador {
  id: string;
  login: string;
  nome: string | null;
  perfil: string;
  /** Colaborador já vinculado a este login (null se livre). */
  colaboradorId: string | null;
  colaboradorNome: string | null;
}

export interface FiltroColaboradores {
  busca?: string;
  funcao?: FuncaoColaborador;
  turno?: TurnoColaborador;
  ativo?: boolean;
}

/**
 * Serviço do Cadastro Unificado de Colaboradores (Fase 4 do spec
 * `cadastro-colaboradores`). Cuida do CRUD do colaborador e dos seus
 * identificadores (`MATRICULA` e `LOGIN`), mantendo a unicidade. Os modelos
 * antigos (Operador/OperadorTurno/Fiscal) seguem intactos durante a transição.
 */
@Injectable()
export class ColaboradoresService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cadastra um colaborador (operador por padrão) e seus identificadores. */
  async cadastrar(input: ColaboradorInput): Promise<Colaborador> {
    const matricula = normalizarMatricula(input.matricula);
    const login = input.login ? normalizarLogin(input.login) : undefined;
    const usuarioId = input.usuarioId ? input.usuarioId : undefined;

    const jaMatricula = await this.prisma.colaborador.findUnique({
      where: { matricula },
    });
    if (jaMatricula) {
      throw new MatriculaColaboradorDuplicadaError(matricula);
    }
    if (login) {
      const jaLogin = await this.prisma.colaboradorIdentificador.findUnique({
        where: { tipo_valor: { tipo: 'LOGIN', valor: login } },
      });
      if (jaLogin) {
        throw new LoginColaboradorDuplicadoError(login);
      }
    }
    if (usuarioId) {
      await this.garantirUsuarioVinculavel(usuarioId, null);
    }

    return this.prisma.colaborador.create({
      data: {
        matricula,
        nome: input.nome.trim(),
        funcao: input.funcao ?? 'OPERADOR',
        genero: input.genero ?? null,
        turno: input.turno ?? null,
        entradaSemana: input.entradaSemana ?? null,
        saidaSemana: input.saidaSemana ?? null,
        entradaFds: input.entradaFds ?? null,
        saidaFds: input.saidaFds ?? null,
        folgaDiaSemana: input.folgaDiaSemana ?? null,
        usuarioId: usuarioId ?? null,
        identificadores: {
          create: [
            { tipo: 'MATRICULA', valor: matricula },
            ...(login ? [{ tipo: 'LOGIN' as const, valor: login }] : []),
          ],
        },
      },
    });
  }

  /** Edita um colaborador, mantendo a unicidade de matrícula/login. */
  async editar(
    id: string,
    input: Partial<ColaboradorInput> & { ativo?: boolean },
  ): Promise<Colaborador> {
    const atual = await this.prisma.colaborador.findUnique({ where: { id } });
    if (!atual) {
      throw new ColaboradorNaoEncontradoError();
    }

    const data: Prisma.ColaboradorUpdateInput = {};
    if (input.nome !== undefined) data.nome = input.nome.trim();
    if (input.genero !== undefined) data.genero = input.genero;
    if (input.funcao !== undefined) data.funcao = input.funcao;
    if (input.turno !== undefined) data.turno = input.turno;
    if (input.entradaSemana !== undefined)
      data.entradaSemana = input.entradaSemana;
    if (input.saidaSemana !== undefined) data.saidaSemana = input.saidaSemana;
    if (input.entradaFds !== undefined) data.entradaFds = input.entradaFds;
    if (input.saidaFds !== undefined) data.saidaFds = input.saidaFds;
    if (input.folgaDiaSemana !== undefined)
      data.folgaDiaSemana = input.folgaDiaSemana;
    if (input.ativo !== undefined) data.ativo = input.ativo;

    // Conta de acesso (login do app): string vazia/null = desvincular.
    if (input.usuarioId !== undefined) {
      const novoUsuario = input.usuarioId ? input.usuarioId : null;
      if (novoUsuario) {
        await this.garantirUsuarioVinculavel(novoUsuario, id);
      }
      data.usuarioId = novoUsuario;
    }

    // Matrícula (registro) — checa unicidade se mudar.
    let novaMatricula: string | undefined;
    if (input.matricula !== undefined) {
      const m = normalizarMatricula(input.matricula);
      if (m !== atual.matricula) {
        const ja = await this.prisma.colaborador.findUnique({
          where: { matricula: m },
        });
        if (ja && ja.id !== id) throw new MatriculaColaboradorDuplicadaError(m);
        data.matricula = m;
        novaMatricula = m;
      }
    }

    // Login — checa unicidade se informado (string vazia = remover).
    let novoLogin: string | null | undefined;
    if (input.login !== undefined) {
      novoLogin = input.login ? normalizarLogin(input.login) : null;
      if (novoLogin) {
        const jaLogin = await this.prisma.colaboradorIdentificador.findUnique({
          where: { tipo_valor: { tipo: 'LOGIN', valor: novoLogin } },
        });
        if (jaLogin && jaLogin.colaboradorId !== id) {
          throw new LoginColaboradorDuplicadoError(novoLogin);
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const atualizado = await tx.colaborador.update({ where: { id }, data });
      if (novaMatricula) {
        await tx.colaboradorIdentificador.deleteMany({
          where: { colaboradorId: id, tipo: 'MATRICULA' },
        });
        await tx.colaboradorIdentificador.create({
          data: { colaboradorId: id, tipo: 'MATRICULA', valor: novaMatricula },
        });
      }
      if (novoLogin !== undefined) {
        await tx.colaboradorIdentificador.deleteMany({
          where: { colaboradorId: id, tipo: 'LOGIN' },
        });
        if (novoLogin) {
          await tx.colaboradorIdentificador.create({
            data: { colaboradorId: id, tipo: 'LOGIN', valor: novoLogin },
          });
        }
      }
      return atualizado;
    });
  }

  /** Lista os colaboradores, com busca e filtros opcionais. */
  async listar(filtro: FiltroColaboradores = {}): Promise<Colaborador[]> {
    const where: Prisma.ColaboradorWhereInput = {};
    if (filtro.funcao) where.funcao = filtro.funcao;
    if (filtro.turno) where.turno = filtro.turno;
    if (filtro.ativo !== undefined) where.ativo = filtro.ativo;
    if (filtro.busca && filtro.busca.trim()) {
      const b = filtro.busca.trim();
      where.OR = [
        { nome: { contains: b, mode: 'insensitive' } },
        { matricula: { contains: b } },
      ];
    }
    return this.prisma.colaborador.findMany({
      where,
      orderBy: [{ funcao: 'asc' }, { nome: 'asc' }],
    });
  }

  /** Detalhe de um colaborador (com seus identificadores). */
  async obter(
    id: string,
  ): Promise<Colaborador & { identificadores: unknown[] }> {
    const c = await this.prisma.colaborador.findUnique({
      where: { id },
      include: { identificadores: true },
    });
    if (!c) throw new ColaboradorNaoEncontradoError();
    return c;
  }

  /**
   * Lista as contas de acesso (logins) e a quem já estão vinculadas. Alimenta
   * o seletor "Conta de acesso" no cadastro do colaborador, deixando claro
   * quais logins estão livres e quais já pertencem a outra ficha.
   */
  async listarLogins(): Promise<LoginColaborador[]> {
    const [usuarios, vinculados] = await Promise.all([
      this.prisma.usuario.findMany({
        orderBy: [{ nome: 'asc' }, { login: 'asc' }],
        select: { id: true, login: true, nome: true, perfil: true },
      }),
      this.prisma.colaborador.findMany({
        where: { usuarioId: { not: null } },
        select: { id: true, nome: true, usuarioId: true },
      }),
    ]);
    const porUsuario = new Map(vinculados.map((c) => [c.usuarioId as string, c]));
    return usuarios.map((u) => {
      const vinculo = porUsuario.get(u.id);
      return {
        id: u.id,
        login: u.login,
        nome: u.nome,
        perfil: u.perfil,
        colaboradorId: vinculo?.id ?? null,
        colaboradorNome: vinculo?.nome ?? null,
      };
    });
  }

  /** Inativa um colaborador (preserva o histórico). */
  async inativar(id: string): Promise<Colaborador> {
    return this.definirAtivo(id, false);
  }

  /** Reativa um colaborador. */
  async reativar(id: string): Promise<Colaborador> {
    return this.definirAtivo(id, true);
  }

  /**
   * Garante que a conta de acesso (Usuario) existe e não está vinculada a
   * outro colaborador. `selfId` é o colaborador em edição (ignorado na checagem
   * de duplicidade), ou null no cadastro.
   */
  private async garantirUsuarioVinculavel(
    usuarioId: string,
    selfId: string | null,
  ): Promise<void> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true },
    });
    if (!usuario) {
      throw new LoginAppInexistenteError();
    }
    const outro = await this.prisma.colaborador.findUnique({
      where: { usuarioId },
      select: { id: true },
    });
    if (outro && outro.id !== selfId) {
      throw new LoginAppDuplicadoError();
    }
  }

  private async definirAtivo(id: string, ativo: boolean): Promise<Colaborador> {
    const atual = await this.prisma.colaborador.findUnique({ where: { id } });
    if (!atual) throw new ColaboradorNaoEncontradoError();
    return this.prisma.colaborador.update({ where: { id }, data: { ativo } });
  }
}
