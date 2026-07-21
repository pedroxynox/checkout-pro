import * as fc from 'fast-check';
import {
  nivelPorPontos,
  pontosPorQuantidade,
  pontosPorSequencia,
  pontosPorTaxa,
} from './risco-ocorrencias';

/**
 * Puntuação de risco partilhada por faltas e não-retornos. Os limiares aqui são
 * a fonte única usada pelos dois `classificarRisco` de domínio.
 */
describe('nivelPorPontos', () => {
  it('mapeia pontos → nível nos cortes 4 (ALTO) e 2 (MEDIO)', () => {
    expect(nivelPorPontos(0)).toBe('BAIXO');
    expect(nivelPorPontos(1)).toBe('BAIXO');
    expect(nivelPorPontos(2)).toBe('MEDIO');
    expect(nivelPorPontos(3)).toBe('MEDIO');
    expect(nivelPorPontos(4)).toBe('ALTO');
    expect(nivelPorPontos(9)).toBe('ALTO');
  });

  it('Property: é monotônico (mais pontos nunca reduz o risco)', () => {
    const ordem = { BAIXO: 0, MEDIO: 1, ALTO: 2 } as const;
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        (a, b) => {
          const [menor, maior] = a <= b ? [a, b] : [b, a];
          return ordem[nivelPorPontos(menor)] <= ordem[nivelPorPontos(maior)];
        },
      ),
    );
  });
});

describe('pontosPorTaxa', () => {
  it('20%+ → 2, 10%+ → 1, abaixo → 0', () => {
    expect(pontosPorTaxa(0)).toBe(0);
    expect(pontosPorTaxa(9)).toBe(0);
    expect(pontosPorTaxa(10)).toBe(1);
    expect(pontosPorTaxa(19)).toBe(1);
    expect(pontosPorTaxa(20)).toBe(2);
    expect(pontosPorTaxa(100)).toBe(2);
  });
});

describe('pontosPorQuantidade', () => {
  it('4+ → 2, 2+ → 1, abaixo → 0', () => {
    expect(pontosPorQuantidade(0)).toBe(0);
    expect(pontosPorQuantidade(1)).toBe(0);
    expect(pontosPorQuantidade(2)).toBe(1);
    expect(pontosPorQuantidade(3)).toBe(1);
    expect(pontosPorQuantidade(4)).toBe(2);
    expect(pontosPorQuantidade(10)).toBe(2);
  });
});

describe('pontosPorSequencia', () => {
  it('2+ dias colados → 1, senão 0', () => {
    expect(pontosPorSequencia(0)).toBe(0);
    expect(pontosPorSequencia(1)).toBe(0);
    expect(pontosPorSequencia(2)).toBe(1);
    expect(pontosPorSequencia(5)).toBe(1);
  });
});
