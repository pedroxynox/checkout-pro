import { FiscaisService } from './fiscais.service';

/**
 * Feriado na fonte única da escala (`escaladosDoDia`): o **horário** passa a ser
 * o de domingo, mas a **folga não muda**. Como o cron de detecção automática
 * (alerta de atraso e falta) e a "equipe do dia" partem daqui, é este ponto que
 * decide a que hora o sistema espera cada pessoa num feriado.
 *
 * 07/09/2026 (Independência) cai numa SEGUNDA-FEIRA — um feriado em dia útil, que
 * é justamente o caso em que o horário muda.
 */
const FERIADO_SEGUNDA = new Date(Date.UTC(2026, 8, 7)); // 2026-09-07, segunda

/** Operador que trabalha de segunda a sábado (folga no domingo). */
const TRABALHA_SEGUNDA = {
  id: 'col-1',
  nome: 'Ana',
  funcao: 'OPERADOR',
  folgaDiaSemana: 0, // folga aos domingos → segunda trabalha
  grupoDomingo: null,
  entradaSemana: '08:00',
  entradaFds: '09:00',
  entradaDom: '07:00',
};

/** Operador cuja folga fixa é a segunda-feira. */
const FOLGA_SEGUNDA = {
  id: 'col-2',
  nome: 'Bruno',
  funcao: 'OPERADOR',
  folgaDiaSemana: 1, // folga na segunda
  grupoDomingo: null,
  entradaSemana: '08:00',
  entradaFds: '09:00',
  entradaDom: '07:00',
};

/** Operador sem horário de domingo cadastrado (típico de quem não faz domingo). */
const SEM_HORARIO_DOMINGO = {
  id: 'col-3',
  nome: 'Carla',
  funcao: 'OPERADOR',
  folgaDiaSemana: 0,
  grupoDomingo: null,
  entradaSemana: '08:00',
  entradaFds: '09:00',
  entradaDom: null,
};

interface OpcoesServico {
  operadores?: unknown[];
  ehFeriado?: boolean;
  /** Escala consolidada dos fiscais (o que `EscalaService` devolveria). */
  consolidada?: unknown[];
  /** Fichas (id → entradaDom) para o feriado dos fiscais. */
  fichas?: { id: string; entradaDom: string | null }[];
}

function criarServico({
  operadores = [TRABALHA_SEGUNDA],
  ehFeriado = true,
  consolidada = [],
  fichas = [],
}: OpcoesServico = {}) {
  const prismaFake = {
    colaborador: {
      // A mesma consulta serve a dois usos: a lista de operadores/supervisores e
      // a busca das fichas dos fiscais (por id) no feriado.
      findMany: (args?: { where?: { id?: { in?: string[] } } }) =>
        args?.where?.id?.in
          ? Promise.resolve(
              fichas.filter((f) => args.where!.id!.in!.includes(f.id)),
            )
          : Promise.resolve(operadores),
    },
  };
  const feriadosFake = { ehFeriado: () => Promise.resolve(ehFeriado) };
  const escalaFake = { escalaConsolidada: () => Promise.resolve(consolidada) };
  // Ordem do construtor: prisma, eventos, notificacoes, validacaoData,
  // feriados, cicloFolha, tiposContrato, escala, escalaDomingo, ferias.
  return new FiscaisService(
    prismaFake as never,
    undefined,
    undefined,
    undefined,
    feriadosFake as never,
    undefined,
    undefined,
    escalaFake as never,
    undefined,
    undefined,
  );
}

describe('FiscaisService.escaladosDoDia — feriado usa o horário de domingo', () => {
  it('operador escalado num feriado é esperado no horário de DOMINGO', async () => {
    const escalados = await criarServico().escaladosDoDia(FERIADO_SEGUNDA);

    expect(escalados).toHaveLength(1);
    expect(escalados[0].nome).toBe('Ana');
    // 07:00 (domingo), não 08:00 (semana).
    expect(escalados[0].entradaPrevista).toBe('07:00');
  });

  it('no mesmo dia SEM feriado, segue o horário de semana', async () => {
    const escalados = await criarServico({ ehFeriado: false }).escaladosDoDia(
      FERIADO_SEGUNDA,
    );

    expect(escalados[0].entradaPrevista).toBe('08:00');
  });

  it('a FOLGA não muda no feriado: quem folga na segunda não é escalado', async () => {
    const escalados = await criarServico({
      operadores: [TRABALHA_SEGUNDA, FOLGA_SEGUNDA],
    }).escaladosDoDia(FERIADO_SEGUNDA);

    // Só Ana. Bruno folga na segunda, e o feriado não o convoca.
    expect(escalados.map((e) => e.nome)).toEqual(['Ana']);
  });

  it('sem horário de domingo cadastrado, mantém o horário normal (não sai da escala)', async () => {
    const escalados = await criarServico({
      operadores: [SEM_HORARIO_DOMINGO],
    }).escaladosDoDia(FERIADO_SEGUNDA);

    expect(escalados).toHaveLength(1);
    expect(escalados[0].nome).toBe('Carla');
    expect(escalados[0].entradaPrevista).toBe('08:00');
  });

  it('fiscal num feriado também usa o horário de domingo da sua ficha', async () => {
    // O horário de domingo do fiscal vive na FICHA, não na escala semanal.
    const escalados = await criarServico({
      operadores: [],
      consolidada: [
        {
          funcionarioId: 'fis-1',
          colaboradorId: 'col-f',
          nome: 'Duda Fiscal',
          efetiva: { entrada: '10:00', folga: false },
        },
      ],
      fichas: [{ id: 'col-f', entradaDom: '06:30' }],
    }).escaladosDoDia(FERIADO_SEGUNDA);

    expect(escalados).toHaveLength(1);
    expect(escalados[0].tipoPessoa).toBe('FISCAL');
    expect(escalados[0].entradaPrevista).toBe('06:30');
  });

  it('fiscal de FOLGA no feriado continua de folga', async () => {
    const escalados = await criarServico({
      operadores: [],
      consolidada: [
        {
          funcionarioId: 'fis-1',
          colaboradorId: 'col-f',
          nome: 'Duda Fiscal',
          efetiva: 'FOLGA',
        },
      ],
      fichas: [{ id: 'col-f', entradaDom: '06:30' }],
    }).escaladosDoDia(FERIADO_SEGUNDA);

    expect(escalados).toEqual([]);
  });

  it('fiscal sem horário de domingo na ficha mantém o horário da escala', async () => {
    const escalados = await criarServico({
      operadores: [],
      consolidada: [
        {
          funcionarioId: 'fis-1',
          colaboradorId: 'col-f',
          nome: 'Duda Fiscal',
          efetiva: { entrada: '10:00', folga: false },
        },
      ],
      fichas: [{ id: 'col-f', entradaDom: null }],
    }).escaladosDoDia(FERIADO_SEGUNDA);

    expect(escalados[0].entradaPrevista).toBe('10:00');
  });

  it('sem o serviço de feriados, o dia é tratado como normal', async () => {
    // `FeriadosService` é opcional: sem ele nada muda (comportamento antigo).
    const prismaFake = {
      colaborador: { findMany: () => Promise.resolve([TRABALHA_SEGUNDA]) },
    };
    const service = new FiscaisService(prismaFake as never);

    const escalados = await service.escaladosDoDia(FERIADO_SEGUNDA);

    expect(escalados[0].entradaPrevista).toBe('08:00');
  });
});
