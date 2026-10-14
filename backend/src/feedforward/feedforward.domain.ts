import { inicioDoDia } from '../common/datas';

/**
 * Domínio puro do Feedforward (sem I/O). Concentra a regra do "semáforo" de um
 * ponto a melhorar (com prazo) e a decisão de quando um ponto está vencido
 * (consumida pelo cron de avisos).
 */

/** Estado persistido de um ponto a melhorar. */
export type StatusPontoFeedforward = 'PENDENTE' | 'ATINGIDO' | 'NAO_ATINGIDO';

/**
 * Situação exibida de um ponto (semáforo):
 *  - EM_DIA (verde): pendente, com folga de prazo.
 *  - PROXIMO (amarelo): pendente, vence em <= ANTECEDENCIA dias.
 *  - VENCIDO (vermelho): pendente e o prazo já passou (ou é hoje).
 *  - ATINGIDO (verde) / NAO_ATINGIDO (vermelho): já revisado.
 */
export type SituacaoPontoFeedforward =
  | 'EM_DIA'
  | 'PROXIMO'
  | 'VENCIDO'
  | 'ATINGIDO'
  | 'NAO_ATINGIDO';

/** Antecedência (dias) em que um ponto pendente passa a "PROXIMO". */
export const ANTECEDENCIA_ALERTA_DIAS = 3;

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/** Diferença em dias civis (UTC, date-only) entre `de` e `ate`. */
export function diffEmDias(de: Date, ate: Date): number {
  return Math.round(
    (inicioDoDia(ate).getTime() - inicioDoDia(de).getTime()) / UM_DIA_MS,
  );
}

/** Situação (semáforo) de um ponto na data `hoje`. */
export function situacaoPonto(
  status: StatusPontoFeedforward,
  prazo: Date,
  hoje: Date,
): SituacaoPontoFeedforward {
  if (status === 'ATINGIDO') return 'ATINGIDO';
  if (status === 'NAO_ATINGIDO') return 'NAO_ATINGIDO';
  const dias = diffEmDias(hoje, prazo); // >0 faltam, 0 hoje, <0 vencido
  if (dias <= 0) return 'VENCIDO';
  if (dias <= ANTECEDENCIA_ALERTA_DIAS) return 'PROXIMO';
  return 'EM_DIA';
}

/**
 * true quando um ponto PENDENTE já venceu (o prazo é hoje ou já passou) — é o
 * gatilho do aviso aos supervisores/gerentes. Pontos já revisados nunca são
 * vencidos.
 */
export function pontoVencido(
  status: StatusPontoFeedforward,
  prazo: Date,
  hoje: Date,
): boolean {
  return status === 'PENDENTE' && diffEmDias(hoje, prazo) <= 0;
}

/**
 * Intervalo (dias) entre os lembretes de um ponto que venceu e continua
 * pendente. Evita avisar a liderança todos os dias sobre o mesmo ponto.
 */
export const INTERVALO_LEMBRETE_DIAS = 7;

/** Dias de atraso de um ponto em `hoje` (0 no dia do prazo; nunca negativo). */
export function diasDeAtraso(prazo: Date, hoje: Date): number {
  return Math.max(0, diffEmDias(prazo, hoje));
}

/**
 * true quando o cron deve avisar sobre o ponto em `hoje`: só para pontos
 * PENDENTES, **no dia em que o prazo vence** e, se continuarem pendentes, a
 * cada `INTERVALO_LEMBRETE_DIAS` dias depois (7, 14, 21… dias de atraso).
 * Antes o aviso se repetia diariamente até alguém revisar o ponto.
 */
export function deveAvisarPonto(
  status: StatusPontoFeedforward,
  prazo: Date,
  hoje: Date,
): boolean {
  if (!pontoVencido(status, prazo, hoje)) return false;
  return diasDeAtraso(prazo, hoje) % INTERVALO_LEMBRETE_DIAS === 0;
}
