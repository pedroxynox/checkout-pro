/**
 * Lógica de domínio **pura** do Modulo_Operadores.
 *
 * Estas funções não dependem do Nest nem do banco de dados. Elas concentram as
 * decisões de unicidade (nome de operador e ausência por pessoa/dia), a geração
 * do relatório de ausências (filtrado por período e ordenado) e a classificação
 * e contagem de operadores por turno conforme o horário de entrada da escala.
 *
 * Por serem puras e determinísticas, podem ser exercitadas por testes de
 * propriedade (fast-check) sem qualquer infraestrutura.
 *
 * Requisitos: 6.1 (cadastro/unicidade), 6.2 (ausências/unicidade),
 * 6.3 (relatório) e 6.6 (turno/contagem).
 */

import { HorarioInvalidoError } from './operadores.errors';
import {
  MotivoJustificativa,
  StatusJustificativa,
  pesoOcorrencia,
} from '../common/justificativas';
import { maiorSequenciaDias } from '../common/datas';
import {
  NivelRisco,
  nivelPorPontos,
  pontosPorQuantidade,
  pontosPorSequencia,
  pontosPorTaxa,
} from '../common/risco-ocorrencias';

export type Turno = 'ABERTURA' | 'INTERMEDIARIO' | 'FECHAMENTO';

/** Contagem de operadores trabalhando, particionada por turno mais o total. */
export interface ContagemTurno {
  abertura: number;
  intermediario: number;
  fechamento: number;
  total: number;
}

/**
 * Registro mínimo de uma ausência (pessoa + data). Os campos de justificativa
 * são opcionais: quando ausentes, a falta conta como PENDENTE (peso integral),
 * mantendo o comportamento anterior. Quando JUSTIFICADA, pesa menos no score
 * conforme o motivo (ver `pesoOcorrencia`).
 */
export interface AusenciaRegistro {
  pessoaId: string;
  data: Date;
  statusJustificativa?: StatusJustificativa;
  motivoJustificativa?: MotivoJustificativa | null;
}

/** Intervalo de datas inclusivo em ambos os extremos. */
export interface IntervaloDatas {
  inicio: Date;
  fim: Date;
}

/** Item do relatório de ausências por pessoa. */
export interface ItemRelatorioAusencia {
  pessoaId: string;
  quantidade: number;
}

/**
 * Escala de um operador em um determinado dia, usada para a contagem por turno.
 * `entrada` é o horário "HH:mm"; quando o operador não está trabalhando
 * (folga, férias ou desligado) pode ser `null`.
 */
export interface OperadorEscalaDia {
  operadorId: string;
  entrada: string | null;
  folga?: boolean;
  ferias?: boolean;
  desligado?: boolean;
}

// Fronteiras de turno em minutos a partir da meia-noite (Req 6.6.2–6.6.4).
const LIMITE_ABERTURA_MIN = 10 * 60; // 10:00
const LIMITE_INTERMEDIARIO_MIN = 13 * 60; // 13:00

/**
 * Indica se um nome já existe entre os nomes de operadores cadastrados
 * (Requisito 6.1.3). A comparação é por igualdade exata ("nome idêntico").
 */
export function nomeDuplicado(
  nomesExistentes: readonly string[],
  nome: string,
): boolean {
  return nomesExistentes.includes(nome);
}

