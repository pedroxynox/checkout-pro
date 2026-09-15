import {
  TIPOS_META,
  ehMetaDerivada,
  intervaloDoMes,
  metaDeEstimativas,
} from './metas.domain';

/**
 * Testes do domínio puro das Metas mensais, com foco na regra nova: a meta de
 * VENDAS é a soma das estimativas diárias do mês (ADR 0017). Sem I/O — a
 * leitura no banco fica no serviço.
 */
describe('metas.domain', () => {
  describe('ehMetaDerivada', () => {
    it('marca VENDAS como derivada (não digitável)', () => {
      expect(ehMetaDerivada('VENDAS')).toBe(true);
    });

    it('mantém as outras quatro metas como digitadas', () => {
      const digitadas = TIPOS_META.filter((t) => t !== 'VENDAS');
      expect(digitadas).toHaveLength(4);
      for (const tipo of digitadas) {
        expect(ehMetaDerivada(tipo)).toBe(false);
      }
    });
  });

  describe('metaDeEstimativas', () => {
    it('soma as estimativas diárias do mês', () => {
      expect(metaDeEstimativas([10000, 12500.5, 8000.25])).toBe(30500.75);
    });

    it('mês sem estimativas resolve 0 ("meta ainda não definida")', () => {
      expect(metaDeEstimativas([])).toBe(0);
    });

    it('arredonda em 2 casas (valor monetário)', () => {
      expect(metaDeEstimativas([0.014, 0.014])).toBe(0.03);
    });

    it('ignora valores não finitos em vez de propagar NaN', () => {
      expect(metaDeEstimativas([100, NaN, Infinity, 50])).toBe(150);
    });

    it('nunca devolve meta negativa', () => {
      expect(metaDeEstimativas([-500])).toBe(0);
    });
  });

  describe('intervaloDoMes', () => {
    it('cobre o mês inteiro em UTC, com fim exclusivo', () => {
      const { inicio, fim } = intervaloDoMes('2026-06');
      expect(inicio.toISOString()).toBe('2026-06-01T00:00:00.000Z');
      expect(fim.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    });

    it('vira o ano corretamente em dezembro', () => {
      const { inicio, fim } = intervaloDoMes('2026-12');
      expect(inicio.toISOString()).toBe('2026-12-01T00:00:00.000Z');
      expect(fim.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    });

    it('recusa período fora do formato AAAA-MM', () => {
      expect(() => intervaloDoMes('2026-13')).toThrow(RangeError);
      expect(() => intervaloDoMes('junho/2026')).toThrow(RangeError);
    });
  });
});
