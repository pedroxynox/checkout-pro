import * as fc from 'fast-check';
import {
  diaDentroDoPeriodo,
  estaDeFerias,
  periodosSobrepoem,
  validarPeriodoFerias,
  MAX_DIAS_FERIAS,
} from './ferias.domain';

const dia = (ano: number, mes: number, d: number) =>
  new Date(Date.UTC(ano, mes, d));

describe('ferias.domain', () => {
  describe('diaDentroDoPeriodo', () => {
    const periodo = { inicio: dia(2026, 6, 10), fim: dia(2026, 6, 20) };

    it('inclui os extremos e o meio, exclui fora', () => {
      expect(diaDentroDoPeriodo(dia(2026, 6, 10), periodo)).toBe(true); // início
      expect(diaDentroDoPeriodo(dia(2026, 6, 20), periodo)).toBe(true); // fim
      expect(diaDentroDoPeriodo(dia(2026, 6, 15), periodo)).toBe(true); // meio
      expect(diaDentroDoPeriodo(dia(2026, 6, 9), periodo)).toBe(false); // antes
      expect(diaDentroDoPeriodo(dia(2026, 6, 21), periodo)).toBe(false); // depois
    });

    it('ignora a hora (compara em dia civil)', () => {
      const comHora = new Date(Date.UTC(2026, 6, 20, 23, 59, 59));
      expect(diaDentroDoPeriodo(comHora, periodo)).toBe(true);
    });
  });

  describe('estaDeFerias', () => {
    it('false para lista vazia', () => {
      expect(estaDeFerias([], dia(2026, 6, 15))).toBe(false);
    });

    it('true se algum período engloba o dia', () => {
      const periodos = [
        { inicio: dia(2026, 0, 1), fim: dia(2026, 0, 5) },
        { inicio: dia(2026, 6, 10), fim: dia(2026, 6, 20) },
      ];
      expect(estaDeFerias(periodos, dia(2026, 6, 15))).toBe(true);
      expect(estaDeFerias(periodos, dia(2026, 3, 1))).toBe(false);
    });
  });

  describe('periodosSobrepoem', () => {
    it('detecta sobreposição e ausência dela', () => {
      const a = { inicio: dia(2026, 6, 10), fim: dia(2026, 6, 20) };
      expect(
        periodosSobrepoem(a, {
          inicio: dia(2026, 6, 20),
          fim: dia(2026, 6, 25),
        }),
      ).toBe(true); // encosta num dia
      expect(
        periodosSobrepoem(a, {
          inicio: dia(2026, 6, 21),
          fim: dia(2026, 6, 25),
        }),
      ).toBe(false); // dia seguinte
      expect(periodosSobrepoem(a, a)).toBe(true);
    });
  });

  describe('validarPeriodoFerias', () => {
    it('rejeita data final antes da inicial', () => {
      const r = validarPeriodoFerias(dia(2026, 6, 20), dia(2026, 6, 10));
      expect(r.ok).toBe(false);
    });

    it('conta dias corridos inclusive quando ok', () => {
      const r = validarPeriodoFerias(dia(2026, 6, 10), dia(2026, 6, 12));
      expect(r).toEqual({ ok: true, dias: 3 });
    });

    it('rejeita período longo demais', () => {
      const r = validarPeriodoFerias(dia(2020, 0, 1), dia(2026, 0, 1));
      expect(r.ok).toBe(false);
    });
  });

  describe('propriedades', () => {
    it('um período válido sempre contém o próprio início e fim', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 3000 }),
          fc.integer({ min: 0, max: MAX_DIAS_FERIAS - 1 }),
          (offsetDias, duracao) => {
            const base = dia(2026, 0, 1);
            const inicio = new Date(base.getTime() + offsetDias * 86400000);
            const fim = new Date(inicio.getTime() + duracao * 86400000);
            const periodo = { inicio, fim };
            return (
              diaDentroDoPeriodo(inicio, periodo) &&
              diaDentroDoPeriodo(fim, periodo) &&
              estaDeFerias([periodo], inicio) &&
              estaDeFerias([periodo], fim)
            );
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
