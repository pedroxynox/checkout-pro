import * as fc from 'fast-check';

/**
 * Teste de fumaça (smoke test) para garantir que o runner de testes (Jest) e
 * a biblioteca de testes de propriedade (fast-check) estão corretamente
 * configurados. Os testes de propriedade reais dos módulos de domínio serão
 * adicionados nas tarefas subsequentes do plano.
 */
describe('Fundação de testes (smoke)', () => {
  it('Jest executa um teste de exemplo', () => {
    expect(1 + 1).toBe(2);
  });

  it('fast-check executa um teste de propriedade', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a + b === b + a;
      }),
      { numRuns: 100 },
    );
  });
});
