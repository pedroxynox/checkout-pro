import { contarDiasEscalados } from '../colaboradores/perfil-colaborador.domain';
import { montarLinhaEscala } from '../escala-exportacao/escala-publicada.domain';
import { analisarFaltas } from '../operadores/operadores.domain';
import { jornadaDeTeste } from '../../test/helpers/jornada-de-teste';

/**
 * As peças puras que os consumidores usam com a vigência da jornada (spec
 * `jornada-5x2`, ADR 0027): o turno já resolvido na linha da escala, e a folga
 * DO DIA nas contas de dias escalados e de falta "emendada" — no 5x2 são duas
 * folgas por semana, e a folga fixa da ficha não as descreve.
 */

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('montarLinhaEscala com o turno da jornada prevista', () => {
  const ficha = {
    colaboradorId: 'c1',
    nome: 'Ana',
    funcao: 'OPERADOR',
    turno: 'ABERTURA',
    folgaDiaSemana: 1,
    grupoDomingo: null,
    entradaSemana: '07:00',
    saidaSemana: '15:20',
    entradaFds: '08:00',
    saidaFds: '17:20',
    entradaDom: null,
    saidaDom: null,
  } as const;
  const base = {
    ficha,
    dia: dia('2026-11-24'), // terça
    ancoraDomingo: null,
    ehFeriado: false,
    deFerias: false,
    deFolga: false,
    ocorrencia: null,
  };

  it('usa o turno informado em vez do bloco Seg–Qui da ficha', () => {
    expect(
      montarLinhaEscala({
        ...base,
        turnoPrevisto: { entrada: '06:00', saida: '16:48' },
      }),
    ).toMatchObject({ status: 'TRABALHA', entrada: '06:00', saida: '16:48' });
  });

  it('turno informado sem entrada = sem turno (FOLGA)', () => {
    expect(
      montarLinhaEscala({
        ...base,
        turnoPrevisto: { entrada: null, saida: null },
      }).status,
    ).toBe('FOLGA');
  });

  it('sem turno informado, a ficha decide como antes', () => {
    expect(montarLinhaEscala(base)).toMatchObject({
      entrada: '07:00',
      saida: '15:20',
    });
  });
});

describe('dias escalados e "emenda" com a folga do dia', () => {
  // 5x2 de 23/11 a 06/12: folga em sábado e domingo.
  const ehFolga = (d: Date) => d.getUTCDay() === 6 || d.getUTCDay() === 0;
  const INICIO = dia('2026-11-23');
  const FIM = dia('2026-12-06');

  it('contarDiasEscalados: 10 dias úteis em duas semanas de 5x2', () => {
    expect(contarDiasEscalados(ehFolga, INICIO, FIM)).toBe(10);
    // A folga fixa única contava 12 (só um dia de folga por semana).
    expect(contarDiasEscalados(6, INICIO, FIM)).toBe(12);
  });

  it('analisarFaltas: taxa sobre os dias escalados e emenda nas duas folgas', () => {
    const ausencia = (iso: string) => ({ pessoaId: 'op', data: dia(iso) });
    const r = analisarFaltas({
      operadores: [{ id: 'op', nome: 'Ana', folgaDiaSemana: -1, ehFolga }],
      // Sexta (véspera do sábado de folga) e segunda (dia seguinte ao domingo).
      ausencias: [ausencia('2026-11-27'), ausencia('2026-11-30')],
      ausenciasAnterior: [],
      inicio: INICIO,
      fimEscala: FIM,
    });
    const op = r.porOperador[0];
    expect(op.diasEscalados).toBe(10);
    expect(op.taxa).toBe(20);
    expect(op.faltasEmenda).toBe(2);
  });

  it('sem folga do dia, a folga fixa como sempre', () => {
    const r = analisarFaltas({
      operadores: [{ id: 'op', nome: 'Ana', folgaDiaSemana: 3 }],
      ausencias: [{ pessoaId: 'op', data: dia('2026-11-24') }], // véspera da quarta
      ausenciasAnterior: [],
      inicio: INICIO,
      fimEscala: FIM,
    });
    expect(r.porOperador[0]).toMatchObject({
      diasEscalados: 12,
      faltasEmenda: 1,
    });
  });
});

describe('JornadaVigenciaService.folgasNoPeriodo', () => {
  const ficha = {
    tipoContratoJornadaId: 'x',
    folgaDiaSemana: 3,
    grupoDomingo: null,
    entradaSemana: '07:00',
    saidaSemana: '15:00',
    entradaFds: '07:00',
    saidaFds: '15:00',
    entradaDom: null,
    saidaDom: null,
  };
  const prisma = {
    colaborador: {
      findMany: () =>
        Promise.resolve([
          { id: 'com', ...ficha },
          { id: 'sem', ...ficha },
        ]),
    },
    jornadaVigencia: {
      findMany: (args: { where: { colaboradorId?: unknown } }) =>
        Promise.resolve(
          args.where.colaboradorId
            ? [{ colaboradorId: 'com' }]
            : [
                {
                  id: 'v',
                  colaboradorId: 'com',
                  vigenteDesde: dia('2026-11-23'),
                  tipoContratoJornadaId: 'x',
                  grupo: null,
                  folgasFixas: [6, 0],
                  disponibilidade: [],
                },
              ],
        ),
    },
  };

  it('só quem tem vigência ganha a folga do dia; antes do corte vale a ficha', async () => {
    const folgas = await jornadaDeTeste(prisma).folgasNoPeriodo(
      ['com', 'sem'],
      dia('2026-11-16'),
      dia('2026-11-30'),
    );
    expect([...folgas.keys()]).toEqual(['com']);
    const ehFolga = folgas.get('com')!;
    expect(ehFolga(dia('2026-11-18'))).toBe(true); // quarta, 6x1
    expect(ehFolga(dia('2026-11-25'))).toBe(false); // quarta, 5x2
    expect(ehFolga(dia('2026-11-28'))).toBe(true); // sábado, 5x2
    // A véspera do primeiro dia e o dia seguinte ao último estão carregados.
    expect(() => ehFolga(dia('2026-11-15'))).not.toThrow();
    expect(() => ehFolga(dia('2026-12-01'))).not.toThrow();
  });
});
