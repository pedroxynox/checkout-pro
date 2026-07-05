import * as fc from 'fast-check';
import { dataPermitida, inicioDoDiaUTC } from './data-inicial.domain';

/**
 * Testes de propriedade (fast-check) do Modulo_DataInicial.
 *
 * Cada teste implementa uma única propriedade de correção do design e executa
 * no mínimo 100 iterações sobre a decisão pura de "data ≥ Data_Inicial_Sistema",
 * sem qualquer dependência de banco de dados.
 */

const NUM_RUNS = 200;
const UM_DIA_MS = 24 * 60 * 60 * 1000;

// Data (meia-noite UTC) dentro de uma janela ampla ao redor do padrão 2026-07-01.
const dataInicialArb: fc.Arbitrary<Date> = fc
  .integer({ min: -400, max: 400 })
  .map((dias) => new Date(Date.UTC(2026, 6, 1) + dias * UM_DIA_MS));

// Hora arbitrária dentro do dia (para provar que a comparação é POR DIA).
const horaDoDiaArb: fc.Arbitrary<number> = fc.integer({
  min: 0,
  max: UM_DIA_MS - 1,
});

describe('Data_Inicial_Sistema — testes de propriedade', () => {
  // Feature: reset-operacional-data-inicial, Property 1: Fronteira exata de
  // dataPermitida — data = dataInicial + k dias é permitida sse e somente se k>=0.
  // Validates: Requirements 6.1, 6.2, 8.4
  it('Property 1: dataPermitida(dataInicial + k dias, dataInicial) === (k >= 0)', () => {
    fc.assert(
      fc.property(
        dataInicialArb,
        fc.integer({ min: -365, max: 365 }),
        horaDoDiaArb,
        (dataInicial, k, hora) => {
          // data = dataInicial deslocada de k dias, com uma hora qualquer no dia.
          const data = new Date(
            inicioDoDiaUTC(dataInicial) + k * UM_DIA_MS + hora,
          );
          return dataPermitida(data, dataInicial) === k >= 0;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Fronteira explícita: k = 0 permitido; k = -1 rejeitado (casos-limite exigidos).
  it('Property 1 (fronteira): k=0 permitido e k=-1 rejeitado', () => {
    fc.assert(
      fc.property(dataInicialArb, horaDoDiaArb, (dataInicial, hora) => {
        const base = inicioDoDiaUTC(dataInicial);
        const mesmoDia = new Date(base + hora);
        const diaAnterior = new Date(base - UM_DIA_MS + hora);
        return (
          dataPermitida(mesmoDia, dataInicial) === true &&
          dataPermitida(diaAnterior, dataInicial) === false
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
