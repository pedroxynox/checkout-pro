import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OperadorTurno } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import {
  analisarFaltas,
  type AnaliticaFaltasDetalhe,
  type FaltasOperadorDetalhe,
} from './operadores.domain';

/** Dados para criar/atualizar um turno de operador. */
export interface TurnoInput {
  nome: string;
  genero?: string | null;
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

/** Operador presente/ausente na franja atual. */
export interface OperadorAgora {
  nome: string;
  entrada: string;
  saida: string;
}

/** Tablero "ao vivo": quem deveria estar no caixa agora. */
export interface AoVivoOperadores {
  horaLocal: string;
  dataISO: string;
  diaSemana: number;
  /** Quantos deveriam estar agora e não faltaram. */
  disponiveis: number;
  /** Quantos deveriam estar agora mas faltaram. */
  faltas: number;
  /** Total escalado para esta franja (disponíveis + faltas). */
  esperados: number;
  listaDisponiveis: OperadorAgora[];
  listaFaltantes: OperadorAgora[];
}

export interface FaltasPorDiaSemana {
  diaSemana: number;
  nome: string;
  quantidade: number;
}

// A analítica de faltas agora é inteligente (taxa %, padrões, tendência e
// risco). A forma vem do domínio puro `analisarFaltas`.
export type FaltasPorOperador = FaltasOperadorDetalhe;
export type AnaliticaFaltas = AnaliticaFaltasDetalhe;

/** Um colaborador no roster de um dia. */
export interface ColaboradorDia {
  id: string;
  nome: string;
  genero: string | null;
  status: StatusCelula;
  entrada: string | null;
  saida: string | null;
  ausenciaId: string | null;
}

/** Roster de um dia: colaboradores ordenados por entrada (folga ao fim). */
export interface DiaOperadores {
  dataISO: string;
  diaSemana: number;
  trabalhando: number;
  folgas: number;
  faltas: number;
  colaboradores: ColaboradorDia[];
}

const NOMES_DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Cobertura mínima desejada por dia (abaixo disso, alerta). */
const COBERTURA_MINIMA = 20;

/** "HH:mm" -> minutos desde a meia-noite; null se inválido. */
function horaMin(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Data/hora atuais no fuso de Brasília (America/Sao_Paulo). */
function agoraBrasilia(): {
  dataISO: string;
  hora: number;
  minuto: number;
  diaSemana: number;
} {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string): string =>
    partes.find((p) => p.type === t)?.value ?? '00';
  const ano = get('year');
  const mes = get('month');
  const dia = get('day');
  let hora = parseInt(get('hour'), 10);
  if (hora === 24) hora = 0;
  const minuto = parseInt(get('minute'), 10);
  const dataISO = `${ano}-${mes}-${dia}`;
  const diaSemana = new Date(`${dataISO}T00:00:00.000Z`).getUTCDay();
  return { dataISO, hora, minuto, diaSemana };
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
  private readonly logger = new Logger(OperadorTurnoService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

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
        genero: dados.genero ?? null,
        entradaSemana: dados.entradaSemana,
        saidaSemana: dados.saidaSemana,
        entradaFds: dados.entradaFds,
        saidaFds: dados.saidaFds,
        folgaDiaSemana: dados.folgaDiaSemana,
        ativo: true,
      },
      create: {
        nome: dados.nome.trim(),
        genero: dados.genero ?? null,
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

  /**
   * Roster de um único dia: cada colaborador com o horário do dia (Sex/Sáb usam
   * o de fim de semana), o status (trabalha/folga/falta) e a ausência (se
   * houver). Ordenado por hora de ENTRADA (folga ao fim). Padrão: hoje.
   */
  async diaOperadores(dataRef?: Date): Promise<DiaOperadores> {
    const dataISO = dataRef
      ? dataRef.toISOString().slice(0, 10)
      : agoraBrasilia().dataISO;
    const diaInicio = new Date(`${dataISO}T00:00:00.000Z`);
    const diaSemana = diaInicio.getUTCDay();
    const diaFim = addDias(diaInicio, 1);

    const operadores = await this.listar();
    const ids = operadores.map((o) => o.id);
    const ausencias =
      ids.length > 0
        ? await this.prisma.ausencia.findMany({
            where: { pessoaId: { in: ids }, data: { gte: diaInicio, lt: diaFim } },
            select: { id: true, pessoaId: true },
          })
        : [];
    const mapaAus = new Map(ausencias.map((a) => [a.pessoaId, a.id]));
    const fds = diaSemana === 5 || diaSemana === 6;

    const colaboradores: ColaboradorDia[] = operadores.map((op): ColaboradorDia => {
      if (op.folgaDiaSemana === diaSemana) {
        return {
          id: op.id,
          nome: op.nome,
          genero: op.genero ?? null,
          status: 'FOLGA',
          entrada: null,
          saida: null,
          ausenciaId: null,
        };
      }
      const entrada = fds ? op.entradaFds : op.entradaSemana;
      const saida = fds ? op.saidaFds : op.saidaSemana;
      const ausenciaId = mapaAus.get(op.id) ?? null;
      return {
        id: op.id,
        nome: op.nome,
        genero: op.genero ?? null,
        status: ausenciaId ? 'FALTA' : 'TRABALHA',
        entrada,
        saida,
        ausenciaId,
      };
    });

    // Trabalha/falta primeiro, por hora de entrada; folga ao fim (por nome).
    colaboradores.sort((a, b) => {
      const af = a.status === 'FOLGA';
      const bf = b.status === 'FOLGA';
      if (af !== bf) return af ? 1 : -1;
      if (af && bf) return a.nome.localeCompare(b.nome);
      const ea = horaMin(a.entrada ?? '') ?? 0;
      const eb = horaMin(b.entrada ?? '') ?? 0;
      return ea - eb || a.nome.localeCompare(b.nome);
    });

    return {
      dataISO,
      diaSemana,
      trabalhando: colaboradores.filter((c) => c.status === 'TRABALHA').length,
      folgas: colaboradores.filter((c) => c.status === 'FOLGA').length,
      faltas: colaboradores.filter((c) => c.status === 'FALTA').length,
      colaboradores,
    };
  }

  /**
   * Tablero "ao vivo": quem deveria estar no caixa AGORA (turno cobre a hora
   * local, não é folga hoje). Os marcados como falta não contam em
   * `disponiveis` — aparecem em `faltas`.
   */
  async aoVivo(): Promise<AoVivoOperadores> {
    const { dataISO, hora, minuto, diaSemana } = agoraBrasilia();
    const nowMin = hora * 60 + minuto;
    const operadores = await this.listar();
    const ids = operadores.map((o) => o.id);

    const diaInicio = new Date(`${dataISO}T00:00:00.000Z`);
    const diaFim = addDias(diaInicio, 1);
    const ausencias =
      ids.length > 0
        ? await this.prisma.ausencia.findMany({
            where: { pessoaId: { in: ids }, data: { gte: diaInicio, lt: diaFim } },
            select: { pessoaId: true },
          })
        : [];
    const faltou = new Set(ausencias.map((a) => a.pessoaId));

    const fds = diaSemana === 5 || diaSemana === 6;
    const listaDisponiveis: OperadorAgora[] = [];
    const listaFaltantes: OperadorAgora[] = [];

    for (const op of operadores) {
      if (op.folgaDiaSemana === diaSemana) continue; // folga hoje
      const entrada = fds ? op.entradaFds : op.entradaSemana;
      const saida = fds ? op.saidaFds : op.saidaSemana;
      const ent = horaMin(entrada);
      const sai = horaMin(saida);
      if (ent == null || sai == null) continue;
      const cobreAgora = nowMin >= ent && nowMin < sai;
      if (!cobreAgora) continue;
      if (faltou.has(op.id)) listaFaltantes.push({ nome: op.nome, entrada, saida });
      else listaDisponiveis.push({ nome: op.nome, entrada, saida });
    }

    return {
      horaLocal: `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`,
      dataISO,
      diaSemana,
      disponiveis: listaDisponiveis.length,
      faltas: listaFaltantes.length,
      esperados: listaDisponiveis.length + listaFaltantes.length,
      listaDisponiveis,
      listaFaltantes,
    };
  }

  /**
   * Analítica de faltas num período: total, ranking por operador e distribuição
   * por dia da semana (qual dia mais se falta). Resolve nomes dos operadores.
   */
  async analiticaFaltas(inicio: Date, fim: Date): Promise<AnaliticaFaltas> {
    const operadores = await this.prisma.operadorTurno.findMany({
      select: { id: true, nome: true, folgaDiaSemana: true },
    });
    const ids = operadores.map((o) => o.id);
    if (ids.length === 0) {
      return {
        total: 0,
        totalAnterior: 0,
        tendenciaPct: null,
        taxaGlobal: 0,
        porOperador: [],
        porDiaSemana: NOMES_DIA.map((nome, diaSemana) => ({
          diaSemana,
          nome,
          quantidade: 0,
        })),
      };
    }

    // Janela anterior de igual duração, imediatamente antes (para a tendência).
    const UM_DIA = 24 * 60 * 60 * 1000;
    const prevFim = new Date(inicio.getTime() - UM_DIA);
    const prevInicio = new Date(
      prevFim.getTime() - (fim.getTime() - inicio.getTime()),
    );

    const [ausencias, ausenciasAnterior] = await Promise.all([
      this.prisma.ausencia.findMany({
        where: { pessoaId: { in: ids }, data: { gte: inicio, lte: fim } },
        select: { pessoaId: true, data: true },
      }),
      this.prisma.ausencia.findMany({
        where: { pessoaId: { in: ids }, data: { gte: prevInicio, lte: prevFim } },
        select: { pessoaId: true, data: true },
      }),
    ]);

    // Conta dias escalados só até hoje (taxa de absenteísmo justa no mês atual).
    const agora = new Date();
    const fimEscala = agora.getTime() < fim.getTime() ? agora : fim;

    return analisarFaltas({
      operadores,
      ausencias,
      ausenciasAnterior,
      inicio,
      fimEscala,
    });
  }

  /** Operadores que deveriam trabalhar num dia da semana (não estão de folga). */
  private async escaladosNoDia(diaSemana: number): Promise<OperadorTurno[]> {
    const operadores = await this.listar();
    return operadores.filter((o) => o.folgaDiaSemana !== diaSemana);
  }

  /**
   * Alerta semanal de faltas (segunda-feira 08:00 Brasília): envia aos gestores
   * o resumo das faltas dos últimos 7 dias (ranking e dia com mais faltas).
   */
  @Cron('0 8 * * 1', { timeZone: 'America/Sao_Paulo' })
  async alertaFaltasSemanal(): Promise<void> {
    if (!this.notificacoes) return;
    try {
      const fim = new Date();
      const inicio = new Date(fim.getTime() - 7 * 24 * 60 * 60 * 1000);
      const analitica = await this.analiticaFaltas(inicio, fim);
      if (analitica.total === 0) return;
      const gestores = await this.notificacoes.gestores();
      if (gestores.length === 0) return;

      const topo = analitica.porOperador
        .slice(0, 3)
        .map((o) => `${o.nome} (${o.quantidade})`)
        .join(', ');
      const diaPior = [...analitica.porDiaSemana].sort(
        (a, b) => b.quantidade - a.quantidade,
      )[0];
      await this.notificacoes.enviar(gestores, {
        titulo: '📋 Faltas da semana',
        mensagem: `${analitica.total} falta(s) nos últimos 7 dias. Mais faltas: ${topo}. Dia com mais faltas: ${diaPior.nome}.`,
      });
    } catch (erro) {
      this.logger.warn(`Falha no alerta semanal de faltas: ${String(erro)}`);
    }
  }

  /**
   * Aviso proativo de cobertura crítica (todo dia 07:00 Brasília): se hoje a
   * cobertura (escalados − faltas) ficar abaixo do mínimo, avisa os gestores.
   */
  @Cron('0 7 * * *', { timeZone: 'America/Sao_Paulo' })
  async avisoCoberturaCritica(): Promise<void> {
    if (!this.notificacoes) return;
    try {
      const { dataISO, diaSemana } = agoraBrasilia();
      const escalados = await this.escaladosNoDia(diaSemana);
      const ids = escalados.map((o) => o.id);
      if (ids.length === 0) return;
      const diaInicio = new Date(`${dataISO}T00:00:00.000Z`);
      const diaFim = addDias(diaInicio, 1);
      const faltas = await this.prisma.ausencia.count({
        where: { pessoaId: { in: ids }, data: { gte: diaInicio, lt: diaFim } },
      });
      const disponiveis = escalados.length - faltas;
      if (disponiveis < COBERTURA_MINIMA) {
        const gestores = await this.notificacoes.gestores();
        if (gestores.length === 0) return;
        await this.notificacoes.enviar(gestores, {
          titulo: '⚠️ Cobertura baixa hoje',
          mensagem: `Hoje (${NOMES_DIA[diaSemana]}) há ${disponiveis} operadores no caixa — abaixo do mínimo de ${COBERTURA_MINIMA}${faltas > 0 ? ` (${faltas} falta(s))` : ''}.`,
        });
      }
    } catch (erro) {
      this.logger.warn(`Falha no aviso de cobertura: ${String(erro)}`);
    }
  }
}
