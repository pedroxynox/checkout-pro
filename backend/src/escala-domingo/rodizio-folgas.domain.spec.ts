import fc from 'fast-check';
import {
  GRUPOS_DOMINGO,
  GrupoDomingo,
  grupoFolgaNoDomingo,
} from './escala-domingo.domain';
import {
  INICIO_RODIZIO_5X2,
  PADRAO_RODIZIO_5X2,
  RodizioFolgas,
  avisosDoRodizio,
  folgasDoGrupoNaSemana,
  gruposDeFolgaNoDia,
  padraoDe,
  previaDoRodizio,
  rodizioDaLinha,
  rodizioNoDia,
  segundaDaSemana,
  semanaDoCiclo,
  validarRodizio,
} from './rodizio-folgas.domain';

/**
 * Rodízio de folgas do 5x2 (spec `jornada-5x2`, Fase 3, decisões 4–6). O teste
 * central confere a tabela do dono dia a dia de 23/11/2026 a 03/01/2027 (dois
 * ciclos de 3 semanas) e as garantias que ela dá: um grupo de folga por dia,
 * nenhum no sábado, no máximo 5 dias seguidos e 2 domingos seguidos.
 */

const dia = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const iso = (d: Date): string => d.toISOString().slice(0, 10);
const UM_DIA = 24 * 60 * 60 * 1000;

const RODIZIO: RodizioFolgas = {
  id: 'r1',
  vigenteDesde: INICIO_RODIZIO_5X2,
  semanasNoCiclo: 3,
  padrao: PADRAO_RODIZIO_5X2,
};

/** Rodízio antigo de domingo: G3 folgou 08/11, G2 15/11 e G1 22/11. */
const ANCORA_ANTIGA = {
  data: dia('2026-11-08'),
  ordem: ['G3', 'G2', 'G1'] as GrupoDomingo[],
};
const domingoAntigo = (d: Date) =>
  grupoFolgaNoDomingo(d, ANCORA_ANTIGA.data, ANCORA_ANTIGA.ordem);

/** Os dias de 23/11/2026 a 03/01/2027. */
const DIAS = Array.from(
  { length: 42 },
  (_, i) => new Date(INICIO_RODIZIO_5X2.getTime() + i * UM_DIA),
);

describe('segundaDaSemana / semanaDoCiclo', () => {
  it('a semana vai de segunda a domingo', () => {
    expect(iso(segundaDaSemana(dia('2026-11-23')))).toBe('2026-11-23');
    expect(iso(segundaDaSemana(dia('2026-11-29')))).toBe('2026-11-23'); // domingo
    expect(iso(segundaDaSemana(dia('2026-11-30')))).toBe('2026-11-30');
    expect(iso(segundaDaSemana(new Date('2026-11-25T23:59:00Z')))).toBe(
      '2026-11-23',
    );
  });

  it('semana 1 em 23/11, 2 em 30/11, 3 em 07/12 e de novo 1 em 14/12', () => {
    expect(semanaDoCiclo(RODIZIO, dia('2026-11-23'))).toBe(0);
    expect(semanaDoCiclo(RODIZIO, dia('2026-11-29'))).toBe(0);
    expect(semanaDoCiclo(RODIZIO, dia('2026-11-30'))).toBe(1);
    expect(semanaDoCiclo(RODIZIO, dia('2026-12-07'))).toBe(2);
    expect(semanaDoCiclo(RODIZIO, dia('2026-12-14'))).toBe(0);
  });
});

