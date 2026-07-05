import * as fc from 'fast-check';
import {
  ContagensPorEntidade,
  ENTIDADES_CONSERVADAS,
  ENTIDADES_MOVIMENTO_ESPERADAS,
  PLANO_REINICIO,
  entidadesApagadas,
  executarPlanoPuro,
  planoEhParticaoValida,
} from './reset-operacional.domain';

/**
 * Testes de propriedade (fast-check, ≥100 iterações) do Modulo_ResetOperacional.
 * Exercitam a partição do plano e o modelo puro de execução (idempotência e
 * cobertura do resumo) sem qualquer dependência de banco de dados.
 */

const NUM_RUNS = 200;

// Universo de entidades para gerar estados de contagem (movimento + algumas
// conservadas, para provar que as conservadas nunca são tocadas/reportadas).
const ENTIDADES_GERAVEIS: readonly string[] = [
  ...ENTIDADES_MOVIMENTO_ESPERADAS,
  ...ENTIDADES_CONSERVADAS,
];

// Estado arbitrário: mapa entidade→contagem (subconjunto qualquer do universo).
const estadoArb: fc.Arbitrary<ContagensPorEntidade> = fc.dictionary(
  fc.constantFrom(...ENTIDADES_GERAVEIS),
  fc.nat({ max: 1_000_000 }),
);

describe('reset-operacional — testes de propriedade', () => {
  // Feature: reset-operacional-data-inicial, Property 2: A partição
  // apagar/conservar é disjunta e cobre exatamente as 18 entidades de movimento.
  // Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 8.4
  it('Property 2: partição disjunta e cobertura exata das 18 entidades de movimento', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ENTIDADES_CONSERVADAS),
        fc.constantFrom(...ENTIDADES_MOVIMENTO_ESPERADAS),
        (conservada, movimento) => {
          const apagadas = entidadesApagadas(PLANO_REINICIO);
          return (
            planoEhParticaoValida(PLANO_REINICIO, ENTIDADES_CONSERVADAS) &&
            !apagadas.has(conservada) &&
            apagadas.has(movimento) &&
            apagadas.size === ENTIDADES_MOVIMENTO_ESPERADAS.length
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: reset-operacional-data-inicial, Property 3: Idempotência conceptual
  // do plano de reinício.
  // Validates: Requirements 4.3
  it('Property 3: aplicar o plano duas vezes mantém o estado e o 2º resumo é todo 0', () => {
    fc.assert(
      fc.property(estadoArb, (estado) => {
        const primeira = executarPlanoPuro(estado);
        const segunda = executarPlanoPuro(primeira.estadoFinal);
        const estadoEstavel =
          JSON.stringify(segunda.estadoFinal) ===
          JSON.stringify(primeira.estadoFinal);
        const segundoResumoZerado = Object.values(segunda.resumo).every(
          (v) => v === 0,
        );
        return estadoEstavel && segundoResumoZerado;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: reset-operacional-data-inicial, Property 4: O resumo cobre
  // exatamente as entidades apagadas do plano.
  // Validates: Requirements 4.4
  it('Property 4: chaves do resumo = entidadesApagadas; contagem = existente; conservadas ausentes', () => {
    fc.assert(
      fc.property(estadoArb, (estado) => {
        const { resumo } = executarPlanoPuro(estado);
        const apagadas = entidadesApagadas(PLANO_REINICIO);
        const chaves = Object.keys(resumo);

        const cobreExatamente =
          chaves.length === apagadas.size &&
          chaves.every((k) => apagadas.has(k));
        const contagensCorretas = [...apagadas].every(
          (e) => resumo[e] === (estado[e] ?? 0),
        );
        const nenhumaConservada = ENTIDADES_CONSERVADAS.every(
          (c) => !(c in resumo),
        );
        return cobreExatamente && contagensCorretas && nenhumaConservada;
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