/** Chave de dia (UTC) "YYYY-MM-DD" para comparar ausências por data civil. */
function chaveDia(data: Date): string {
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(data.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/**
 * Indica se já existe uma ausência para a mesma pessoa na mesma data
 * (Requisito 6.2.3). A igualdade de data é feita por dia civil (UTC),
 * garantindo no máximo uma ausência por par (pessoa, data).
 */
export function ausenciaDuplicada(
  ausenciasExistentes: readonly AusenciaRegistro[],
  pessoaId: string,
  data: Date,
): boolean {
  const dia = chaveDia(data);
  return ausenciasExistentes.some(
    (a) => a.pessoaId === pessoaId && chaveDia(a.data) === dia,
  );
}

/**
 * Indica se uma data está dentro do intervalo selecionado, inclusivo em ambos
 * os extremos (Requisito 6.3.2).
 */
function dentroDoPeriodo(data: Date, periodo: IntervaloDatas): boolean {
  const t = data.getTime();
  return t >= periodo.inicio.getTime() && t <= periodo.fim.getTime();
}

/**
 * Gera o relatório de ausências por pessoa (Requisito 6.3):
 *
 * - considera apenas as ausências cuja data está dentro do período (6.3.2);
 * - conta, para cada pessoa, a quantidade de ausências no período (6.3.1);
 * - ordena o resultado de forma decrescente pela quantidade (6.3.3). Em caso de
 *   empate, ordena por `pessoaId` ascendente para um resultado determinístico.
 *
 * Pessoas sem ausências dentro do período não aparecem no relatório.
 */
export function relatorioAusencias(
  ausencias: readonly AusenciaRegistro[],
  periodo: IntervaloDatas,
): ItemRelatorioAusencia[] {
  const contagem = new Map<string, number>();
  for (const a of ausencias) {
    if (dentroDoPeriodo(a.data, periodo)) {
      contagem.set(a.pessoaId, (contagem.get(a.pessoaId) ?? 0) + 1);
    }
  }

  return Array.from(contagem.entries())
    .map(([pessoaId, quantidade]) => ({ pessoaId, quantidade }))
    .sort((x, y) =>
      y.quantidade !== x.quantidade
        ? y.quantidade - x.quantidade
        : x.pessoaId.localeCompare(y.pessoaId),
    );
}

/**
 * Converte um horário "HH:mm" para minutos a partir da meia-noite. Lança
 * `HorarioInvalidoError` quando o formato/valor é inválido.
 */
export function horarioParaMinutos(horario: string): number {
  const correspondencia = /^(\d{1,2}):(\d{2})$/.exec(horario.trim());
  if (!correspondencia) {
    throw new HorarioInvalidoError(horario);
  }
  const horas = Number(correspondencia[1]);
  const minutos = Number(correspondencia[2]);
  if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) {
    throw new HorarioInvalidoError(horario);
  }
  return horas * 60 + minutos;
}

/**
 * Classifica o turno de um operador para um dia a partir do **horário de
 * entrada** da escala (Requisitos 6.6.1–6.6.4):
 *
 * - `ABERTURA` se entrada < 10:00;
 * - `INTERMEDIARIO` se 10:00 ≤ entrada < 13:00;
 * - `FECHAMENTO` se entrada ≥ 13:00.
 *
 * A partição é total e exclusiva: todo horário válido cai em exatamente um
 * turno.
 */
export function classificarTurnoOperador(entrada: string): Turno {
  const minutos = horarioParaMinutos(entrada);
  if (minutos < LIMITE_ABERTURA_MIN) {
    return 'ABERTURA';
  }
  if (minutos < LIMITE_INTERMEDIARIO_MIN) {
    return 'INTERMEDIARIO';
  }
  return 'FECHAMENTO';
}

/**
 * Indica se um operador está efetivamente trabalhando no dia/escala: não está
 * em folga, em férias nem desligado e possui horário de entrada definido
 * (Requisito 6.6.7).
 */
export function estaTrabalhando(op: OperadorEscalaDia): boolean {
  return (
    !op.folga &&
    !op.ferias &&
    !op.desligado &&
    op.entrada !== null &&
    op.entrada !== undefined
  );
}

/**
 * Conta os operadores por turno em um dia/escala (Requisitos 6.6.5–6.6.7).
 *
 * Considera **apenas** os operadores que estão trabalhando (exclui folga,
 * férias e desligados) e retorna a contagem por turno (abertura, intermediário,
 * fechamento) mais o total de operadores trabalhando. Por construção, a soma
 * das contagens por turno é sempre igual ao total.
 */
export function contagemPorTurno(
  operadores: readonly OperadorEscalaDia[],
): ContagemTurno {
  let abertura = 0;
  let intermediario = 0;
  let fechamento = 0;

  for (const op of operadores) {
    if (!estaTrabalhando(op)) {
      continue;
    }
    // `estaTrabalhando` garante que `entrada` é uma string definida.
    switch (classificarTurnoOperador(op.entrada as string)) {
      case 'ABERTURA':
        abertura += 1;
        break;
      case 'INTERMEDIARIO':
        intermediario += 1;
        break;
      case 'FECHAMENTO':
        fechamento += 1;
        break;
    }
  }

  return {
    abertura,
    intermediario,
    fechamento,
    total: abertura + intermediario + fechamento,
  };
}

// ---------------------------------------------------------------------------
// Analítica inteligente de faltas (taxa %, padrões, tendência e risco)
// ---------------------------------------------------------------------------

const NOMES_DIA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Operador para a analítica de faltas (id, nome e folga fixa). */
export interface OperadorParaFaltas {
  id: string;
  nome: string;
  /** Dia de folga fixa (0=Dom..6=Sáb). */
  folgaDiaSemana: number;
}

export type RiscoFalta = NivelRisco;

/** Detalhe inteligente das faltas de um operador no período. */
export interface FaltasOperadorDetalhe {
  id: string;
  nome: string;
  quantidade: number;
  /** Quantas das faltas do período estão JUSTIFICADAS (abonadas). */
  justificadas: number;
  diasEscalados: number;
  /** % de absenteísmo BRUTO = faltas / dias escalados (0–100, arredondado). */
  taxa: number;
  /**
   * % de absenteísmo EFETIVO (justificadas pesam menos, conforme o motivo).
   * É o que alimenta a Assiduidade no score. Para faltas sem justificativa,
   * `taxaPonderada === taxa`.
   */
  taxaPonderada: number;
  /** Faltas coladas à folga (véspera ou dia seguinte) — "emenda". */
  faltasEmenda: number;
  /** Maior sequência de faltas em dias consecutivos. */
  sequenciaMax: number;
  /** Dia da semana em que mais falta, quando há concentração (≥2). */
  diaRecorrente: { diaSemana: number; nome: string; quantidade: number } | null;
  /** Variação de faltas vs. período anterior (delta). */
  tendencia: number;
  risco: RiscoFalta;
}

/** Resultado da analítica inteligente de faltas. */
export interface AnaliticaFaltasDetalhe {
  total: number;
  totalAnterior: number;
  /** Variação % do total vs. período anterior; null se não havia base. */
  tendenciaPct: number | null;
  /** % global de absenteísmo no período. */
  taxaGlobal: number;
  porOperador: FaltasOperadorDetalhe[];
  porDiaSemana: { diaSemana: number; nome: string; quantidade: number }[];
}

/** Dia da semana deslocado (0..6). */
function dowOffset(dow: number, delta: number): number {
  return (dow + delta + 7) % 7;
}

/** Conta dias escalados (dow != folga) em [inicio, fim] inclusivo. */
function contarDiasEscalados(folga: number, inicio: Date, fim: Date): number {
  let count = 0;
  const d = new Date(
    Date.UTC(
      inicio.getUTCFullYear(),
      inicio.getUTCMonth(),
      inicio.getUTCDate(),
    ),
  );
  const fimDia = Date.UTC(
    fim.getUTCFullYear(),
    fim.getUTCMonth(),
    fim.getUTCDate(),
  );
  while (d.getTime() <= fimDia) {
    if (d.getUTCDay() !== folga) count += 1;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

/**
 * Classifica o nível de risco do operador a partir dos sinais de falta. Os
 * limiares de taxa/quantidade/sequência e o mapa pontos→nível são partilhados
 * com os não-retornos (`common/risco-ocorrencias`); aqui somam-se os sinais
 * específicos de falta (emenda com folga, dia recorrente e tendência de alta).
 */
function classificarRisco(d: {
  taxa: number;
  quantidade: number;
  faltasEmenda: number;
  diaRecorrente: { quantidade: number } | null;
  sequenciaMax: number;
  tendencia: number;
}): RiscoFalta {
  const pontos =
    pontosPorTaxa(d.taxa) +
    pontosPorQuantidade(d.quantidade) +
    pontosPorSequencia(d.sequenciaMax) +
    (d.faltasEmenda >= 2 ? 1 : 0) +
    (d.diaRecorrente && d.diaRecorrente.quantidade >= 3 ? 1 : 0) +
    (d.tendencia > 0 ? 1 : 0);
  return nivelPorPontos(pontos);
}

const ORDEM_RISCO: Record<RiscoFalta, number> = { ALTO: 0, MEDIO: 1, BAIXO: 2 };

/**
 * Analítica inteligente de faltas no período. Além do total e do ranking,
 * calcula:
 *  - taxa de absenteísmo (%) = faltas / dias escalados (justa entre operadores);
 *  - padrões: dia da semana recorrente, faltas em "emenda" (coladas à folga) e
 *    maior sequência de faltas em dias seguidos;
 *  - tendência vs. período anterior (global e por operador);
 *  - nível de risco por operador (semáforo) combinando os sinais acima.
 *
 * Função pura/determinística (sem Nest nem Prisma). `fimEscala` limita a
 * contagem de dias escalados (normalmente min(fim, hoje)) para uma taxa justa
 * no mês corrente.
 */
export function analisarFaltas(params: {
  operadores: readonly OperadorParaFaltas[];
  ausencias: readonly AusenciaRegistro[];
  ausenciasAnterior: readonly AusenciaRegistro[];
  inicio: Date;
  fimEscala: Date;
}): AnaliticaFaltasDetalhe {
  const { operadores, ausencias, ausenciasAnterior, inicio, fimEscala } =
    params;

  const porOp = new Map<string, AusenciaRegistro[]>();
  for (const a of ausencias) {
    const arr = porOp.get(a.pessoaId) ?? [];
    arr.push(a);
    porOp.set(a.pessoaId, arr);
  }
  const antPorOp = new Map<string, number>();
  for (const a of ausenciasAnterior) {
    antPorOp.set(a.pessoaId, (antPorOp.get(a.pessoaId) ?? 0) + 1);
  }

  const porDow = new Array<number>(7).fill(0);
  for (const a of ausencias) porDow[a.data.getUTCDay()] += 1;

  let somaDias = 0;
  const porOperador: FaltasOperadorDetalhe[] = [];
  for (const op of operadores) {
    const diasEscalados = contarDiasEscalados(
      op.folgaDiaSemana,
      inicio,
      fimEscala,
    );
    somaDias += diasEscalados;
    const regs = porOp.get(op.id) ?? [];
    if (regs.length === 0) continue; // sem faltas: fora do ranking
    const datas = regs.map((r) => r.data);

    const quantidade = regs.length;
    const justificadas = regs.filter(
      (r) => r.statusJustificativa === 'JUSTIFICADA',
    ).length;
    // Peso efetivo: justificadas pesam menos conforme o motivo (ver ADR 0009).
    const pesoTotal = regs.reduce(
      (acc, r) =>
        acc +
        pesoOcorrencia(
          r.statusJustificativa ?? 'PENDENTE',
          r.motivoJustificativa,
        ),
      0,
    );
    const taxa =
      diasEscalados > 0 ? Math.round((quantidade / diasEscalados) * 100) : 0;
    const taxaPonderada =
      diasEscalados > 0 ? Math.round((pesoTotal / diasEscalados) * 100) : 0;
    // Quantidade "efetiva" (para o risco): justificadas contam proporcionalmente.
    const quantidadeEfetiva = Math.round(pesoTotal);

    const vespera = dowOffset(op.folgaDiaSemana, -1);
    const seguinte = dowOffset(op.folgaDiaSemana, 1);
    let faltasEmenda = 0;
    const contagemDow = new Array<number>(7).fill(0);
    for (const d of datas) {
      const dow = d.getUTCDay();
      contagemDow[dow] += 1;
      if (dow === vespera || dow === seguinte) faltasEmenda += 1;
    }

    let melhorDow = -1;
    let melhorQtd = 0;
    for (let dow = 0; dow < 7; dow++) {
      if (contagemDow[dow] > melhorQtd) {
        melhorQtd = contagemDow[dow];
        melhorDow = dow;
      }
    }
    const diaRecorrente =
      melhorQtd >= 2
        ? {
            diaSemana: melhorDow,
            nome: NOMES_DIA_SEMANA[melhorDow],
            quantidade: melhorQtd,
          }
        : null;

    const sequenciaMax = maiorSequenciaDias(datas);
    const tendencia = quantidade - (antPorOp.get(op.id) ?? 0);
    // O risco usa os valores EFETIVOS (justificadas pesam menos), de modo que
    // um operador com faltas abonadas não fique marcado como alto risco.
    const risco = classificarRisco({
      taxa: taxaPonderada,
      quantidade: quantidadeEfetiva,
      faltasEmenda,
      diaRecorrente,
      sequenciaMax,
      tendencia,
    });

    porOperador.push({
      id: op.id,
      nome: op.nome,
      quantidade,
      justificadas,
      diasEscalados,
      taxa,
      taxaPonderada,
      faltasEmenda,
      sequenciaMax,
      diaRecorrente,
      tendencia,
      risco,
    });
  }

  porOperador.sort(
    (a, b) =>
      ORDEM_RISCO[a.risco] - ORDEM_RISCO[b.risco] ||
      b.taxa - a.taxa ||
      b.quantidade - a.quantidade ||
      a.nome.localeCompare(b.nome),
  );

  const total = ausencias.length;
  const totalAnterior = ausenciasAnterior.length;
  const tendenciaPct =
    totalAnterior > 0
      ? Math.round(((total - totalAnterior) / totalAnterior) * 100)
      : null;
  const taxaGlobal = somaDias > 0 ? Math.round((total / somaDias) * 100) : 0;

  const porDiaSemana = porDow.map((quantidade, diaSemana) => ({
    diaSemana,
    nome: NOMES_DIA_SEMANA[diaSemana],
    quantidade,
  }));

  return {
    total,
    totalAnterior,
    tendenciaPct,
    taxaGlobal,
    porOperador,
    porDiaSemana,
  };
}
