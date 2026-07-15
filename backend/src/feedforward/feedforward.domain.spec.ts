import { pontoVencido, situacaoPonto } from './feedforward.domain';

const HOJE = new Date(Date.UTC(2026, 6, 15)); // 15/07/2026
const D = (dia: number): Date => new Date(Date.UTC(2026, 6, dia));

describe('feedforward.domain — situacaoPonto', () => {
  it('pendente com folga de prazo → EM_DIA', () => {
    expect(situacaoPonto('PENDENTE', D(20), HOJE)).toBe('EM_DIA');
  });

  it('pendente vencendo em <= 3 dias → PROXIMO', () => {
    expect(situacaoPonto('PENDENTE', D(17), HOJE)).toBe('PROXIMO');
    expect(situacaoPonto('PENDENTE', D(16), HOJE)).toBe('PROXIMO');
  });

  it('pendente com prazo hoje ou passado → VENCIDO', () => {
    expect(situacaoPonto('PENDENTE', D(15), HOJE)).toBe('VENCIDO'); // hoje
    expect(situacaoPonto('PENDENTE', D(10), HOJE)).toBe('VENCIDO'); // passado
  });

  it('já revisado reflete o status (independe do prazo)', () => {
    expect(situacaoPonto('ATINGIDO', D(10), HOJE)).toBe('ATINGIDO');
    expect(situacaoPonto('NAO_ATINGIDO', D(30), HOJE)).toBe('NAO_ATINGIDO');
  });
});

describe('feedforward.domain — pontoVencido (gatilho do aviso)', () => {
  it('pendente com prazo hoje ou antes → vencido', () => {
    expect(pontoVencido('PENDENTE', D(15), HOJE)).toBe(true);
    expect(pontoVencido('PENDENTE', D(14), HOJE)).toBe(true);
  });

  it('pendente com prazo futuro → não vencido', () => {
    expect(pontoVencido('PENDENTE', D(16), HOJE)).toBe(false);
  });

  it('já revisado nunca é vencido', () => {
    expect(pontoVencido('ATINGIDO', D(10), HOJE)).toBe(false);
    expect(pontoVencido('NAO_ATINGIDO', D(10), HOJE)).toBe(false);
  });
});
