import {
  EscalaColaboradorInput,
  gerarEscalaSemanalFiscal,
  temEscalaDefinida,
} from './escala.domain';

/**
 * Testes da geração da escala semanal a partir do cadastro do colaborador
 * (Opção A: o Colaborador é a fonte única da escala geral do fiscal).
 */
describe('gerarEscalaSemanalFiscal', () => {
  const base: EscalaColaboradorInput = {
    entradaSemana: '08:00',
    saidaSemana: '17:00',
    entradaFds: '09:00',
    saidaFds: '18:00',
    folgaDiaSemana: 1, // segunda
  };

  it('mapeia Seg–Qui, Sex–Sáb, marca a folga e omite o domingo sem horário', () => {
    const dias = gerarEscalaSemanalFiscal(base);
    const porDia = new Map(dias.map((d) => [d.diaSemana, d]));

    // Domingo (0): sem horário no cadastro e não é folga → omitido.
    expect(porDia.has(0)).toBe(false);
    // Segunda (1): folga.
    expect(porDia.get(1)).toEqual({
      diaSemana: 1,
      entrada: null,
      saida: null,
      folga: true,
    });
    // Ter–Qui (2–4): horário Seg–Qui.
    for (const d of [2, 3, 4]) {
      expect(porDia.get(d)).toEqual({
        diaSemana: d,
        entrada: '08:00',
        saida: '17:00',
        folga: false,
      });
    }
    // Sex–Sáb (5–6): horário de fim de semana.
    for (const d of [5, 6]) {
      expect(porDia.get(d)).toEqual({
        diaSemana: d,
        entrada: '09:00',
        saida: '18:00',
        folga: false,
      });
    }
    // 1 folga + 3 (ter–qui) + 2 (sex–sáb) = 6 dias.
    expect(dias).toHaveLength(6);
  });

  it('inclui o domingo quando é o dia de folga', () => {
    const dias = gerarEscalaSemanalFiscal({ ...base, folgaDiaSemana: 0 });
    const domingo = dias.find((d) => d.diaSemana === 0);
    expect(domingo).toEqual({ diaSemana: 0, entrada: null, saida: null, folga: true });
    // Como a folga saiu da segunda, segunda volta a ter horário Seg–Qui.
    expect(dias.find((d) => d.diaSemana === 1)?.folga).toBe(false);
  });

  it('sem horários, gera apenas a folga', () => {
    const dias = gerarEscalaSemanalFiscal({
      entradaSemana: null,
      saidaSemana: null,
      entradaFds: null,
      saidaFds: null,
      folgaDiaSemana: 3,
    });
    expect(dias).toEqual([
      { diaSemana: 3, entrada: null, saida: null, folga: true },
    ]);
  });

  it('temEscalaDefinida distingue cadastro vazio de preenchido', () => {
    expect(
      temEscalaDefinida({
        entradaSemana: null,
        saidaSemana: null,
        entradaFds: null,
        saidaFds: null,
        folgaDiaSemana: null,
      }),
    ).toBe(false);
    expect(temEscalaDefinida({ ...base })).toBe(true);
  });
});
