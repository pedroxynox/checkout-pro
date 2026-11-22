import { REGRAS_PADRAO, RegrasContrato } from '../ponto/ponto.domain';
import {
  folgaDeTeste,
  jornadaDeTeste,
} from '../../test/helpers/jornada-de-teste';
import { CentralJornadaService } from './central-jornada.service';

/**
 * A Central com a vigência da jornada (spec `jornada-5x2`, ADR 0027): o caso
 * que originou tudo. A pessoa estava no 6x1 (folga fixa na quarta) e passa a um
 * 5x2 em 23/11/2026. Os dias até 22/11 têm de dar os números do 6x1 — mesmo
 * calculados hoje — e os dias a partir de 23/11, os do contrato novo.
 */

const CONTRATO_6X1 = 'contrato-6x1';
const CONTRATO_5X2 = 'contrato-5x2';
/** 5x2 de 44h: 8h48 todos os dias, 100% no domingo. */
const REGRAS_5X2: RegrasContrato = {
  ...REGRAS_PADRAO,
  cargaBaseMs: () => 528 * 60_000,
  cargaFeriadoMs: 528 * 60_000,
  intervaloObrigatorio: true,
  intervaloMaximoMs: 170 * 60_000,
  limiteExtrasMs: 70 * 60_000,
};
const tiposContrato = {
  regrasDoContrato: (id: string | null) =>
    Promise.resolve(id === CONTRATO_5X2 ? REGRAS_5X2 : REGRAS_PADRAO),
};

// Quarta 25/11/2026, 20:00 em Brasília: ciclo 26/10–25/11, dia 24 completo.
const AGORA = new Date('2026-11-25T23:00:00.000Z');
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const hora = (iso: string, hhmm: string) => new Date(`${iso}T${hhmm}:00.000Z`);

const FICHA = {
  id: 'adiarys',
  nome: 'Adiarys Lorenzo',
  funcao: 'OPERADOR',
  matricula: '123',
  usuarioId: null,
  ativo: true,
  tipoContratoJornadaId: CONTRATO_6X1,
  folgaDiaSemana: 3, // quarta, no 6x1
  grupoDomingo: null,
  entradaSemana: '07:00',
  saidaSemana: '16:00',
  entradaFds: '07:00',
  saidaFds: '17:00',
  entradaDom: null,
  saidaDom: null,
};

const VIGENCIA = {
  id: 'vig-5x2',
  colaboradorId: 'adiarys',
  vigenteDesde: dia('2026-11-23'),
  tipoContratoJornadaId: CONTRATO_5X2,
  grupo: null,
  folgasFixas: [6, 0],
  disponibilidade: [1, 2, 3, 4, 5].map((d) => ({
    diaSemana: d,
    entrada: '06:00',
    saida: '16:48',
  })),
};

let n = 0;
function batidas(iso: string, horas: string[]) {
  return horas.map((h) => ({
    id: `b${++n}`,
    hora: hora(iso, h),
    data: dia(iso),
    pessoaId: 'adiarys',
    colaboradorId: 'adiarys',
  }));
}

const BATIDAS = [
  // Sexta 20/11 (6x1, carga 8h): 9h trabalhadas → 1h de extra.
  ...batidas('2026-11-20', ['07:00', '11:00', '12:00', '17:00']),
  // Quarta 25/11 (5x2, carga 8h48): era a folga antiga; 8h48 → nada de extra.
  ...batidas('2026-11-25', ['06:00', '10:00', '12:00', '16:48']),
];