describe('rodízio da decisão 5, dia a dia (23/11/2026 a 03/01/2027)', () => {
  /** Quem folga em cada dia, como o dono escreveu (semana 1, 2 e 3). */
  const ESPERADO: Record<number, Record<number, GrupoDomingo | null>> = {
    // dia da semana → grupo que folga
    0: { 1: 'G3', 2: 'G2', 3: 'G2', 4: 'G1', 5: 'G1', 6: null, 0: 'G3' },
    1: { 1: 'G2', 2: 'G1', 3: 'G1', 4: 'G3', 5: 'G3', 6: null, 0: 'G2' },
    2: { 1: 'G1', 2: 'G3', 3: 'G3', 4: 'G2', 5: 'G2', 6: null, 0: 'G1' },
  };

  it('cada dia tem exatamente o grupo da tabela, e o sábado nenhum', () => {
    for (const d of DIAS) {
      const semana = semanaDoCiclo(RODIZIO, d);
      const esperado = ESPERADO[semana][d.getUTCDay()];
      expect([iso(d), gruposDeFolgaNoDia(RODIZIO, d)]).toEqual([
        iso(d),
        esperado ? [esperado] : [],
      ]);
    }
  });

  it('as folgas do G1 nas três primeiras semanas', () => {
    const doG1 = DIAS.slice(0, 21)
      .filter((d) =>
        folgasDoGrupoNaSemana(RODIZIO, 'G1', d).includes(d.getUTCDay()),
      )
      .map(iso);
    expect(doG1).toEqual([
      '2026-11-26', // qui
      '2026-11-27', // sex
      '2026-12-01', // ter
      '2026-12-02', // qua
      '2026-12-07', // seg
      '2026-12-13', // dom
    ]);
  });

  it('domingos: G3 folga 29/11, G2 06/12 e G1 13/12, continuando o rodízio antigo', () => {
    const domingos = DIAS.filter((d) => d.getUTCDay() === 0);
    expect(
      domingos.map((d) => [iso(d), gruposDeFolgaNoDia(RODIZIO, d)[0]]),
    ).toEqual([
      ['2026-11-29', 'G3'],
      ['2026-12-06', 'G2'],
      ['2026-12-13', 'G1'],
      ['2026-12-20', 'G3'],
      ['2026-12-27', 'G2'],
      ['2027-01-03', 'G1'],
    ]);
    // A sequência é a mesma do rodízio antigo: quem viria depois do G1 (22/11).
    expect(domingoAntigo(dia('2026-11-29'))).toBe('G3');
  });

  it('ninguém passa de 5 dias seguidos, nem de 2 domingos seguidos (com a passagem)', () => {
    for (const g of GRUPOS_DOMINGO) {
      // Da passagem: os 3 domingos antes de 23/11 pelo rodízio antigo.
      const antes = [dia('2026-11-08'), dia('2026-11-15'), dia('2026-11-22')];
      const domingos = [
        ...antes.map((d) => domingoAntigo(d) !== g),
        ...DIAS.filter((d) => d.getUTCDay() === 0).map(
          (d) => !gruposDeFolgaNoDia(RODIZIO, d).includes(g),
        ),
      ];
      let seguidos = 0;
      let maior = 0;
      for (const trabalha of domingos) {
        seguidos = trabalha ? seguidos + 1 : 0;
        maior = Math.max(maior, seguidos);
      }
      expect([g, maior]).toEqual([g, 2]);

      let dias = 0;
      let maiorDias = 0;
      for (const d of DIAS) {
        const folga = gruposDeFolgaNoDia(RODIZIO, d).includes(g);
        dias = folga ? 0 : dias + 1;
        maiorDias = Math.max(maiorDias, dias);
      }
      expect([g, maiorDias]).toEqual([g, 5]);
    }
  });

  it('a configuração inicial não tem avisos (nem na passagem do rodízio antigo)', () => {
    expect(avisosDoRodizio(RODIZIO, domingoAntigo)).toEqual([]);
  });
});

describe('rodizioNoDia', () => {
  const depois: RodizioFolgas = {
    ...RODIZIO,
    id: 'r2',
    vigenteDesde: dia('2027-01-04'),
  };

  it('antes da primeira vigência não há rodízio', () => {
    expect(rodizioNoDia([RODIZIO], dia('2026-11-22'))).toBeNull();
  });

  it('vale a de maior início que não seja posterior ao dia', () => {
    expect(rodizioNoDia([depois, RODIZIO], dia('2027-01-03'))?.id).toBe('r1');
    expect(rodizioNoDia([depois, RODIZIO], dia('2027-01-04'))?.id).toBe('r2');
  });

  it('uma vigência nova recomeça a semana 1 na data dela', () => {
    // 04/01/2027 seria a semana 1 de qualquer forma (6 semanas depois); numa
    // segunda que não fecha o ciclo, a vigência nova reinicia a contagem.
    const meio: RodizioFolgas = {
      ...RODIZIO,
      id: 'r3',
      vigenteDesde: dia('2026-12-07'),
    };
    expect(semanaDoCiclo(RODIZIO, dia('2026-12-07'))).toBe(2);
    expect(
      semanaDoCiclo(
        rodizioNoDia([RODIZIO, meio], dia('2026-12-07'))!,
        dia('2026-12-07'),
      ),
    ).toBe(0);
  });
});

