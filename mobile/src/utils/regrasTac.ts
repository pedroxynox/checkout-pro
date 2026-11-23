/**
 * Textos de TAC do Registro de Ponto a partir dos limites do contrato do dia
 * (`regrasResumo`, spec `jornada-5x2`, R2.5). Antes a tela escrevia
 * "1h50/1h/3h" e "1h30/1h40" fixos; agora cita o contrato. Para o 6x1 os textos
 * saem iguais aos de antes.
 */
import type { RegrasResumoPonto } from '../api/types';

/** Limites do 6x1: valem quando a resposta não traz `regrasResumo`. */
export const REGRAS_RESUMO_6X1: RegrasResumoPonto = {
  limiteExtrasMin: 110,
  primeiroAvisoMin: 90,
  segundoAvisoMin: 100,
  intervaloMinimoMin: 60,
  intervaloMaximoMin: 180,
  limiteTrabalhoDiaMin: null,
};

/**
 * Minutos em texto curto, como o backend escreve nos motivos de TAC: "1h50",
 * "1h", "50 min". Espelho de `backend/src/common/duracao.ts#textoDuracao`.
 */
export function textoDuracaoMin(minutos: number): string {
  const sinal = minutos < 0 ? '-' : '';
  const total = Math.abs(Math.round(minutos));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${sinal}${m} min`;
  return m === 0
    ? `${sinal}${h}h`
    : `${sinal}${h}h${String(m).padStart(2, '0')}`;
}

/** Os limites do dia, ou os do 6x1 quando a resposta não os traz. */
export function regrasDoDia(
  resumo: RegrasResumoPonto | undefined | null,
): RegrasResumoPonto {
  return resumo ?? REGRAS_RESUMO_6X1;
}

/**
 * Linha "• TAC: …" do "Como é calculado?" para um dia sem TAC. No 6x1: "• TAC:
 * acima de 1h50 de extras, ou intervalo abaixo de 1h / acima de 3h."
 */
export function textoRegraTac(resumo: RegrasResumoPonto): string {
  const t = textoDuracaoMin;
  const teto =
    resumo.limiteTrabalhoDiaMin != null
      ? `, ou mais de ${t(resumo.limiteTrabalhoDiaMin)} trabalhadas no dia`
      : '';
  return (
    `• TAC: acima de ${t(resumo.limiteExtrasMin)} de extras, ou intervalo ` +
    `abaixo de ${t(resumo.intervaloMinimoMin)} / acima de ` +
    `${t(resumo.intervaloMaximoMin)}${teto}.`
  );
}

/**
 * Faixa amarela de risco (o dia já passou do 1º aviso). No 6x1: "Risco de TAC:
 * já atingiu 1h30 de horas extras." e, a partir de 1h40, "Risco alto de TAC:
 * já atingiu 1h40 de horas extras."
 */
export function textoRiscoTac(
  horasExtrasMs: number,
  resumo: RegrasResumoPonto,
): string {
  const alto = horasExtrasMs >= resumo.segundoAvisoMin * 60_000;
  return alto
    ? `Risco alto de TAC: já atingiu ${textoDuracaoMin(resumo.segundoAvisoMin)} de horas extras.`
    : `Risco de TAC: já atingiu ${textoDuracaoMin(resumo.primeiroAvisoMin)} de horas extras.`;
}
