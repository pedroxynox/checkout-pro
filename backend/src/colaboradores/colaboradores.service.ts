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

  /** Inativa um colaborador (preserva o histórico). */
  async inativar(id: string): Promise<Colaborador> {
    return this.definirAtivo(id, false);
  }

  /** Reativa um colaborador. */
  async reativar(id: string): Promise<Colaborador> {
    return this.definirAtivo(id, true);
  }

  private async definirAtivo(id: string, ativo: boolean): Promise<Colaborador> {
    const atual = await this.prisma.colaborador.findUnique({ where: { id } });
    if (!atual) throw new ColaboradorNaoEncontradoError();
    return this.prisma.colaborador.update({ where: { id }, data: { ativo } });
  }
}
