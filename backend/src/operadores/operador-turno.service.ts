import { Injectable } from '@nestjs/common';
import { OperadorTurno } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Dados para criar/atualizar um turno de operador. */
export interface TurnoInput {
  nome: string;
  entradaSemana: string;
  saidaSemana: string;
  entradaFds: string;
  saidaFds: string;
  folgaDiaSemana: number;
}

export type StatusCelula = 'TRABALHA' | 'FOLGA' | 'FALTA';

export interface GradeCelula {
  diaSemana: number;
  data: string;
  status: StatusCelula;
  entrada: string | null;
  saida: string | null;
  /** Id da ausência (quando FALTA), para permitir remover. */
  ausenciaId: string | null;
}

export interface GradeOperador {
  id: string;
  nome: string;
  folgaDiaSemana: number;
  celulas: GradeCelula[];
}

export interface GradeCobertura {
  diaSemana: number;
  data: string;
  trabalhando: number;
  folgas: number;
  faltas: number;
}

export interface GradeSemana {
  inicio: string;
  hojeISO: string;
  dias: { diaSemana: number; data: string }[];
  operadores: GradeOperador[];
  cobertura: GradeCobertura[];
}

/** Início da semana (segunda-feira, 00:00 UTC) que contém a data. */
function inicioDaSemana(data: Date): Date {
  const d = new Date(
    Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()),
  );
  const dow = d.getUTCDay(); // 0=Dom..6=Sáb
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function addDias(data: Date, dias: number): Date {
  const d = new Date(data);
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

function iso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/**
 * Quadro de Operadores: turno fixo (horário Seg–Qui x Sex–Sáb) e folga fixa por
 * operador. Monta a grade semanal visual (trabalha/folga/falta) cruzando com as
 * ausências pontuais (`Ausencia`, pessoaId = id do OperadorTurno) e calcula a
 * cobertura por dia. Domingo ainda não é considerado (operação Seg–Sáb).
 */
@Injectable()
export class OperadorTurnoService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista os operadores ativos, ordenados por folga e horário. */
  listar(): Promise<OperadorTurno[]> {
    return this.prisma.operadorTurno.findMany({
      where: { ativo: true },
      orderBy: [
        { folgaDiaSemana: 'asc' },
        { entradaSemana: 'asc' },
        { nome: 'asc' },
      ],
    });
  }

  /** Cria ou atualiza (por nome) um operador. */
  salvar(dados: TurnoInput): Promise<OperadorTurno> {
    return this.prisma.operadorTurno.upsert({
      where: { nome: dados.nome.trim() },
      update: {
        entradaSemana: dados.entradaSemana,
        saidaSemana: dados.saidaSemana,
        entradaFds: dados.entradaFds,
        saidaFds: dados.saidaFds,
        folgaDiaSemana: dados.folgaDiaSemana,
        ativo: true,
      },
      create: {
        nome: dados.nome.trim(),
        entradaSemana: dados.entradaSemana,
        saidaSemana: dados.saidaSemana,
        entradaFds: dados.entradaFds,
        saidaFds: dados.saidaFds,
        folgaDiaSemana: dados.folgaDiaSemana,
      },
    });
  }

  /** Importa em massa (upsert por nome). Retorna quantos foram salvos. */
  async importar(linhas: readonly TurnoInput[]): Promise<{ salvos: number }> {
    for (const linha of linhas) {
      await this.salvar(linha);
    }
    return { salvos: linhas.length };
  }

  /** Inativa um operador (mantém histórico de ausências). */
  async remover(id: string): Promise<void> {
    await this.prisma.operadorTurno.update({
      where: { id },
      data: { ativo: false },
    });
  }

  /**
   * Grade semanal (Seg–Sáb) a partir de uma data de referência. Para cada
   * operador e dia: FOLGA (dia da folga fixa), FALTA (ausência registrada) ou
   * TRABALHA (com o horário do dia — Sex/Sáb usam o horário de fim de semana).
   */
  async grade(dataRef: Date = new Date()): Promise<GradeSemana> {
    const segunda = inicioDaSemana(dataRef);
    const fimExclusivo = addDias(segunda, 6); // domingo (exclusivo)
    // Seg(1) .. Sáb(6) — 6 colunas.
    const dias = Array.from({ length: 6 }, (_, i) => {
      const d = addDias(segunda, i);
      return { diaSemana: d.getUTCDay(), data: iso(d) };
    });

    const operadores = await this.listar();
    const ids = operadores.map((o) => o.id);
    const ausencias =
      ids.length > 0
        ? await this.prisma.ausencia.findMany({
            where: {
              pessoaId: { in: ids },
              data: { gte: segunda, lt: fimExclusivo },
            },
            select: { id: true, pessoaId: true, data: true },
          })
        : [];
    const mapaAusencia = new Map<string, string>();
    for (const a of ausencias) {
      mapaAusencia.set(`${a.pessoaId}|${iso(a.data)}`, a.id);
    }

    const ehFimDeSemana = (diaSemana: number): boolean =>
      diaSemana === 5 || diaSemana === 6;

    const gradeOperadores: GradeOperador[] = operadores.map((op) => {
      const celulas: GradeCelula[] = dias.map((dia) => {
        if (dia.diaSemana === op.folgaDiaSemana) {
          return {
            diaSemana: dia.diaSemana,
            data: dia.data,
            status: 'FOLGA',
            entrada: null,
            saida: null,
            ausenciaId: null,
          };
        }
        const ausenciaId = mapaAusencia.get(`${op.id}|${dia.data}`) ?? null;
        if (ausenciaId) {
          return {
            diaSemana: dia.diaSemana,
            data: dia.data,
            status: 'FALTA',
            entrada: null,
            saida: null,
            ausenciaId,
          };
        }
        const fds = ehFimDeSemana(dia.diaSemana);
        return {
          diaSemana: dia.diaSemana,
          data: dia.data,
          status: 'TRABALHA',
          entrada: fds ? op.entradaFds : op.entradaSemana,
          saida: fds ? op.saidaFds : op.saidaSemana,
          ausenciaId: null,
        };
      });
      return {
        id: op.id,
        nome: op.nome,
        folgaDiaSemana: op.folgaDiaSemana,
        celulas,
      };
    });

    const cobertura: GradeCobertura[] = dias.map((dia, idx) => {
      let trabalhando = 0;
      let folgas = 0;
      let faltas = 0;
      for (const op of gradeOperadores) {
        const c = op.celulas[idx];
        if (c.status === 'TRABALHA') trabalhando += 1;
        else if (c.status === 'FOLGA') folgas += 1;
        else faltas += 1;
      }
      return { diaSemana: dia.diaSemana, data: dia.data, trabalhando, folgas, faltas };
    });

    return {
      inicio: iso(segunda),
      hojeISO: iso(new Date()),
      dias,
      operadores: gradeOperadores,
      cobertura,
    };
  }
}