describe('validarRodizio (R3.3)', () => {
  const valido = {
    vigenteDesde: INICIO_RODIZIO_5X2,
    semanasNoCiclo: 3,
    padrao: PADRAO_RODIZIO_5X2,
  };

  it('a configuração do dono é válida', () => {
    expect(validarRodizio(valido)).toEqual([]);
  });

  it('o início precisa ser uma segunda-feira', () => {
    expect(
      validarRodizio({ ...valido, vigenteDesde: dia('2026-11-22') }),
    ).toEqual(['O rodízio precisa começar numa segunda-feira.']);
  });

  it('cada grupo com 2 dias distintos por semana, nunca o sábado', () => {
    const erros = validarRodizio({
      ...valido,
      padrao: {
        G1: [
          [4, 6],
          [2, 3],
          [1, 0],
        ],
        G2: [
          [2, 2],
          [1, 0],
          [4, 5],
        ],
        G3: [[1], [4, 5], [2, 3]],
      },
    });
    expect(erros).toEqual([
      'G1, semana 1: ninguém de grupo folga no sábado.',
      'G2, semana 1: dia repetido.',
      'G3, semana 1: escolha exatamente 2 dias de folga.',
    ]);
  });

  it('uma lista por semana do ciclo, para os três grupos, e nada além deles', () => {
    expect(
      validarRodizio({
        ...valido,
        semanasNoCiclo: 2,
        padrao: {
          G1: [
            [1, 2],
            [3, 4],
          ],
          G2: [[3, 4]],
          G4: [],
        },
      }),
    ).toEqual([
      'Grupo inválido: G4.',
      'G2: informe as folgas das 2 semana(s) do ciclo.',
      'G3: informe as folgas das 2 semana(s) do ciclo.',
    ]);
    expect(validarRodizio({ ...valido, semanasNoCiclo: 0 })).toEqual([
      'O ciclo deve ter de 1 a 6 semanas.',
    ]);
    expect(validarRodizio({ ...valido, padrao: null })).toEqual([
      'Informe as folgas de G1, G2 e G3.',
    ]);
  });
});

describe('avisosDoRodizio (R3.4)', () => {
  it('dia sem grupo de folga e dia com dois grupos', () => {
    const avisos = avisosDoRodizio({
      vigenteDesde: INICIO_RODIZIO_5X2,
      semanasNoCiclo: 1,
      padrao: { G1: [[1, 2]], G2: [[1, 3]], G3: [[4, 5]] },
    });
    expect(avisos.map((a) => a.mensagem)).toEqual([
      'Semana 1: G1 e G2 folgam juntos na segunda.',
      'Semana 1: nenhum grupo folga no domingo.',
      'G1 não folga nenhum domingo no ciclo.',
      'G2 não folga nenhum domingo no ciclo.',
      'G3 não folga nenhum domingo no ciclo.',
    ]);
  });

  it('mais de 6 dias seguidos trabalhados', () => {
    // G1 folga seg+ter na semana 1 e qui+sex na semana 2: de quarta da semana 1
    // a quarta da semana 2 são 8 dias de trabalho.
    const avisos = avisosDoRodizio({
      vigenteDesde: INICIO_RODIZIO_5X2,
      semanasNoCiclo: 2,
      padrao: {
        G1: [
          [1, 2],
          [4, 5],
        ],
        G2: [
          [3, 4],
          [1, 2],
        ],
        G3: [
          [5, 0],
          [3, 0],
        ],
      },
    });
    expect(
      avisos.find((a) => a.tipo === 'DIAS_SEGUIDOS' && a.grupo === 'G1'),
    ).toMatchObject({
      mensagem: 'G1 trabalha 8 dias seguidos (o máximo é 6).',
    });
  });

  it('mais de 2 domingos seguidos na passagem do rodízio anterior', () => {
    // Um rodízio que começa com o G1 trabalhando 2 domingos, logo depois de o
    // G1 já ter trabalhado 1 no rodízio anterior (o antigo, no qual folgou 15/11
    // se a ordem fosse outra): 3 seguidos.
    const avisos = avisosDoRodizio(
      {
        vigenteDesde: INICIO_RODIZIO_5X2,
        semanasNoCiclo: 3,
        padrao: {
          G1: [
            [2, 3],
            [4, 5],
            [1, 0],
          ],
          G2: [
            [4, 5],
            [1, 0],
            [2, 3],
          ],
          G3: [
            [1, 0],
            [2, 3],
            [4, 5],
          ],
        },
      },
      (d) =>
        iso(d) === '2026-11-22' ? 'G2' : iso(d) === '2026-11-15' ? 'G1' : 'G3',
    );
    expect(avisos.filter((a) => a.tipo === 'DOMINGOS_SEGUIDOS')).toEqual([
      expect.objectContaining({
        grupo: 'G1',
        mensagem:
          'G1 trabalha 3 domingos seguidos na passagem do rodízio anterior para este (o máximo é 2).',
      }),
    ]);
  });
});

