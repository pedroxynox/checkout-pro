import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Colaborador, OperadorTurno } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import {
  analisarFaltas,
  type AnaliticaFaltasDetalhe,
  type FaltasOperadorDetalhe,
} from './operadores.domain';
import { StatusJustificativa } from '../common/justificativas';
import { EscalaDomingoService } from '../escala-domingo/escala-domingo.service';
import {
  GrupoDomingo,
  grupoFolgaNoDomingo,
  trabalhaNoDomingo,
} from '../escala-domingo/escala-domingo.domain';

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
  /** Quantos deveriam estar agora e estão no caixa (não faltaram nem estão sem retorno). */
  disponiveis: number;
  /** Quantos deveriam estar agora mas faltaram. */
  faltas: number;
  /** Quantos saíram para o intervalo e não retornaram (também não estão no caixa). */
  semRetorno: number;
  /** Total escalado para esta franja (disponíveis + faltas + sem retorno). */
  esperados: number;
  listaDisponiveis: OperadorAgora[];
  listaFaltantes: OperadorAgora[];
  listaSemRetorno: OperadorAgora[];
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
  /** Estado da justificativa da falta (só quando status = FALTA). */
  statusJustificativa: StatusJustificativa | null;
  /** Quem justificou a falta (auditoria), quando aplicável. */
  justificadaPorNome: string | null;
}

/** Roster de um dia: colaboradores ordenados por entrada (folga ao fim). */
export interface DiaOperadores {
  dataISO: string;
  diaSemana: number;
  trabalhando: number;
  folgas: number;
  faltas: number;
  colaboradores: ColaboradorDia[];
  /**
   * Só no domingo: grupo que FOLGA nesse domingo pelo rodízio (G1/G2/G3), ou
   * null quando não é domingo ou o rodízio ainda não foi configurado.
   */
  grupoFolgaDomingo: GrupoDomingo | null;
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
 * Adapta um Colaborador (Cadastro Unificado) ao formato OperadorTurno que o
 * quadro/escala consome. A escala passa a vir dos colaboradores cadastrados;
 * o OperadorTurno antigo fica OCULTO (não é mais lido aqui). Horários ausentes
 * viram "" e a folga ausente vira -1 (nunca casa um dia da semana).
 */
function comoOperadorTurno(c: Colaborador): OperadorTurno {
  return {
    id: c.id,
    nome: c.nome,
    genero: c.genero,
    entradaSemana: c.entradaSemana ?? '',
    saidaSemana: c.saidaSemana ?? '',
    entradaFds: c.entradaFds ?? '',
    saidaFds: c.saidaFds ?? '',
    folgaDiaSemana: c.folgaDiaSemana ?? -1,
    ativo: c.ativo,
    criadoEm: c.criadoEm,
  };
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
    @Optional() private readonly escalaDomingo?: EscalaDomingoService,
  ) {}

  /**
   * Resolve, para um domingo, quem trabalha e quem folga pelo rodízio de grupos
   * (G1/G2/G3). Usa a âncora configurada; se não houver âncora, ninguém entra
   * (todos folgam) e `grupoFolga` fica null. Horário do domingo é o `entradaDom`
   * /`saidaDom` de cada colaborador (Fase 1).
   */
  private async operadoresNoDomingo(dataISO: string): Promise<{
    grupoFolga: GrupoDomingo | null;
    itens: {
      id: string;
      nome: string;
      genero: string | null;
      trabalha: boolean;
      entrada: string | null;
      saida: string | null;
    }[];
  }> {
    const dataDomingo = new Date(`${dataISO}T00:00:00.000Z`);
    const ancora = this.escalaDomingo
      ? await this.escalaDomingo.obterAncora()
      : null;
    const cols = await this.prisma.colaborador.findMany({
      where: { funcao: 'OPERADOR', ativo: true },
      orderBy: [{ entradaDom: 'asc' }, { nome: 'asc' }],
    });

    const itens = cols.map((c) => {
      const trabalha =
        !!ancora &&
        trabalhaNoDomingo(
          c.grupoDomingo,
          dataDomingo,
          ancora.data,
          ancora.ordem,
        );
      return {
        id: c.id,
        nome: c.nome,
        genero: c.genero ?? null,
        trabalha,
        entrada: trabalha ? (c.entradaDom ?? null) : null,
        saida: trabalha ? (c.saidaDom ?? null) : null,
      };
    });

    return {
      grupoFolga: ancora
        ? grupoFolgaNoDomingo(dataDomingo, ancora.data, ancora.ordem)
        : null,
      itens,
    };
  }

  /**
   * Lista os operadores ATIVOS para a escala. Fonte: Cadastro Unificado de
   * Colaboradores (funcao OPERADOR). O OperadorTurno antigo fica oculto.
   */
  async listar(): Promise<OperadorTurno[]> {
    const cols = await this.prisma.colaborador.findMany({
      where: { funcao: 'OPERADOR', ativo: true },
      orderBy: [
        { folgaDiaSemana: 'asc' },
        { entradaSemana: 'asc' },
        { nome: 'asc' },
      ],
    });
    return cols.map((c) => comoOperadorTurno(c));
  }

