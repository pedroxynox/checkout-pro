/**
 * Lógica de domínio **pura** do monitoramento de fiscais (Req 4.1, 4.2).
 *
 * Concentra a regra de "última alteração vence" para o status exibido no painel
 * (Req 4.1.1, 4.1.2) e as transições de check-in/check-out, incluindo a rejeição
 * de check-in duplicado (Req 4.2.1, 4.2.2, 4.2.3).
 *
 * Por serem puras e determinísticas, podem ser exercitadas por testes de
 * propriedade (fast-check) sem qualquer infraestrutura.
 */

import { StatusInvalidoError } from './fiscais.errors';

export type StatusFiscal = 'DISPONIVEL' | 'EM_INTERVALO' | 'EM_ATENDIMENTO';

/** Conjunto válido de status de um fiscal (Req 4.1.1). */
export const STATUS_FISCAIS: readonly StatusFiscal[] = Object.freeze([
  'DISPONIVEL',
  'EM_INTERVALO',
  'EM_ATENDIMENTO',
]);

const STATUS_SET = new Set<string>(STATUS_FISCAIS);

/** Indica se um valor pertence ao conjunto válido de status de fiscal. */
export function statusValido(status: string): status is StatusFiscal {
  return STATUS_SET.has(status);
}

/** Uma alteração de status com o instante em que foi definida. */
export interface AlteracaoStatus {
  status: StatusFiscal;
  em: Date;
}

/**
 * Resolve o status exibido no painel (Req 4.1.1, 4.1.2): a "última alteração
 * vence". Dada uma sequência de alterações, retorna o status da alteração com
 * o instante mais recente; em caso de empate de instante, a última na sequência
 * prevalece. Retorna `null` quando não há nenhuma alteração.
 */
export function ultimoStatus(
  alteracoes: readonly AlteracaoStatus[],
): StatusFiscal | null {
  let atual: AlteracaoStatus | null = null;
  for (const a of alteracoes) {
    if (atual === null || a.em.getTime() >= atual.em.getTime()) {
      atual = a;
    }
  }
  return atual ? atual.status : null;
}

/**
 * Valida um status, lançando `StatusInvalidoError` quando fora do conjunto
 * permitido (Req 4.1.1). Retorna o próprio status quando válido.
 */
export function validarStatus(status: string): StatusFiscal {
  if (!statusValido(status)) {
    throw new StatusInvalidoError(status);
  }
  return status;
}

/** Estado de uma sessão de fiscal (check-in/check-out). */
export interface EstadoSessao {
  ativa: boolean;
  checkIn: Date;
  checkOut: Date | null;
  status: StatusFiscal;
}

/**
 * Indica se um fiscal pode realizar check-in (Req 4.2.3): só é permitido quando
 * não há uma sessão ativa. `null` representa a ausência de sessão.
 */
export function podeCheckIn(sessaoAtiva: EstadoSessao | null): boolean {
  return sessaoAtiva === null || !sessaoAtiva.ativa;
}

/**
 * Cria o estado de uma sessão após o check-in (Req 4.2.1): registra o horário
 * de entrada, marca a sessão como ativa e define o status como "disponível".
 */
export function realizarCheckIn(em: Date): EstadoSessao {
  return {
    ativa: true,
    checkIn: em,
    checkOut: null,
    status: 'DISPONIVEL',
  };
}

/**
 * Aplica o check-out a uma sessão (Req 4.2.2): registra o horário de saída e
 * marca a sessão como fora de serviço. Retorna um **novo** estado sem mutar o
 * original.
 */
export function realizarCheckOut(sessao: EstadoSessao, em: Date): EstadoSessao {
  return {
    ...sessao,
    ativa: false,
    checkOut: em,
  };
}