describe('previaDoRodizio (R3.5)', () => {
  it('semana de 16/11 pelo rodízio antigo (só o domingo) e a partir de 23/11 pelo novo', () => {
    const previa = previaDoRodizio(
      [RODIZIO],
      dia('2026-11-22'),
      2,
      domingoAntigo,
    );
    expect(previa[0]).toMatchObject({
      inicio: '2026-11-16',
      semanaDoCiclo: null,
    });
    expect(previa[0].dias.map((d) => [d.data, d.grupos, d.fonte])).toEqual([
      ['2026-11-16', [], null],
      ['2026-11-17', [], null],
      ['2026-11-18', [], null],
      ['2026-11-19', [], null],
      ['2026-11-20', [], null],
      ['2026-11-21', [], null],
      ['2026-11-22', ['G1'], 'DOMINGO_ANTIGO'],
    ]);
    expect(previa[1]).toMatchObject({ inicio: '2026-11-23', semanaDoCiclo: 1 });
    expect(previa[1].dias.map((d) => d.grupos)).toEqual([
      ['G3'],
      ['G2'],
      ['G2'],
      ['G1'],
      ['G1'],
      [],
      ['G3'],
    ]);
  });
});

describe('padraoDe / rodizioDaLinha', () => {
  it('lê o JSON do banco e recusa o que não é um padrão', () => {
    expect(padraoDe(PADRAO_RODIZIO_5X2)).toEqual(PADRAO_RODIZIO_5X2);
    expect(padraoDe({ G1: [[1, 2]] })).toBeNull();
    expect(padraoDe('x')).toBeNull();
    expect(
      rodizioDaLinha({
        id: 'a',
        vigenteDesde: INICIO_RODIZIO_5X2,
        semanasNoCiclo: 3,
        padrao: null,
      }),
    ).toBeNull();
  });
});

describe('propriedades (fast-check)', () => {
  /** Um padrão válido qualquer: 2 dias distintos de 0 a 5 por semana e grupo. */
  const doisDias = fc.uniqueArray(fc.constantFrom(0, 1, 2, 3, 4, 5), {
    minLength: 2,
    maxLength: 2,
  });
  const padraoValido = fc.integer({ min: 1, max: 6 }).chain((n) =>
    fc.record({
      n: fc.constant(n),
      G1: fc.array(doisDias, { minLength: n, maxLength: n }),
      G2: fc.array(doisDias, { minLength: n, maxLength: n }),
      G3: fc.array(doisDias, { minLength: n, maxLength: n }),
    }),
  );

  it('todo padrão desse formato é válido e nunca dá folga de grupo no sábado', () => {
    fc.assert(
      fc.property(padraoValido, fc.integer({ min: 0, max: 400 }), (p, k) => {
        const r: RodizioFolgas = {
          id: null,
          vigenteDesde: INICIO_RODIZIO_5X2,
          semanasNoCiclo: p.n,
          padrao: { G1: p.G1, G2: p.G2, G3: p.G3 },
        };
        expect(
          validarRodizio({
            vigenteDesde: r.vigenteDesde,
            semanasNoCiclo: p.n,
            padrao: r.padrao,
          }),
        ).toEqual([]);
        const d = new Date(INICIO_RODIZIO_5X2.getTime() + k * UM_DIA);
        if (d.getUTCDay() === 6) {
          expect(gruposDeFolgaNoDia(r, d)).toEqual([]);
        }
        // O ciclo se repete: o mesmo dia n semanas depois tem os mesmos grupos.
        const adiante = new Date(d.getTime() + p.n * 7 * UM_DIA);
        expect(gruposDeFolgaNoDia(r, adiante)).toEqual(
          gruposDeFolgaNoDia(r, d),
        );
        // Cada grupo folga exatamente 2 dias em cada semana.
        const segunda = segundaDaSemana(d).getTime();
        for (const g of GRUPOS_DOMINGO) {
          let folgas = 0;
          for (let i = 0; i < 7; i++) {
            if (
              gruposDeFolgaNoDia(r, new Date(segunda + i * UM_DIA)).includes(g)
            ) {
              folgas++;
            }
          }
          expect(folgas).toBe(2);
        }
      }),
      { numRuns: 300 },
    );
  });
});
