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

export type Turno = 'ABERTURA' | 'INTERMEDIARIO' | 'FECHAMENTO';

/** Contagem de operadores trabalhando, particionada por turno mais o total. */
export interface ContagemTurno {
  abertura: number;
  intermediario: number;
  fechamento: number;
  total: number;
}

/** Registro mínimo de uma ausência (pessoa + data). */
export interface AusenciaRegistro {
  pessoaId: string;
  data: Date;
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
