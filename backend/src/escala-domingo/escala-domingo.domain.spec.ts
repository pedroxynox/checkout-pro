import {
  GrupoDomingo,
  ehDiaDeFolga,
  ehDomingo,
  ehGrupoValido,
  entradaEsperadaNoDia,
  grupoFolgaNoDomingo,
  minutosDeAtraso,
  ordemValida,
  proximoDomingo,
  proximosDomingos,
  trabalhaNoDomingo,
} from './escala-domingo.domain';

// Domingos de referência (todos são domingo em UTC).
const DOM1 = new Date('2026-07-19T00:00:00.000Z'); // domingo
const DOM2 = new Date('2026-07-26T00:00:00.000Z');
const DOM3 = new Date('2026-08-02T00:00:00.000Z');
const DOM4 = new Date('2026-08-09T00:00:00.000Z');

// Ordem real do usuário: 19/07 folga S1, 26/07 folga S3, 02/08 folga S2.
const ORDEM: GrupoDomingo[] = ['G1', 'G3', 'G2'];

describe('rodízio de domingo', () => {
  it('reconhece domingo e grupos válidos', () => {
    expect(ehDomingo(DOM1)).toBe(true);
    expect(ehDomingo(new Date('2026-07-20T00:00:00.000Z'))).toBe(false); // segunda
    expect(ehGrupoValido('G1')).toBe(true);
    expect(ehGrupoValido('G4')).toBe(false);
    expect(ehGrupoValido(null)).toBe(false);
  });

  it('valida a ordem do ciclo (permutação dos 3 grupos)', () => {
    expect(ordemValida(['G1', 'G3', 'G2'])).toBe(true);
    expect(ordemValida(['G1', 'G2', 'G3'])).toBe(true);
    expect(ordemValida(['G1', 'G1', 'G2'])).toBe(false); // repetido
    expect(ordemValida(['G1', 'G2'])).toBe(false); // faltando
    expect(ordemValida(null)).toBe(false);
  });

  it('segue exatamente a ordem informada e repete a cada 3 domingos', () => {
    expect(grupoFolgaNoDomingo(DOM1, DOM1, ORDEM)).toBe('G1');
    expect(grupoFolgaNoDomingo(DOM2, DOM1, ORDEM)).toBe('G3');
    expect(grupoFolgaNoDomingo(DOM3, DOM1, ORDEM)).toBe('G2');
    expect(grupoFolgaNoDomingo(DOM4, DOM1, ORDEM)).toBe('G1'); // repete o ciclo
  });

  it('funciona para domingos anteriores à referência', () => {
    // Domingo antes de DOM1 (12/07) deve ser o 3º do ciclo anterior → G2.
    const anterior = new Date('2026-07-12T00:00:00.000Z');
    expect(grupoFolgaNoDomingo(anterior, DOM1, ORDEM)).toBe('G2');
  });

  it('trabalha no domingo quando o grupo NÃO é o que folga', () => {
    // DOM2 folga G3 → G1 e G2 trabalham; G3 folga.
    expect(trabalhaNoDomingo('G3', DOM2, DOM1, ORDEM)).toBe(false);
    expect(trabalhaNoDomingo('G1', DOM2, DOM1, ORDEM)).toBe(true);
    expect(trabalhaNoDomingo('G2', DOM2, DOM1, ORDEM)).toBe(true);
  });

  it('sem grupo (fora do rodízio) nunca trabalha aos domingos', () => {
    expect(trabalhaNoDomingo(null, DOM2, DOM1, ORDEM)).toBe(false);
    expect(trabalhaNoDomingo(undefined, DOM2, DOM1, ORDEM)).toBe(false);
    expect(trabalhaNoDomingo('', DOM2, DOM1, ORDEM)).toBe(false);
  });

  it('cada grupo folga 1 domingo e trabalha 2 num ciclo de 3', () => {
    const domingos = [DOM1, DOM2, DOM3];
    for (const g of ['G1', 'G2', 'G3'] as const) {
      const folgas = domingos.filter(
        (d) => !trabalhaNoDomingo(g, d, DOM1, ORDEM),
      ).length;
      expect(folgas).toBe(1);
    }
  });

  it('calcula o próximo domingo e a sequência', () => {
    const qua = new Date('2026-07-22T00:00:00.000Z'); // quarta
    expect(proximoDomingo(qua).toISOString().slice(0, 10)).toBe('2026-07-26');
    expect(proximoDomingo(DOM1).toISOString().slice(0, 10)).toBe('2026-07-19');

    const seq = proximosDomingos(DOM1, 3).map((d) =>
      d.toISOString().slice(0, 10),
    );
    expect(seq).toEqual(['2026-07-19', '2026-07-26', '2026-08-02']);
  });
});

