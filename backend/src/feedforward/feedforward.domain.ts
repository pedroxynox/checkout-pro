import { inicioDoDia } from '../common/datas';
import {
  PontoJaRevisadoError,
  ProrrogacaoInvalidaError,
} from './feedforward.errors';

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

/** dd/mm/aaaa (UTC, date-only) — para mensagens de erro. */
function dataBR(d: Date): string {
  const iso = inicioDoDia(d).toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/**
 * Garante que o ponto ainda está PENDENTE — só pontos pendentes podem ser
 * editados, prorrogados ou removidos (o resultado revisado é histórico).
 */
export function garantirPontoPendente(status: StatusPontoFeedforward): void {
  if (status !== 'PENDENTE') throw new PontoJaRevisadoError();
}

/**
 * Valida uma prorrogação de prazo:
 *  - o ponto precisa estar PENDENTE;
 *  - o novo prazo precisa ser **posterior ao prazo atual** (prorrogar é
 *    estender; para encurtar, edite e registre outra rodada);
 *  - o novo prazo precisa ser **futuro** (a partir de amanhã) — um prazo
 *    "hoje" já nasceria vencido e geraria aviso no mesmo dia.
 */
export function validarProrrogacao(
  status: StatusPontoFeedforward,
  prazoAtual: Date,
  novoPrazo: Date,
  hoje: Date,
): void {
  garantirPontoPendente(status);
  if (Number.isNaN(novoPrazo.getTime())) {
    throw new ProrrogacaoInvalidaError('Informe um novo prazo válido.');
  }
  if (diffEmDias(prazoAtual, novoPrazo) <= 0) {
    throw new ProrrogacaoInvalidaError(
      `O novo prazo deve ser posterior ao prazo atual (${dataBR(prazoAtual)}).`,
    );
  }
  if (diffEmDias(hoje, novoPrazo) <= 0) {
    throw new ProrrogacaoInvalidaError(
      'O novo prazo deve ser uma data futura (a partir de amanhã).',
    );
  }
}

/**
 * Normaliza um texto opcional de edição: `undefined` = não mexer; `null` ou
 * só espaços = limpar (grava `null`); senão, o texto sem espaços nas pontas.
 */
export function normalizarTextoEdicao(
  valor: string | null | undefined,
): string | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  const t = valor.trim();
  return t.length > 0 ? t : null;
}
