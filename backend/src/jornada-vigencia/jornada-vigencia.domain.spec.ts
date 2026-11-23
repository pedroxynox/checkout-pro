import fc from 'fast-check';
import {
  GrupoDomingo,
  ehDiaDeFolga,
  entradaEsperadaNoDia,
  saidaEsperadaNoDia,
} from '../escala-domingo/escala-domingo.domain';
import {
  REGRAS_PADRAO,
  RegrasContrato,
  cargaBaseDoDia,
  diaPagaAdicional100,
} from '../ponto/ponto.domain';
import {
  ContextoDoDia,
  FichaLegada,
  HorarioDoDia,
  JornadaDaPessoa,
  VigenciaJornada,
  avisosDaVigencia,
  previstoNoDia,
  textoDuracao,
  disponibilidadePreenchida,
  motivoDaFolga,
  validarVigencia,
  vigenciaNoDia,
} from './jornada-vigencia.domain';

const CONTRATO_6X1 = 'contrato-6x1';
const CONTRATO_5X2 = 'contrato-5x2';

/** 5x2 de 44h: 8h48 todos os dias, 100% domingo, intervalo 1h–2h50, TAC 1h10. */
const REGRAS_5X2: RegrasContrato = {
  cargaBaseMs: () => 528 * 60_000,
  cargaFeriadoMs: 528 * 60_000,
  temAdicional100: (d) => d === 0,
  maxTrabalhoSemIntervaloMs: 290 * 60_000,
  intervaloMinimoMs: 60 * 60_000,
  intervaloMaximoMs: 170 * 60_000,
  limiteExtrasMs: 70 * 60_000,
  riscoTac1h30Ms: 50 * 60_000,
  riscoTac1h40Ms: 60 * 60_000,
  intervaloMinimoEntreBatidasMs: 2 * 60_000,
  intervaloObrigatorio: true,
  feriadoAdicional100: true,
  limiteTrabalhoDiaMs: 600 * 60_000,
  folgasPorSemana: 2,
  folgasFixasPadrao: [],
  permiteFolgaSabado: false,
};

const regras = (id: string): RegrasContrato =>
  id === CONTRATO_5X2 ? REGRAS_5X2 : REGRAS_PADRAO;

const dia = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

function ctx(extra: Partial<ContextoDoDia> = {}): ContextoDoDia {
  return {
    regras,
    ehFeriado: false,
    ancoraDomingo: null,
    folgaNaEscalaSemanal: false,
    ...extra,
  };
}

const FICHA_6X1: FichaLegada = {
  tipoContratoJornadaId: CONTRATO_6X1,
  folgaDiaSemana: 3, // quarta
  grupoDomingo: 'G1',
  entradaSemana: '06:50',
  saidaSemana: '15:50',
  entradaFds: '06:50',
  saidaFds: '16:50',
  entradaDom: '07:00',
  saidaDom: '16:20',
};

function disponibilidade(
  horarios: Record<number, [string, string]>,
): ReadonlyMap<number, HorarioDoDia> {
  return new Map(
    Object.entries(horarios).map(([d, [entrada, saida]]) => [
      Number(d),
      { entrada, saida },
    ]),
  );
}

/** Seg a Dom 06:00–16:48 (8h48 + 2h de intervalo). */
const TODOS_OS_DIAS = disponibilidade({
  0: ['06:00', '16:48'],
  1: ['06:00', '16:48'],
  2: ['06:00', '16:48'],
  3: ['06:00', '16:48'],
  4: ['06:00', '16:48'],
  5: ['06:00', '16:48'],
  6: ['06:00', '16:48'],
});

function vigencia5x2(extra: Partial<VigenciaJornada> = {}): VigenciaJornada {
  return {
    id: 'vig-5x2',
    vigenteDesde: dia('2026-11-23'),
    tipoContratoJornadaId: CONTRATO_5X2,
    grupo: null,
    folgasFixas: [6, 0],
    disponibilidade: TODOS_OS_DIAS,
    ...extra,
  };
}

