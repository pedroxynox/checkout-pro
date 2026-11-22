import {
  entradaEsperadaNoDia,
  saidaEsperadaNoDia,
} from '../escala-domingo/escala-domingo.domain';
import { FolgaService } from '../escala-domingo/folga.service';
import { REGRAS_PADRAO, RegrasContrato } from '../ponto/ponto.domain';
import { JornadaVigenciaService } from './jornada-vigencia.service';

/**
 * `JornadaVigenciaService`: carrega em lote e responde a jornada prevista. O
 * teste central compara, sobre OS MESMOS dados, o consultor com o que o sistema
 * usa hoje (`FolgaService` + `entradaEsperadaNoDia`/`saidaEsperadaNoDia`): sem
 * vigência, tem de dar igual em todas as pessoas e dias.
 */

const CONTRATO_6X1 = 'contrato-6x1';
const CONTRATO_5X2 = 'contrato-5x2';
const REGRAS_5X2: RegrasContrato = {
  ...REGRAS_PADRAO,
  cargaBaseMs: () => 528 * 60_000,
  cargaFeriadoMs: 528 * 60_000,
  intervaloMaximoMs: 170 * 60_000,
  limiteExtrasMs: 70 * 60_000,
};

const dia = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const base = {
  tipoContratoJornadaId: CONTRATO_6X1,
  entradaSemana: '06:50',
  saidaSemana: '15:50',
  entradaFds: '06:50',
  saidaFds: '16:50',
  entradaDom: '07:00',
  saidaDom: '14:20',
};

/** Fichas que cobrem os caminhos da regra única de folga. */
const FICHAS = [
  // Folga fixa na quarta, grupo G1 no rodízio de domingo.
  { id: 'ana', ...base, folgaDiaSemana: 3, grupoDomingo: 'G1' },
  // Folga fixa no domingo: prevalece sobre o grupo.
  { id: 'bia', ...base, folgaDiaSemana: 0, grupoDomingo: 'G2' },
  // Ficha OMISSA: a folga vem da escala semanal (EscalaEntry, pela id de fiscal).
  { id: 'caio', ...base, folgaDiaSemana: null, grupoDomingo: 'G3' },
  // Fora do rodízio: folga fixa aos domingos.
  { id: 'davi', ...base, folgaDiaSemana: 1, grupoDomingo: null },
  // Sem horário de fim de semana cadastrado.
  {
    id: 'eva',
    ...base,
    folgaDiaSemana: 2,
    grupoDomingo: 'G2',
    entradaFds: null,
    saidaFds: null,
  },
];

/** Escala semanal legada: o fiscal "fiscal-caio" folga às sextas. */
const ESCALA = [
  {
    funcionarioId: 'fiscal-caio',
    colaboradorId: null,
    diaSemana: 5,
    folga: true,
  },
  { funcionarioId: 'ana', colaboradorId: 'ana', diaSemana: 6, folga: true },
];

/** 23/11/2026 (segunda) a 06/12/2026 (domingo): duas semanas inteiras. */
const DIAS = Array.from(
  { length: 14 },
  (_, i) => new Date(Date.UTC(2026, 10, 23 + i)),
);
const ANCORA = { data: dia('2026-11-08'), ordem: ['G3', 'G2', 'G1'] as const };

