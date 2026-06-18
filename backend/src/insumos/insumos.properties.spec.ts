import * as fc from 'fast-check';
import {
  FardoRef,
  MovimentoDelta,
  calcularSaldo,
  deltaConsumo,
  deltaRetiradaFardo,
  estoqueBaixo,
  resolverDeltaFardo,
  resolverFardo,
} from './insumos.domain';
import { FardoNaoReconhecidoError } from './insumos.errors';

/**
 * Testes de propriedade (fast-check) do Modulo_Insumos.
 *
 * Cada teste implementa uma única propriedade de correção do design e executa
 * no mínimo 100 iterações. As decisões puras (saldo por soma de movimentos,
 * resolução de fardo e alerta de estoque baixo) são exercitadas sem banco de
 * dados.
 */

const NUM_RUNS = 100;

describe('Insumos — testes de propriedade', () => {
  // Feature: gestao-frente-de-caixa, Property 14: Saldo de estoque igual à soma dos movimentos
  // Validates: Requirements 3.1.2, 3.1.4, 3.2.1, 3.2.2, 3.3.1, 3.3.2
  it('Property 14: saldo = saldo inicial + soma dos deltas; retirada de fardo reduz pela quantidade de sacolas', () => {
    // Gerador de uma sequência de movimentos heterogêneos: retirada de fardo,
    // consumo de bobina e consumo de insumo. Cada um produz um delta negativo
    // pela quantidade correspondente.
    const movimentoArb: fc.Arbitrary<{
      delta: number;
      tipo: 'FARDO' | 'BOBINA' | 'INSUMO';
      quantidade: number;
    }> = fc
      .record({
        tipo: fc.constantFrom(
          'FARDO' as const,
          'BOBINA' as const,
          'INSUMO' as const,
        ),
        quantidade: fc.integer({ min: 1, max: 1000 }),
      })
      .map(({ tipo, quantidade }) => ({
        tipo,
        quantidade,
        delta:
          tipo === 'FARDO'
            ? deltaRetiradaFardo(quantidade)
            : deltaConsumo(quantidade),
      }));

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000000 }),
        fc.array(movimentoArb, { maxLength: 50 }),
        (saldoInicial, movimentos) => {
          const deltas: MovimentoDelta[] = movimentos.map((m) => ({
            delta: m.delta,
          }));
          const saldo = calcularSaldo(saldoInicial, deltas);

          // O saldo é exatamente o inicial somado a todos os deltas.
          const somaEsperada = movimentos.reduce(
            (acc, m) => acc + m.delta,
            saldoInicial,
          );
          if (saldo !== somaEsperada) {
            return false;
          }

          // Cada retirada de fardo reduz o saldo exatamente pela quantidade de
          // sacolas do fardo (delta = -quantidade).
          for (const m of movimentos) {
            if (m.tipo === 'FARDO' && m.delta !== -m.quantidade) {
              return false;
            }
          }
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 15: Fardo não reconhecido não altera estoque
  // Validates: Requirements 3.1.3
  it('Property 15: código de barras sem fardo cadastrado é rejeitado e o saldo permanece inalterado', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            codigoBarras: fc.string({ minLength: 1, maxLength: 12 }),
            quantidadeSacolas: fc.integer({ min: 1, max: 1000 }),
          }),
          { selector: (f) => f.codigoBarras, maxLength: 10 },
        ),
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.integer({ min: 0, max: 100000 }),
        (fardos: FardoRef[], codigoConsultado, saldoInicial) => {
          // Considera apenas o caso em que o código NÃO está cadastrado.
          const cadastrado = fardos.some(
            (f) => f.codigoBarras === codigoConsultado,
          );
          fc.pre(!cadastrado);

          // Resolução retorna null e o delta lança erro de fardo não reconhecido.
          if (resolverFardo(fardos, codigoConsultado) !== null) {
            return false;
          }
          let lancou = false;
          let saldoAposTentativa = saldoInicial;
          try {
            const delta = resolverDeltaFardo(fardos, codigoConsultado);
            // Se (incorretamente) não lançar, o saldo seria alterado.
            saldoAposTentativa = saldoInicial + delta;
          } catch (e) {
            lancou = e instanceof FardoNaoReconhecidoError;
          }

          // Rejeitado e saldo inalterado.
          return lancou === true && saldoAposTentativa === saldoInicial;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 16: Alerta de estoque baixo na fronteira do limite
  // Validates: Requirements 3.1.5, 3.2.3, 3.3.3
  it('Property 16: alerta é emitido se e somente se saldo ≤ limite mínimo', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 100000 }),
        fc.integer({ min: 0, max: 100000 }),
        (saldo, limiteMinimo) => {
          const alerta = estoqueBaixo(saldo, limiteMinimo);
          return alerta === saldo <= limiteMinimo;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