  // Observação: a criação/edição/remoção de operadores agora é feita pelo
  // Cadastro Unificado de Colaboradores (funcao OPERADOR). Os antigos métodos
  // de escrita em `OperadorTurno` (salvar/importar/remover) foram removidos
  // por escreverem numa tabela que não é mais lida. A escala é 100% derivada
  // do colaborador.

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
      return {
        diaSemana: dia.diaSemana,
        data: dia.data,
        trabalhando,
        folgas,
        faltas,
      };
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

    // No domingo o roster vem do rodízio de grupos (com o horário de domingo);
    // nos demais dias, do turno fixo (Seg–Qui x Sex–Sáb) + folga fixa.
    const ehDom = diaSemana === 0;
    const domingo = ehDom ? await this.operadoresNoDomingo(dataISO) : null;
    const operadores = ehDom ? [] : await this.listar();
    const ids = ehDom
      ? domingo!.itens.map((i) => i.id)
      : operadores.map((o) => o.id);

    const ausencias =
      ids.length > 0
        ? await this.prisma.ausencia.findMany({
            where: {
              pessoaId: { in: ids },
              data: { gte: diaInicio, lt: diaFim },
            },
            select: {
              id: true,
              pessoaId: true,
              statusJustificativa: true,
              justificadaPorNome: true,
            },
          })
        : [];
    const mapaAus = new Map(ausencias.map((a) => [a.pessoaId, a]));
    const fds = diaSemana === 5 || diaSemana === 6;

    const linhaComFalta = (base: {
      id: string;
      nome: string;
      genero: string | null;
      entrada: string | null;
      saida: string | null;
    }): ColaboradorDia => {
      const aus = mapaAus.get(base.id) ?? null;
      return {
        id: base.id,
        nome: base.nome,
        genero: base.genero,
        status: aus ? 'FALTA' : 'TRABALHA',
        entrada: base.entrada,
        saida: base.saida,
        ausenciaId: aus?.id ?? null,
        statusJustificativa: aus
          ? (aus.statusJustificativa as StatusJustificativa)
          : null,
        justificadaPorNome: aus?.justificadaPorNome ?? null,
      };
    };

    const folga = (base: {
      id: string;
      nome: string;
      genero: string | null;
    }): ColaboradorDia => ({
      id: base.id,
      nome: base.nome,
      genero: base.genero,
      status: 'FOLGA',
      entrada: null,
      saida: null,
      ausenciaId: null,
      statusJustificativa: null,
      justificadaPorNome: null,
    });

    const colaboradores: ColaboradorDia[] = ehDom
      ? domingo!.itens.map((it) =>
          it.trabalha
            ? linhaComFalta({
                id: it.id,
                nome: it.nome,
                genero: it.genero,
                entrada: it.entrada,
                saida: it.saida,
              })
            : folga({ id: it.id, nome: it.nome, genero: it.genero }),
        )
      : operadores.map((op) =>
          op.folgaDiaSemana === diaSemana
            ? folga({ id: op.id, nome: op.nome, genero: op.genero ?? null })
            : linhaComFalta({
                id: op.id,
                nome: op.nome,
                genero: op.genero ?? null,
                entrada: fds ? op.entradaFds : op.entradaSemana,
                saida: fds ? op.saidaFds : op.saidaSemana,
              }),
        );

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
      grupoFolgaDomingo: domingo?.grupoFolga ?? null,
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
    const ehDom = diaSemana === 0;
    const fds = diaSemana === 5 || diaSemana === 6;

    // Candidatos do dia (com o horário do dia): no domingo, quem trabalha pelo
    // rodízio de grupos; nos demais dias, quem não está de folga fixa.
    let candidatos: {
      id: string;
      nome: string;
      entrada: string | null;
      saida: string | null;
    }[];
    if (ehDom) {
      const { itens } = await this.operadoresNoDomingo(dataISO);
      candidatos = itens
        .filter((i) => i.trabalha)
        .map((i) => ({
          id: i.id,
          nome: i.nome,
          entrada: i.entrada,
          saida: i.saida,
        }));
    } else {
      const operadores = await this.listar();
      candidatos = operadores
        .filter((op) => op.folgaDiaSemana !== diaSemana)
        .map((op) => ({
          id: op.id,
          nome: op.nome,
          entrada: fds ? op.entradaFds : op.entradaSemana,
          saida: fds ? op.saidaFds : op.saidaSemana,
        }));
    }
    const ids = candidatos.map((c) => c.id);

    const diaInicio = new Date(`${dataISO}T00:00:00.000Z`);
    const diaFim = addDias(diaInicio, 1);
    const ausencias =
      ids.length > 0
        ? await this.prisma.ausencia.findMany({
            where: {
              pessoaId: { in: ids },
              data: { gte: diaInicio, lt: diaFim },
            },
            select: { pessoaId: true },
          })
        : [];
    const faltou = new Set(ausencias.map((a) => a.pessoaId));