function montar(
  opcoes: {
    vigencias?: {
      id: string;
      colaboradorId: string;
      vigenteDesde: Date;
      tipoContratoJornadaId: string;
      grupo: string | null;
      folgasFixas: number[];
      disponibilidade: { diaSemana: number; entrada: string; saida: string }[];
    }[];
    feriadosManuais?: Date[];
  } = {},
) {
  const vigencias = opcoes.vigencias ?? [];
  const prisma = {
    colaborador: {
      findMany: jest.fn(() => Promise.resolve(FICHAS)),
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(FICHAS.find((f) => f.id === where.id) ?? null),
      ),
    },
    jornadaVigencia: {
      findMany: jest.fn(
        ({
          where,
        }: {
          where: { colaboradorId?: string; vigenteDesde: { lte: Date } };
        }) =>
          Promise.resolve(
            vigencias.filter(
              (v) =>
                v.vigenteDesde <= where.vigenteDesde.lte &&
                (!where.colaboradorId ||
                  v.colaboradorId === where.colaboradorId),
            ),
          ),
      ),
    },
    escalaEntry: {
      findMany: jest.fn(
        ({ where }: { where: { diaSemana: { in: number[] } } }) =>
          Promise.resolve(
            ESCALA.filter((e) => where.diaSemana.in.includes(e.diaSemana)),
          ),
      ),
    },
    feriado: {
      findMany: jest.fn(() =>
        Promise.resolve(
          (opcoes.feriadosManuais ?? []).map((data) => ({
            data,
            nome: 'Municipal',
          })),
        ),
      ),
    },
  };
  const escalaDomingo = {
    obterAncora: jest.fn(() =>
      Promise.resolve({ data: ANCORA.data, ordem: [...ANCORA.ordem] }),
    ),
  };
  const tiposContrato = {
    regrasDoContrato: jest.fn((id: string | null) =>
      Promise.resolve(id === CONTRATO_5X2 ? REGRAS_5X2 : REGRAS_PADRAO),
    ),
  };
  const service = new JornadaVigenciaService(
    prisma as never,
    tiposContrato as never,
    escalaDomingo as never,
  );
  const folga = new FolgaService(prisma as never, escalaDomingo as never);
  return { service, folga, prisma, tiposContrato };
}

describe('JornadaVigenciaService.consultor — sem vigência é o sistema de hoje', () => {
  it('folga = FolgaService; entrada/saída = funções de hoje, em todas as pessoas e dias', async () => {
    const { service, folga } = montar();
    const consultor = await service.consultor(DIAS);
    const folgaHoje = await folga.consultor(DIAS);
    const identidades: string[][] = [
      ['ana'],
      ['bia'],
      ['fiscal-caio', 'caio'],
      ['davi'],
      ['eva'],
    ];
    for (const d of DIAS) {
      for (const ids of identidades) {
        const p = consultor.previsto(ids, d);
        const ficha = FICHAS.find((f) => ids.includes(f.id))!;
        expect(p).not.toBeNull();
        expect(p!.regime).toBe('LEGADO_6X1');
        expect(p!.folga).toBe(folgaHoje.ehFolga(d, ids));
        expect(p!.entrada).toBe(entradaEsperadaNoDia(ficha, d, ANCORA, false));
        expect(p!.saida).toBe(saidaEsperadaNoDia(ficha, d, ANCORA, false));
      }
    }
  });

  it('a escala semanal legada vale para a ficha omissa (sexta do Caio)', async () => {
    const { service } = montar();
    const consultor = await service.consultor(DIAS);
    expect(
      consultor.previsto(['fiscal-caio', 'caio'], dia('2026-11-27'))!.folga,
    ).toBe(true);
    // A ficha que afirma folga decide sozinha (ADR 0023): o sábado da Ana não.
    expect(consultor.previsto(['ana'], dia('2026-11-28'))!.folga).toBe(false);
  });

  it('carrega tudo em lote: uma consulta por fonte, qualquer número de dias', async () => {
    const { service, prisma } = montar();
    const consultor = await service.consultor(DIAS);
    for (const d of DIAS) consultor.previsto(['ana'], d);
    expect(prisma.colaborador.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.jornadaVigencia.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.escalaEntry.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.feriado.findMany).toHaveBeenCalledTimes(1);
  });

  it('pessoa desconhecida → null; dia não carregado → erro', async () => {
    const { service } = montar();
    const consultor = await service.consultor(DIAS);
    expect(
      consultor.previsto(['ninguem', null, undefined], DIAS[0]),
    ).toBeNull();
    expect(() => consultor.previsto(['ana'], dia('2026-12-31'))).toThrow(
      /fora dos dias carregados/,
    );
  });
});