describe('vigenciaNoDia', () => {
  const a = vigencia5x2({ id: 'a', vigenteDesde: dia('2026-11-23') });
  const b = vigencia5x2({ id: 'b', vigenteDesde: dia('2026-12-16') });

  it('antes da primeira vigência não há vigência (regime legado)', () => {
    expect(vigenciaNoDia([a, b], dia('2026-11-22'))).toBeNull();
  });

  it('escolhe a de maior início que não passa do dia, em qualquer ordem', () => {
    expect(vigenciaNoDia([b, a], dia('2026-11-23'))?.id).toBe('a');
    expect(vigenciaNoDia([b, a], dia('2026-12-15'))?.id).toBe('a');
    expect(vigenciaNoDia([b, a], dia('2026-12-16'))?.id).toBe('b');
    expect(vigenciaNoDia([a, b], dia('2027-03-01'))?.id).toBe('b');
  });

  it('a hora do dia não importa', () => {
    expect(vigenciaNoDia([a], new Date('2026-11-23T23:59:00.000Z'))?.id).toBe(
      'a',
    );
    expect(
      vigenciaNoDia(
        [
          vigencia5x2({
            id: 'c',
            vigenteDesde: new Date('2026-11-23T15:00:00Z'),
          }),
        ],
        dia('2026-11-23'),
      )?.id,
    ).toBe('c');
  });
});

/**
 * Regressão do regime legado (RT.2): sem vigência que cubra o dia, a jornada
 * prevista é a de antes — a mesma regra de folga do `FolgaService` (transcrita
 * aqui de propósito, para o teste sobreviver a refatorações dele) e as mesmas
 * funções de horário, carga e adicional.
 */
