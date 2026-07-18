import { contribuicaoSaldoTime } from './central-jornada.service';

const H = (horas: number) => horas * 60 * 60 * 1000;

/**
 * Saldo do time (saldo atual da tela): soma só as horas 50% POSITIVAS de cada
 * pessoa (o débito de horas consome apenas as 50%; se ficar negativo, aporta 0)
 * MAIS todas as horas 100% (nunca são debitadas). O saldo negativo é individual
 * (card) e não puxa o total.
 */
describe('contribuicaoSaldoTime — regra do saldo do time', () => {
  it('5h de 50% com débito de 7h → aporta 0 (não puxa o time)', () => {
    const c = contribuicaoSaldoTime({
      extras50Ms: H(5),
      extras100Ms: 0,
      horasDevidasMs: H(7),
    });
    expect(c).toBe(0);
  });

  it('as horas 100% entram sempre, mesmo com débito que zera as 50%', () => {
    // 50%: 5 − 7 = -2 → 0; 100%: 4 (intactas) → contribuição = 4h.
    const c = contribuicaoSaldoTime({
      extras50Ms: H(5),
      extras100Ms: H(4),
      horasDevidasMs: H(7),
    });
    expect(c).toBe(H(4));
  });

  it('sem débito: soma 50% positivas + 100%', () => {
    const c = contribuicaoSaldoTime({
      extras50Ms: H(3),
      extras100Ms: H(2),
      horasDevidasMs: 0,
    });
    expect(c).toBe(H(5));
  });

  it('quem não tem horas positivas aporta 0', () => {
    const c = contribuicaoSaldoTime({
      extras50Ms: 0,
      extras100Ms: 0,
      horasDevidasMs: H(8),
    });
    expect(c).toBe(0);
  });
});