describe('JornadaVigenciaService.consultor — com vigência', () => {
  const vigenciaDaAna = {
    id: 'vig-ana',
    colaboradorId: 'ana',
    vigenteDesde: dia('2026-11-25'),
    tipoContratoJornadaId: CONTRATO_5X2,
    grupo: null,
    folgasFixas: [6, 0],
    disponibilidade: [1, 2, 3, 4, 5].map((d) => ({
      diaSemana: d,
      entrada: '06:00',
      saida: '16:48',
    })),
  };

  it('dias antes da vigência seguem o legado; a partir dela, o contrato novo', async () => {
    const { service } = montar({ vigencias: [vigenciaDaAna] });
    const consultor = await service.consultor(DIAS);
    const segunda = consultor.previsto(['ana'], dia('2026-11-23'))!;
    const quarta = consultor.previsto(['ana'], dia('2026-11-25'))!;
    expect(segunda).toMatchObject({
      regime: 'LEGADO_6X1',
      entrada: '06:50',
      regras: REGRAS_PADRAO,
    });
    // A quarta era a folga antiga; no contrato novo é dia de trabalho.
    expect(quarta).toMatchObject({
      regime: 'SEMANAL',
      vigenciaId: 'vig-ana',
      folga: false,
      entrada: '06:00',
      saida: '16:48',
      regras: REGRAS_5X2,
      cargaMs: 528 * 60_000,
    });
    expect(consultor.previsto(['ana'], dia('2026-11-28'))!.folga).toBe(true);
    // As demais pessoas não são afetadas.
    expect(consultor.previsto(['bia'], dia('2026-11-25'))!.regime).toBe(
      'LEGADO_6X1',
    );
  });

  it('não lê vigências que começam depois do último dia carregado', async () => {
    const { service, prisma } = montar();
    await service.consultor(DIAS);
    expect(prisma.jornadaVigencia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { vigenteDesde: { lte: dia('2026-12-06') } },
      }),
    );
  });

  it('feriado do calendário vale por padrão; o chamador pode informar outro', async () => {
    const terca = dia('2026-11-24');
    const { service } = montar({
      vigencias: [{ ...vigenciaDaAna, vigenteDesde: dia('2026-11-23') }],
      feriadosManuais: [terca],
    });
    const consultor = await service.consultor(DIAS);
    expect(consultor.previsto(['ana'], terca)).toMatchObject({
      contaComo100: true,
      geraDebito: false,
      cargaMs: REGRAS_5X2.cargaFeriadoMs,
      entrada: '06:00',
    });
    expect(consultor.previsto(['ana'], terca, false)!.contaComo100).toBe(false);
  });
});

describe('JornadaVigenciaService.regrasNoDia', () => {
  const vigencia = {
    id: 'v',
    colaboradorId: 'ana',
    vigenteDesde: dia('2026-11-23'),
    tipoContratoJornadaId: CONTRATO_5X2,
    grupo: null,
    folgasFixas: [],
    disponibilidade: [],
  };

  it('antes da vigência, o contrato da ficha; a partir dela, o da vigência', async () => {
    const { service, tiposContrato } = montar({ vigencias: [vigencia] });
    expect(await service.regrasNoDia('ana', dia('2026-11-22'))).toBe(
      REGRAS_PADRAO,
    );
    expect(tiposContrato.regrasDoContrato).toHaveBeenLastCalledWith(
      CONTRATO_6X1,
    );
    expect(await service.regrasNoDia('ana', dia('2026-11-23'))).toBe(
      REGRAS_5X2,
    );
    expect(await service.regrasNoDia('ana', dia('2027-01-10'))).toBe(
      REGRAS_5X2,
    );
  });

  it('sem pessoa, o contrato padrão', async () => {
    const { service, tiposContrato } = montar();
    await service.regrasNoDia(null, dia('2026-11-23'));
    expect(tiposContrato.regrasDoContrato).toHaveBeenCalledWith(null);
  });
});
