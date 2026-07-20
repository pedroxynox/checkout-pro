/**
 * Lógica de domínio **pura** das férias (inativação não rígida) — sem Nest nem
 * Prisma, portanto testável isoladamente e por propriedades (fast-check).
 *
 * Uma "férias" é um período `[inicio, fim]` inclusivo em ambos os extremos,
 * rotulado em meia-noite UTC (como as demais datas de negócio). Enquanto um dia
 * cai dentro de algum período de férias, o colaborador é considerado "de
 * férias" naquele dia: some da escala e não gera falta automática.
 */

/** Um período de férias já persistido (só o que o domínio precisa). */
export interface PeriodoFerias {
  inicio: Date;
  fim: Date;
}

/** Máximo de dias que um período de férias pode cobrir (defensivo). */
export const MAX_DIAS_FERIAS = 366; // um ciclo anual, com folga

/** Um dia (00:00 UTC) em milissegundos. */
const UM_DIA_MS = 24 * 60 * 60 * 1000;

/** Trunca um instante para o início do dia em UTC (meia-noite). */
export function inicioDoDiaUtc(data: Date): Date {
  return new Date(
    Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()),
  );
}

/**
 * Verdadeiro se `dia` cai dentro do período `[inicio, fim]` (inclusive). A
 * comparação é feita em dia civil (truncado), então a hora dos limites não
 * influencia.
 */
export function diaDentroDoPeriodo(dia: Date, periodo: PeriodoFerias): boolean {
  const d = inicioDoDiaUtc(dia).getTime();
  const i = inicioDoDiaUtc(periodo.inicio).getTime();
  const f = inicioDoDiaUtc(periodo.fim).getTime();
  return d >= i && d <= f;
}

/**
 * Verdadeiro se o colaborador está de férias no `dia` informado, dado o
 * conjunto dos seus períodos. Determinística e tolerante a lista vazia.
 */
export function estaDeFerias(
  periodos: readonly PeriodoFerias[],
  dia: Date,
): boolean {
  return periodos.some((p) => diaDentroDoPeriodo(dia, p));
}

/**
 * Verdadeiro se dois períodos de férias se sobrepõem em pelo menos um dia
 * (comparação em dia civil). Usado para impedir cadastrar férias em cima de
 * férias já existentes do mesmo colaborador.
 */
export function periodosSobrepoem(a: PeriodoFerias, b: PeriodoFerias): boolean {
  const ai = inicioDoDiaUtc(a.inicio).getTime();
  const af = inicioDoDiaUtc(a.fim).getTime();
  const bi = inicioDoDiaUtc(b.inicio).getTime();
  const bf = inicioDoDiaUtc(b.fim).getTime();
  return ai <= bf && bi <= af;
}

/** Resultado da validação de um novo período de férias. */
export type ValidacaoPeriodoFerias =
  | { ok: true; dias: number }
  | { ok: false; motivo: 'INTERVALO_INVERTIDO' | 'PERIODO_LONGO_DEMAIS' };

/**
 * Valida um período de férias novo (independentemente de sobreposição, que
 * depende de I/O): a data final não pode ser anterior à inicial e o período não
 * pode ser absurdamente longo. Devolve a quantidade de dias corridos quando ok.
 */
export function validarPeriodoFerias(
  inicio: Date,
  fim: Date,
): ValidacaoPeriodoFerias {
  const i = inicioDoDiaUtc(inicio).getTime();
  const f = inicioDoDiaUtc(fim).getTime();
  if (f < i) return { ok: false, motivo: 'INTERVALO_INVERTIDO' };
  const dias = Math.round((f - i) / UM_DIA_MS) + 1;
  if (dias > MAX_DIAS_FERIAS)
    return { ok: false, motivo: 'PERIODO_LONGO_DEMAIS' };
  return { ok: true, dias };
}
