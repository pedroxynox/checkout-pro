/**
 * Adaptador: converte uma linha de `TipoContratoJornada` (parâmetros em MINUTOS,
 * editáveis pela gestão) numa `RegrasContrato` (em milissegundos) que o cálculo
 * da jornada (`calcularJornadaDia`) consome de forma genérica. As "funções"
 * `cargaBaseMs`/`temAdicional100` viram lookups sobre os arranjos guardados.
 */
import { TipoContratoJornada } from '@prisma/client';
import { CARGA_FERIADO_MS, RegrasContrato } from '../ponto/ponto.domain';

const MIN_MS = 60_000;

/** Normaliza um dia da semana para a faixa 0..6 (0=domingo). */
function diaNaFaixa(diaSemana: number): number {
  return ((Math.trunc(diaSemana) % 7) + 7) % 7;
}

/** Constrói as `RegrasContrato` a partir de um tipo de contrato do banco. */
export function regrasContratoDeModelo(
  modelo: TipoContratoJornada,
): RegrasContrato {
  const carga = modelo.cargaBaseMinPorDia;
  const dias100 = new Set(modelo.diasComAdicional100);
  return {
    cargaBaseMs: (diaSemana) => {
      const idx = diaNaFaixa(diaSemana);
      const min = carga[idx] ?? carga[0] ?? 0;
      return min * MIN_MS;
    },
    // Jornada do feriado: 7h20, fixa, **não** o domingo deste contrato. Um
    // contrato de quem folga fixo no domingo tem `cargaBaseMinPorDia[0] = 0`, e
    // derivar dali fazia todo feriado esperar zero hora — a jornada inteira
    // virava extra a 100% e o dia caía em TAC. Quando a gestão precisar de uma
    // jornada de feriado diferente por contrato, este é o ponto de entrada
    // (hoje não há coluna para isso, e 7h20 vale para todos).
    cargaFeriadoMs: CARGA_FERIADO_MS,
    temAdicional100: (diaSemana) => dias100.has(diaNaFaixa(diaSemana)),
    maxTrabalhoSemIntervaloMs: modelo.maxTrabalhoSemIntervaloMin * MIN_MS,
    intervaloMinimoMs: modelo.intervaloMinimoMin * MIN_MS,
    intervaloMaximoMs: modelo.intervaloMaximoMin * MIN_MS,
    limiteExtrasMs: modelo.limiteExtrasMin * MIN_MS,
    riscoTac1h30Ms: modelo.riscoTac1h30Min * MIN_MS,
    riscoTac1h40Ms: modelo.riscoTac1h40Min * MIN_MS,
    intervaloMinimoEntreBatidasMs:
      modelo.intervaloMinimoEntreBatidasMin * MIN_MS,
    intervaloObrigatorio: modelo.intervaloObrigatorio,
  };
}