    // Quem saiu para o intervalo e não retornou hoje também sai do caixa.
    const incidencias =
      ids.length > 0
        ? await this.prisma.incidenciaEscala.findMany({
            where: {
              colaboradorId: { in: ids },
              tipo: 'NAO_RETORNO_INTERVALO',
              data: { gte: diaInicio, lt: diaFim },
            },
            select: { colaboradorId: true },
          })
        : [];
    const naoRetornou = new Set(incidencias.map((i) => i.colaboradorId));

    const listaDisponiveis: OperadorAgora[] = [];
    const listaFaltantes: OperadorAgora[] = [];
    const listaSemRetorno: OperadorAgora[] = [];

    for (const c of candidatos) {
      const ent = horaMin(c.entrada ?? '');
      const sai = horaMin(c.saida ?? '');
      if (ent == null || sai == null) continue;
      if (!(nowMin >= ent && nowMin < sai)) continue;
      const linha: OperadorAgora = {
        nome: c.nome,
        entrada: c.entrada ?? '',
        saida: c.saida ?? '',
      };
      if (faltou.has(c.id)) {
        listaFaltantes.push(linha);
      } else if (naoRetornou.has(c.id)) {
        // Não retornou do intervalo: não conta como disponível no caixa.
        listaSemRetorno.push(linha);
      } else {
        listaDisponiveis.push(linha);
      }
    }

    return {
      horaLocal: `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`,
      dataISO,
      diaSemana,
      disponiveis: listaDisponiveis.length,
      faltas: listaFaltantes.length,
      semRetorno: listaSemRetorno.length,
      esperados:
        listaDisponiveis.length +
        listaFaltantes.length +
        listaSemRetorno.length,
      listaDisponiveis,
      listaFaltantes,
      listaSemRetorno,
    };
  }

  /**
   * Analítica de faltas num período: total, ranking por operador e distribuição
   * por dia da semana (qual dia mais se falta). Resolve nomes dos operadores.
   */
  async analiticaFaltas(inicio: Date, fim: Date): Promise<AnaliticaFaltas> {
    const operadores = (
      await this.prisma.colaborador.findMany({
        where: { funcao: 'OPERADOR' },
        select: { id: true, nome: true, folgaDiaSemana: true },
      })
    ).map((o) => ({
      id: o.id,
      nome: o.nome,
      folgaDiaSemana: o.folgaDiaSemana ?? -1,
    }));
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
        where: {
          pessoaId: { in: ids },
          data: { gte: prevInicio, lte: prevFim },
        },
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

  /**
   * Analítica de "não retorno do intervalo" num período — mesma inteligência
   * das faltas (ranking, risco/semáforo, dia recorrente e tendência), mas sobre
   * as incidências do tipo NAO_RETORNO_INTERVALO em vez das ausências. Reusa o
   * mesmo motor puro (`analisarFaltas`) e o mesmo formato de resposta.
   */
  async analiticaNaoRetornos(
    inicio: Date,
    fim: Date,
  ): Promise<AnaliticaFaltas> {
    const operadores = (
      await this.prisma.colaborador.findMany({
        where: { funcao: 'OPERADOR' },
        select: { id: true, nome: true, folgaDiaSemana: true },
      })
    ).map((o) => ({
      id: o.id,
      nome: o.nome,
      folgaDiaSemana: o.folgaDiaSemana ?? -1,
    }));
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

    const selecao = {
      colaboradorId: true,
      data: true,
      statusJustificativa: true,
      motivoJustificativa: true,
    };
    const [atuais, anteriores] = await Promise.all([
      this.prisma.incidenciaEscala.findMany({
        where: {
          colaboradorId: { in: ids },
          tipo: 'NAO_RETORNO_INTERVALO',
          data: { gte: inicio, lte: fim },
        },
        select: selecao,
      }),
      this.prisma.incidenciaEscala.findMany({
        where: {
          colaboradorId: { in: ids },
          tipo: 'NAO_RETORNO_INTERVALO',
          data: { gte: prevInicio, lte: prevFim },
        },
        select: selecao,
      }),
    ]);

    // Não-retorno não tem "dia escalado" próprio; usamos a mesma janela das
    // faltas para a taxa (dias escalados até hoje).
    const agora = new Date();
    const fimEscala = agora.getTime() < fim.getTime() ? agora : fim;

    return analisarFaltas({
      operadores,
      ausencias: atuais.map((i) => ({
        pessoaId: i.colaboradorId,
        data: i.data,
        statusJustificativa: i.statusJustificativa,
        motivoJustificativa: i.motivoJustificativa,
      })),
      ausenciasAnterior: anteriores.map((i) => ({
        pessoaId: i.colaboradorId,
        data: i.data,
        statusJustificativa: i.statusJustificativa,
        motivoJustificativa: i.motivoJustificativa,
      })),
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