describe('previstoNoDia — regime legado é o comportamento de hoje', () => {
  const horario = fc.option(
    fc
      .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
      .map(
        ([h, m]) =>
          `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      ),
    { nil: null },
  );
  const ficha: fc.Arbitrary<FichaLegada> = fc.record({
    tipoContratoJornadaId: fc.constantFrom(CONTRATO_6X1, CONTRATO_5X2),
    folgaDiaSemana: fc.option(fc.integer({ min: 0, max: 6 }), { nil: null }),
    grupoDomingo: fc.constantFrom<string | null>(null, 'G1', 'G2', 'G3', 'X'),
    entradaSemana: horario,
    saidaSemana: horario,
    entradaFds: horario,
    saidaFds: horario,
    entradaDom: horario,
    saidaDom: horario,
  });
  const umDia = fc
    .integer({ min: 0, max: 800 })
    .map((n) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000));
  const ordens: GrupoDomingo[][] = [
    ['G1', 'G2', 'G3'],
    ['G3', 'G2', 'G1'],
    ['G2', 'G1', 'G3'],
  ];
  const ancora = fc.option(
    fc.record({
      data: fc
        .integer({ min: 0, max: 80 })
        .map((s) => new Date(Date.UTC(2026, 0, 4) + s * 7 * 86_400_000)),
      ordem: fc.constantFrom(...ordens),
    }),
    { nil: null },
  );
  /** Vigências que começam DEPOIS do dia — não podem mudar nada. */
  const futuras = (d: Date) =>
    fc.array(
      fc.integer({ min: 1, max: 400 }).map((n) =>
        vigencia5x2({
          id: `fut-${n}`,
          vigenteDesde: new Date(d.getTime() + n * 86_400_000),
        }),
      ),
      { maxLength: 3 },
    );

  /** `FolgaService.consultor().ehFolga`, transcrito. */
  function folgaDeHoje(
    f: FichaLegada,
    d: Date,
    a: { data: Date; ordem: readonly GrupoDomingo[] } | null,
    escalaSemanal: boolean,
  ): boolean {
    if (f.folgaDiaSemana != null) return ehDiaDeFolga(f, d, a);
    if (escalaSemanal) return true;
    return ehDiaDeFolga(f, d, a);
  }

  it('folga, horário, carga e 100% iguais aos de hoje', () => {
    fc.assert(
      fc.property(
        ficha,
        umDia.chain((d) => fc.tuple(fc.constant(d), futuras(d))),
        ancora,
        fc.boolean(),
        fc.boolean(),
        (f, [d, vigs], a, ehFeriado, escalaSemanal) => {
          const pessoa: JornadaDaPessoa = {
            colaboradorId: 'c1',
            legado: f,
            vigencias: vigs,
          };
          const p = previstoNoDia(
            pessoa,
            d,
            ctx({
              ancoraDomingo: a,
              ehFeriado,
              folgaNaEscalaSemanal: escalaSemanal,
            }),
          );
          const r = regras(f.tipoContratoJornadaId);
          expect(p.regime).toBe('LEGADO_6X1');
          expect(p.vigenciaId).toBeNull();
          expect(p.tipoContratoJornadaId).toBe(f.tipoContratoJornadaId);
          expect(p.regras).toBe(r);
          expect(p.folga).toBe(folgaDeHoje(f, d, a, escalaSemanal));
          expect(p.entrada).toBe(entradaEsperadaNoDia(f, d, a, ehFeriado));
          expect(p.saida).toBe(saidaEsperadaNoDia(f, d, a, ehFeriado));
          expect(p.cargaMs).toBe(cargaBaseDoDia(d.getUTCDay(), ehFeriado, r));
          expect(p.contaComo100).toBe(
            diaPagaAdicional100(d.getUTCDay(), ehFeriado, r),
          );
          expect(p.geraDebito).toBe(!p.contaComo100);
          expect(p.escalado).toBe(!p.folga && p.entrada != null);
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe('previstoNoDia — regime semanal', () => {
  const pessoa = (v: VigenciaJornada): JornadaDaPessoa => ({
    colaboradorId: 'c1',
    legado: FICHA_6X1,
    vigencias: [v],
  });

  it('o corte de 23/11: até 22/11 no 6x1, a partir de 23/11 no contrato novo', () => {
    const p = pessoa(vigencia5x2());
    const antes = previstoNoDia(p, dia('2026-11-22'), ctx());
    const depois = previstoNoDia(p, dia('2026-11-23'), ctx());
    expect(antes.regime).toBe('LEGADO_6X1');
    expect(antes.regras).toBe(REGRAS_PADRAO);
    expect(depois.regime).toBe('SEMANAL');
    expect(depois.vigenciaId).toBe('vig-5x2');
    expect(depois.regras).toBe(REGRAS_5X2);
    expect(depois.cargaMs).toBe(528 * 60_000);
  });

  it('sem grupo: folga nas folgas fixas e horário da disponibilidade no resto', () => {
    const p = pessoa(vigencia5x2({ folgasFixas: [6, 0] }));
    const sabado = previstoNoDia(p, dia('2026-11-28'), ctx());
    const segunda = previstoNoDia(p, dia('2026-11-23'), ctx());
    expect(sabado).toMatchObject({
      folga: true,
      entrada: null,
      escalado: false,
    });
    expect(segunda).toMatchObject({
      folga: false,
      entrada: '06:00',
      saida: '16:48',
      escalado: true,
    });
  });

  it('folgas fixas vazias usam o padrão do contrato', () => {
    const p = pessoa(vigencia5x2({ folgasFixas: [] }));
    const comPadrao = { ...REGRAS_5X2, folgasFixasPadrao: [1, 2] };
    const c = ctx({ regras: () => comPadrao });
    expect(previstoNoDia(p, dia('2026-11-23'), c).folga).toBe(true); // segunda
    expect(previstoNoDia(p, dia('2026-11-25'), c).folga).toBe(false); // quarta
  });

  it('a ficha legada não interfere: a folga antiga (quarta) é dia de trabalho', () => {
    const p = pessoa(vigencia5x2({ folgasFixas: [6, 0] }));
    const quarta = previstoNoDia(p, dia('2026-11-25'), ctx());
    expect(quarta).toMatchObject({ folga: false, entrada: '06:00' });
  });

  it('a escala semanal legada (EscalaEntry) não interfere', () => {
    const p = pessoa(vigencia5x2({ folgasFixas: [6, 0] }));
    const c = ctx({ folgaNaEscalaSemanal: true });
    expect(previstoNoDia(p, dia('2026-11-23'), c).folga).toBe(false);
  });

  it('grupo sem rodízio vigente: não afirma folga nem turno', () => {
    const p = pessoa(vigencia5x2({ grupo: 'G1', folgasFixas: [] }));
    const r = previstoNoDia(p, dia('2026-11-26'), ctx());
    expect(r).toMatchObject({ folga: false, entrada: null, escalado: false });
  });

  it('grupo com rodízio: folga nos dias do grupo na semana', () => {
    const p = pessoa(vigencia5x2({ grupo: 'G1', folgasFixas: [] }));
    const c = ctx({ folgasDoGrupo: (g) => (g === 'G1' ? [4, 5] : []) });
    expect(previstoNoDia(p, dia('2026-11-26'), c).folga).toBe(true); // quinta
    expect(previstoNoDia(p, dia('2026-11-28'), c)).toMatchObject({
      folga: false, // sábado
      entrada: '06:00',
    });
  });

  it('feriado: horário do próprio dia, carga e 100% do contrato, sem débito', () => {
    const p = pessoa(vigencia5x2({ folgasFixas: [6, 0] }));
    const r = previstoNoDia(p, dia('2026-11-24'), ctx({ ehFeriado: true }));
    expect(r).toMatchObject({
      folga: false,
      entrada: '06:00',
      saida: '16:48',
      cargaMs: REGRAS_5X2.cargaFeriadoMs,
      contaComo100: true,
      geraDebito: false,
    });
  });

  it('domingo trabalhado: 100% e sem débito', () => {
    const p = pessoa(vigencia5x2({ folgasFixas: [2, 3] }));
    const r = previstoNoDia(p, dia('2026-11-29'), ctx());
    expect(r).toMatchObject({
      escalado: true,
      contaComo100: true,
      geraDebito: false,
    });
  });

  it('dia sem disponibilidade: escalado não, mas também não é folga', () => {
    const p = pessoa(
      vigencia5x2({
        folgasFixas: [6, 0],
        disponibilidade: disponibilidade({ 1: ['06:00', '16:48'] }),
      }),
    );
    const terca = previstoNoDia(p, dia('2026-11-24'), ctx());
    expect(terca).toMatchObject({
      folga: false,
      entrada: null,
      escalado: false,
    });
  });
});

describe('avisosDaVigencia (tolerância pelo intervalo do contrato)', () => {
  const tipos = (v: Partial<VigenciaJornada>) =>
    avisosDaVigencia({ ...vigencia5x2(), ...v }, REGRAS_5X2).map((a) => [
      a.tipo,
      a.diaSemana,
    ]);

  it('2h, 1h30 e 1h de intervalo cabem no contrato (1h–2h50)', () => {
    for (const saida of ['16:48', '16:18', '15:48']) {
      const d: Record<number, [string, string]> = {};
      for (let i = 0; i < 7; i++) d[i] = ['06:00', saida];
      expect(tipos({ disponibilidade: disponibilidade(d) })).toEqual([]);
    }
  });

  it('intervalo abaixo do mínimo ou acima do máximo avisa, com os números', () => {
    const avisos = avisosDaVigencia(
      vigencia5x2({
        folgasFixas: [6, 0],
        disponibilidade: disponibilidade({
          1: ['06:00', '15:18'], // 30 min de intervalo
          2: ['06:00', '18:00'], // 3h12
          3: ['06:00', '16:48'],
          4: ['06:00', '16:48'],
          5: ['06:00', '16:48'],
        }),
      }),
      REGRAS_5X2,
    );
    expect(avisos.map((a) => [a.tipo, a.diaSemana])).toEqual([
      ['DISPONIBILIDADE_FORA_DA_CARGA', 1],
      ['DISPONIBILIDADE_FORA_DA_CARGA', 2],
    ]);
    expect(avisos[0].mensagem).toBe(
      'Na segunda, 06:00–15:18 deixa 30 min de intervalo para a carga de 8h48; o contrato aceita de 1h a 2h50.',
    );
  });

  it('dia que pode ser de trabalho sem horário avisa; folga fixa não', () => {
    expect(
      tipos({
        folgasFixas: [6, 0],
        disponibilidade: disponibilidade({
          1: ['06:00', '16:48'],
          2: ['06:00', '16:48'],
          3: ['06:00', '16:48'],
          4: ['06:00', '16:48'],
        }),
      }),
    ).toEqual([['DIA_SEM_HORARIO', 5]]);
  });

  it('com grupo, os sete dias precisam de horário (o rodízio gira)', () => {
    expect(
      tipos({
        grupo: 'G2',
        folgasFixas: [],
        disponibilidade: disponibilidade({ 1: ['06:00', '16:48'] }),
      }),
    ).toEqual([
      ['DIA_SEM_HORARIO', 2],
      ['DIA_SEM_HORARIO', 3],
      ['DIA_SEM_HORARIO', 4],
      ['DIA_SEM_HORARIO', 5],
      ['DIA_SEM_HORARIO', 6],
      ['DIA_SEM_HORARIO', 0],
    ]);
  });

  it('sem grupo e sem folga (nem padrão do contrato) avisa', () => {
    expect(tipos({ folgasFixas: [] })[0]).toEqual(['SEM_FOLGA', null]);
    expect(
      avisosDaVigencia(vigencia5x2({ folgasFixas: [] }), {
        ...REGRAS_5X2,
        folgasFixasPadrao: [6, 0],
      }),
    ).toEqual([]);
  });

  it('jornada curta sem intervalo é aceita se o contrato não exige intervalo', () => {
    const seisHoras: RegrasContrato = {
      ...REGRAS_5X2,
      cargaBaseMs: () => 240 * 60_000,
      intervaloObrigatorio: false,
    };
    const d: Record<number, [string, string]> = {};
    for (let i = 1; i <= 5; i++) d[i] = ['08:00', '12:00'];
    expect(
      avisosDaVigencia(
        vigencia5x2({
          folgasFixas: [6, 0],
          disponibilidade: disponibilidade(d),
        }),
        seisHoras,
      ),
    ).toEqual([]);
    expect(
      avisosDaVigencia(
        vigencia5x2({
          folgasFixas: [6, 0],
          disponibilidade: disponibilidade(d),
        }),
        { ...seisHoras, intervaloObrigatorio: true },
      ),
    ).toHaveLength(5);
  });
});

describe('validarVigencia', () => {
  const limites = { maxFolgasFixas: 2, permiteFolgaSabado: false };
  const valida = {
    grupo: null,
    folgasFixas: [0, 1],
    disponibilidade: [{ diaSemana: 2, entrada: '06:00', saida: '16:48' }],
  };

  it('aceita uma vigência correta', () => {
    expect(validarVigencia(valida, limites)).toEqual([]);
    expect(
      validarVigencia({ ...valida, grupo: 'G3', folgasFixas: [] }, limites),
    ).toEqual([]);
  });

  it.each([
    [{ grupo: 'G4' }, 'Grupo deve ser G1, G2 ou G3.'],
    [
      { grupo: 'G1' },
      'Quem tem grupo folga pelo rodízio; não informe folgas fixas.',
    ],
    [
      { folgasFixas: [0, 1, 2] },
      'No máximo 2 folga(s) fixa(s) por semana neste contrato.',
    ],
    [{ folgasFixas: [6] }, 'Este contrato não permite folga no sábado.'],
    [{ folgasFixas: [1, 1] }, 'Folga fixa repetida: segunda.'],
    [{ folgasFixas: [7] }, 'Folga fixa inválida: 7.'],
    [
      { disponibilidade: [{ diaSemana: 1, entrada: '6:00', saida: '15:00' }] },
      'Na segunda, entrada e saída devem ser HH:mm.',
    ],
    [
      { disponibilidade: [{ diaSemana: 1, entrada: '15:00', saida: '06:00' }] },
      'Na segunda, a saída deve ser depois da entrada.',
    ],
    [
      {
        disponibilidade: [
          { diaSemana: 1, entrada: '06:00', saida: '15:00' },
          { diaSemana: 1, entrada: '07:00', saida: '16:00' },
        ],
      },
      'Horário repetido na segunda.',
    ],
    [
      { disponibilidade: [{ diaSemana: 1, entrada: '06:00', saida: '' }] },
      'Na segunda, informe entrada e saída (ou deixe as duas vazias).',
    ],
    [
      { disponibilidade: [{ diaSemana: 3, entrada: null, saida: '15:00' }] },
      'Na quarta, informe entrada e saída (ou deixe as duas vazias).',
    ],
  ])('recusa %j', (mudanca, erro) => {
    expect(validarVigencia({ ...valida, ...mudanca }, limites)).toContain(erro);
  });

  it('sábado é aceito quando o contrato permite', () => {
    expect(
      validarVigencia(
        { ...valida, folgasFixas: [6, 0] },
        { maxFolgasFixas: 2, permiteFolgaSabado: true },
      ),
    ).toEqual([]);
  });

  it('dia com entrada e saída vazias é "sem horário", não erro', () => {
    const linhas = [
      { diaSemana: 1, entrada: ' 06:00 ', saida: '15:48' },
      { diaSemana: 2, entrada: '', saida: '' },
      { diaSemana: 3, entrada: null, saida: undefined },
    ];
    expect(
      validarVigencia({ ...valida, disponibilidade: linhas }, limites),
    ).toEqual([]);
    expect(disponibilidadePreenchida(linhas)).toEqual([
      { diaSemana: 1, entrada: '06:00', saida: '15:48' },
    ]);
  });
});

describe('textoDuracao', () => {
  it.each([
    [528, '8h48'],
    [120, '2h'],
    [50, '50 min'],
    [0, '0 min'],
    [-30, '-30 min'],
    [170, '2h50'],
  ])('%p min → %p', (min, texto) => {
    expect(textoDuracao(min)).toBe(texto);
  });
});

describe('motivoDaFolga', () => {
  it('só no regime semanal e só na folga: grupo ou folga fixa', () => {
    expect(motivoDaFolga({ regime: 'SEMANAL', folga: true, grupo: 'G2' })).toBe(
      'GRUPO',
    );
    expect(motivoDaFolga({ regime: 'SEMANAL', folga: true, grupo: null })).toBe(
      'FOLGA_FIXA',
    );
    expect(
      motivoDaFolga({ regime: 'SEMANAL', folga: false, grupo: 'G2' }),
    ).toBeNull();
    expect(
      motivoDaFolga({ regime: 'LEGADO_6X1', folga: true, grupo: 'G1' }),
    ).toBeNull();
    expect(motivoDaFolga(null)).toBeNull();
  });
});
