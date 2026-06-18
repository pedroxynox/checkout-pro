import * as fc from 'fast-check';
import {
  ConfigIndicador,
  Periodo,
  RankingItem,
  VendaRegistro,
  acumular,
  pertenceAoPeriodo,
  percentual,
  ranking,
  statusCor,
  vendaValida,
} from './indicadores.domain';

/**
 * Testes de propriedade (fast-check) do Modulo_Indicadores.
 *
 * Cada teste implementa uma única propriedade de correção do design e executa
 * no mínimo 100 iterações. As decisões puras (acumulação de vendas, validação,
 * percentual, classificação de cor e ranking) são exercitadas sem banco de
 * dados.
 */

const NUM_RUNS = 100;

const periodoArb: fc.Arbitrary<Periodo> = fc.constantFrom(
  'DIA',
  'SEMANA',
  'MES',
);

// Datas em uma janela ampla, cobrindo fronteiras de semana/mês.
const dataArb: fc.Arbitrary<Date> = fc
  .integer({ min: 0, max: 400 })
  .map((dias) => new Date(Date.UTC(2024, 0, 1) + dias * 24 * 60 * 60 * 1000));

describe('Modulo_Indicadores — testes de propriedade', () => {
  // Feature: gestao-frente-de-caixa, Property 5: Acumulados de vendas consistentes com recálculo
  // Validates: Requirements 2.1.2, 2.1.3, 2.1.5
  it('Property 5: acumulado de dia/semana/mês é a soma do estado final das vendas no período', () => {
    // Operações: registrar/alterar o valor de um dia. O estado final é um mapa
    // dia -> valor; o acumulado deve ser a soma "do zero" dos valores no
    // período da referência.
    const operacaoArb = fc.record({
      data: dataArb,
      valor: fc.float({ min: 0, max: 100000, noNaN: true }),
    });

    fc.assert(
      fc.property(
        fc.array(operacaoArb, { maxLength: 60 }),
        dataArb,
        periodoArb,
        (operacoes, referencia, periodo) => {
          // Aplica as operações: a última operação de um dia prevalece
          // (registrar seguido de alterações).
          const estado = new Map<number, number>();
          for (const op of operacoes) {
            const chave = Date.UTC(
              op.data.getUTCFullYear(),
              op.data.getUTCMonth(),
              op.data.getUTCDate(),
            );
            estado.set(chave, op.valor);
          }
          const vendas: VendaRegistro[] = Array.from(estado.entries()).map(
            ([ms, valor]) => ({ data: new Date(ms), valor }),
          );

          const resultado = acumular(vendas, referencia, periodo);

          // Recálculo independente "do zero".
          const esperado = vendas
            .filter((v) => pertenceAoPeriodo(v.data, referencia, periodo))
            .reduce((s, v) => s + v.valor, 0);

          return Math.abs(resultado - esperado) < 1e-6;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 6: Valor de vendas negativo é rejeitado
  // Validates: Requirements 2.1.4
  it('Property 6: valor < 0 é inválido; valor >= 0 é válido', () => {
    fc.assert(
      fc.property(
        fc.float({ min: -100000, max: 100000, noNaN: true }),
        (valor) => {
          const valido = vendaValida(valor);
          return valor >= 0 ? valido === true : valido === false;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 7: Cálculo do indicador percentual
  // Validates: Requirements 2.2.1, 2.3.1
  it('Property 7: percentual = (totalIndicador / totalVendas) * 100 para vendas > 0', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1_000_000, noNaN: true }),
        fc.float({ min: Math.fround(0.01), max: 1_000_000, noNaN: true }),
        (totalIndicador, totalVendas) => {
          const resultado = percentual(totalIndicador, totalVendas);
          const esperado = (totalIndicador / totalVendas) * 100;
          return Math.abs(resultado - esperado) < 1e-6;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 8: Classificação de cor "menor é melhor"
  // Validates: Requirements 2.2.3, 2.2.4, 2.2.5, 2.3.3, 2.3.4, 2.3.5
  it('Property 8: menor é melhor — VERDE <= meta < AMARELO <= limite < VERMELHO', () => {
    fc.assert(
      fc.property(
        // meta <= limiteAmarelo para um particionamento total e exclusivo.
        fc.float({ min: 0, max: 1000, noNaN: true }),
        fc.float({ min: 0, max: 1000, noNaN: true }),
        fc.float({ min: 0, max: 2000, noNaN: true }),
        (a, b, valor) => {
          const meta = Math.min(a, b);
          const limiteAmarelo = Math.max(a, b);
          const config: ConfigIndicador = {
            meta,
            limiteAmarelo,
            sentido: 'MENOR_MELHOR',
          };
          const cor = statusCor(valor, config);

          let esperado: string;
          if (valor <= meta) {
            esperado = 'VERDE';
          } else if (valor <= limiteAmarelo) {
            esperado = 'AMARELO';
          } else {
            esperado = 'VERMELHO';
          }
          return cor === esperado;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 9: Classificação de cor "maior é melhor"
  // Validates: Requirements 2.4.3, 2.4.4, 2.4.5, 2.5.3, 2.5.4, 2.5.5
  it('Property 9: maior é melhor — VERMELHO < limite <= AMARELO < meta <= VERDE', () => {
    fc.assert(
      fc.property(
        // limiteAmarelo <= meta para um particionamento total e exclusivo.
        fc.float({ min: 0, max: 5000, noNaN: true }),
        fc.float({ min: 0, max: 5000, noNaN: true }),
        fc.float({ min: 0, max: 10000, noNaN: true }),
        (a, b, valor) => {
          const limiteAmarelo = Math.min(a, b);
          const meta = Math.max(a, b);
          const config: ConfigIndicador = {
            meta,
            limiteAmarelo,
            sentido: 'MAIOR_MELHOR',
          };
          const cor = statusCor(valor, config);

          let esperado: string;
          if (valor >= meta) {
            esperado = 'VERDE';
          } else if (valor >= limiteAmarelo) {
            esperado = 'AMARELO';
          } else {
            esperado = 'VERMELHO';
          }
          return cor === esperado;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 10: Ranking ordenado e completo
  // Validates: Requirements 2.2.6, 2.3.6, 2.4.6, 2.5.6
  it('Property 10: ranking ordenado de forma decrescente e permutação exata da entrada', () => {
    const itemArb: fc.Arbitrary<RankingItem> = fc.record({
      pessoaId: fc.string({ minLength: 1, maxLength: 6 }),
      total: fc.float({ min: 0, max: 100000, noNaN: true }),
    });

    fc.assert(
      fc.property(
        fc.uniqueArray(itemArb, {
          maxLength: 30,
          selector: (i) => i.pessoaId,
        }),
        (itens) => {
          const r = ranking(itens);

          // (1) Mesma cardinalidade.
          if (r.length !== itens.length) {
            return false;
          }

          // (2) Permutação exata: mesmo multiconjunto de (pessoaId, total).
          const chave = (i: RankingItem) => `${i.pessoaId}=${i.total}`;
          const entrada = [...itens].map(chave).sort();
          const saida = [...r].map(chave).sort();
          if (JSON.stringify(entrada) !== JSON.stringify(saida)) {
            return false;
          }

          // (3) Ordenação decrescente pelo total.
          for (let i = 1; i < r.length; i++) {
            if (r[i - 1].total < r[i].total) {
              return false;
            }
          }
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