function montar(opcoes: { comVigencia: boolean; comJornada: boolean }) {
  const prisma = {
    colaborador: {
      findMany: jest.fn().mockResolvedValue([FICHA]),
      findUnique: jest.fn().mockResolvedValue(FICHA),
    },
    batidaPonto: { findMany: jest.fn().mockResolvedValue(BATIDAS) },
    ausencia: { findMany: jest.fn().mockResolvedValue([]) },
    fiscal: { findMany: jest.fn().mockResolvedValue([]) },
    usuario: { findMany: jest.fn().mockResolvedValue([]) },
    compensacaoHoras: { findMany: jest.fn().mockResolvedValue([]) },
    jornadaVigencia: {
      findMany: jest
        .fn()
        .mockResolvedValue(opcoes.comVigencia ? [VIGENCIA] : []),
    },
  };
  const feriados = {
    mapaNoPeriodo: jest.fn().mockResolvedValue(new Map<number, string>()),
  };
  const jornada = opcoes.comJornada
    ? jornadaDeTeste(prisma, undefined, tiposContrato)
    : undefined;
  // Sem a jornada prevista, a Central é montada como estava em produção antes
  // dela: com a regra única de folga e o contrato da ficha.
  const folga = opcoes.comJornada ? undefined : folgaDeTeste(prisma);
  return new CentralJornadaService(
    prisma as never,
    feriados as never,
    undefined,
    folga,
    undefined,
    // A Central também resolve contrato para o caminho sem a jornada prevista.
    {
      ...tiposContrato,
      regrasDoColaborador: tiposContrato.regrasDoContrato,
    } as never,
    undefined,
    jornada,
  );
}

describe('Central de Jornada com vigência da jornada', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(AGORA);
  });
  afterAll(() => jest.useRealTimers());

  const doDia = async (service: CentralJornadaService, iso: string) => {
    const { dias } = await service.detalhePessoa('adiarys');
    return dias.find((d) => d.data === dia(iso).toISOString())!;
  };

  it('até 22/11 vale o 6x1: a sexta 20/11 rende 1h de extra contra a carga de 8h', async () => {
    const service = montar({ comVigencia: true, comJornada: true });
    const sexta = await doDia(service, '2026-11-20');
    expect(sexta.baseMs).toBe(8 * 3_600_000);
    expect(sexta.extras50Ms).toBe(3_600_000);
  });

  it('a partir de 23/11 vale o 5x2: a quarta (folga antiga) é dia normal de 8h48', async () => {
    const service = montar({ comVigencia: true, comJornada: true });
    const quarta = await doDia(service, '2026-11-25');
    expect(quarta.baseMs).toBe(528 * 60_000);
    expect(quarta.extras50Ms).toBe(0);
    expect(quarta.pontoEmFolga).toBeUndefined();
  });

  it('o dia escalado e não cumprido usa o turno da disponibilidade', async () => {
    const service = montar({ comVigencia: true, comJornada: true });
    const terca = await doDia(service, '2026-11-24');
    expect(terca.tipo).toBe('FALTA_NAO_REGISTRADA');
    expect(terca.entradaPrevista).toBe('06:00');
    // Antes do corte, o turno é o da ficha.
    const quintaAntiga = await doDia(service, '2026-11-19');
    expect(quintaAntiga.entradaPrevista).toBe('07:00');
  });

  it('o resumo do ciclo soma cada dia com o seu contrato', async () => {
    const service = montar({ comVigencia: true, comJornada: true });
    const resumo = await service.resumoCiclo();
    const pessoa = resumo.pessoas.find((p) => p.colaboradorId === 'adiarys')!;
    expect(pessoa.extras50Ms).toBe(3_600_000);
  });

  it('sem vigência, a jornada prevista dá exatamente o que a Central dava antes', async () => {
    const comServico = montar({ comVigencia: false, comJornada: true });
    const semServico = montar({ comVigencia: false, comJornada: false });
    expect(await comServico.detalhePessoa('adiarys')).toEqual(
      await semServico.detalhePessoa('adiarys'),
    );
    expect(await comServico.resumoCiclo()).toEqual(
      await semServico.resumoCiclo(),
    );
    // E a quarta 25/11 continua sendo a folga do 6x1 (ponto em folga, 7h).
    const quarta = await doDia(comServico, '2026-11-25');
    expect(quarta.pontoEmFolga).toBe(true);
    expect(quarta.baseMs).toBe(7 * 3_600_000);
  });
});