describe('ehDiaDeFolga', () => {
  const ancora = { data: DOM1, ordem: ORDEM };
  // 20/07/2026 é segunda; 24/07 é sexta.
  const SEGUNDA = new Date('2026-07-20T00:00:00.000Z');
  const SEXTA = new Date('2026-07-24T00:00:00.000Z');

  it('dia de semana: folga fixa do cadastro', () => {
    // folgaDiaSemana 1 = segunda.
    expect(
      ehDiaDeFolga({ folgaDiaSemana: 1, grupoDomingo: null }, SEGUNDA, ancora),
    ).toBe(true);
    expect(
      ehDiaDeFolga({ folgaDiaSemana: 1, grupoDomingo: null }, SEXTA, ancora),
    ).toBe(false);
  });

  it('sem folga fixa definida, dia de semana não é folga', () => {
    expect(
      ehDiaDeFolga(
        { folgaDiaSemana: null, grupoDomingo: null },
        SEGUNDA,
        ancora,
      ),
    ).toBe(false);
  });

  it('domingo sem grupo (fora do rodízio) é sempre folga', () => {
    expect(
      ehDiaDeFolga({ folgaDiaSemana: 3, grupoDomingo: null }, DOM1, ancora),
    ).toBe(true);
  });

  it('domingo com grupo segue o rodízio', () => {
    // DOM1 folga G1 → G1 é folga; G2/G3 trabalham.
    expect(
      ehDiaDeFolga({ folgaDiaSemana: 3, grupoDomingo: 'G1' }, DOM1, ancora),
    ).toBe(true);
    expect(
      ehDiaDeFolga({ folgaDiaSemana: 3, grupoDomingo: 'G2' }, DOM1, ancora),
    ).toBe(false);
  });

  it('domingo com grupo mas sem âncora não afirma folga (não bloqueia)', () => {
    expect(
      ehDiaDeFolga({ folgaDiaSemana: 3, grupoDomingo: 'G1' }, DOM1, null),
    ).toBe(false);
  });

  it('folga fixa no domingo (folgaDiaSemana=0) prevalece sobre o rodízio', () => {
    // DOM1 o grupo G2 trabalha (folga G1), mas a folga fixa de domingo vence.
    expect(
      ehDiaDeFolga({ folgaDiaSemana: 0, grupoDomingo: 'G2' }, DOM1, ancora),
    ).toBe(true);
  });
});

describe('entradaEsperadaNoDia', () => {
  const ancora = { data: DOM1, ordem: ORDEM };
  const ficha = {
    folgaDiaSemana: 1, // segunda
    grupoDomingo: 'G2',
    entradaSemana: '07:00',
    entradaFds: '08:00',
    entradaDom: '09:00',
  };
  const SEGUNDA = new Date('2026-07-20T00:00:00.000Z');
  const TERCA = new Date('2026-07-21T00:00:00.000Z');
  const SEXTA = new Date('2026-07-24T00:00:00.000Z');

  it('seg–qui usa o horário de semana', () => {
    expect(entradaEsperadaNoDia(ficha, TERCA, ancora)).toBe('07:00');
  });

  it('sex–sáb usa o horário de fim de semana', () => {
    expect(entradaEsperadaNoDia(ficha, SEXTA, ancora)).toBe('08:00');
  });

  it('domingo trabalhado pelo rodízio usa o horário de domingo', () => {
    // DOM1 folga G1; G2 trabalha → entrada de domingo.
    expect(entradaEsperadaNoDia(ficha, DOM1, ancora)).toBe('09:00');
  });

  it('dia de folga não tem turno esperado', () => {
    expect(entradaEsperadaNoDia(ficha, SEGUNDA, ancora)).toBeNull();
  });

  it('domingo de folga do grupo não tem turno esperado', () => {
    const g1 = { ...ficha, grupoDomingo: 'G1' };
    expect(entradaEsperadaNoDia(g1, DOM1, ancora)).toBeNull();
  });

  it('domingo com grupo mas SEM âncora não afirma turno (evita atraso falso)', () => {
    expect(entradaEsperadaNoDia(ficha, DOM1, null)).toBeNull();
  });
});

describe('minutosDeAtraso', () => {
  const H = (hhmm: string): Date => new Date(`2026-07-21T${hhmm}:00Z`);

  it('sem turno esperado, não há atraso', () => {
    expect(minutosDeAtraso(null, H('09:00'))).toBeNull();
  });

  it('dentro da tolerância não conta como atraso', () => {
    expect(minutosDeAtraso('07:00', H('07:15'))).toBeNull(); // 15 = tolerância
  });

  it('além da tolerância devolve os minutos de atraso', () => {
    expect(minutosDeAtraso('07:00', H('07:40'))).toBe(40);
  });

  it('chegar antes do horário nunca é atraso', () => {
    expect(minutosDeAtraso('07:00', H('06:45'))).toBeNull();
  });
});
