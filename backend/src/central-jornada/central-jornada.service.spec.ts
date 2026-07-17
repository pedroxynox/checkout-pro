import { CentralJornadaService } from './central-jornada.service';

/**
 * Teste do resumo do ciclo (26→25) da Central de Jornada, cobrindo: dia normal,
 * hora extra 50%, domingo 100%, déficit (dia trabalhado abaixo da carga), falta
 * marcada como débito, atestado e o saldo. "Agora" é fixado em 10/07/2026 para
 * que os dias de teste (fim de junho / início de julho) fiquem completos.
 */
const H7 = 25_200_000; // 7h
const H8 = 28_800_000; // 8h
const UMA_HORA = 3_600_000;

function dia(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
function batida(id: string, iso: string, hhmm: string) {
  return {
    id,
    pessoaId: 'c1',
    colaboradorId: 'c1',
    data: dia(iso),
    hora: new Date(`${iso}T${hhmm}:00.000Z`),
  };
}

describe('CentralJornadaService.resumoCiclo', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-10T12:00:00.000Z'));
  });
  afterAll(() => jest.useRealTimers());

  function montar() {
    const batidas = [
      // A) Seg 29/06: 7h exatas (07-12 + 14-16) → sem extra, sem déficit.
      batida('a1', '2026-06-29', '07:00'),
      batida('a2', '2026-06-29', '12:00'),
      batida('a3', '2026-06-29', '14:00'),
      batida('a4', '2026-06-29', '16:00'),
      // B) Ter 30/06: 8h (07-12 + 14-17) → +1h extra 50%.
      batida('b1', '2026-06-30', '07:00'),
      batida('b2', '2026-06-30', '12:00'),
      batida('b3', '2026-06-30', '14:00'),
      batida('b4', '2026-06-30', '17:00'),
      // C) Dom 05/07: 8h20 (06-12 + 14-16:20), base 7h20 → +1h extra 100%.
      batida('c1', '2026-07-05', '06:00'),
      batida('c2', '2026-07-05', '12:00'),
      batida('c3', '2026-07-05', '14:00'),
      batida('c4', '2026-07-05', '16:20'),
      // D) Qua 01/07: 5h (08-12 + 13-14) → déficit de 2h (base 7h).
      batida('d1', '2026-07-01', '08:00'),
      batida('d2', '2026-07-01', '12:00'),
      batida('d3', '2026-07-01', '13:00'),
      batida('d4', '2026-07-01', '14:00'),
    ];
    const ausencias = [
      // E) Qui 02/07: falta marcada como DÉBITO → deve 7h.
      {
        id: 'e1',
        pessoaId: 'c1',
        colaboradorId: 'c1',
        data: dia('2026-07-02'),
        debitoHoras: true,
        motivoJustificativa: null,
      },
      // F) Sex 03/07: ATESTADO → 8h de atestado (pagas, não é débito).
      {
        id: 'f1',
        pessoaId: 'c1',
        colaboradorId: 'c1',
        data: dia('2026-07-03'),
        debitoHoras: false,
        motivoJustificativa: 'ATESTADO_MEDICO',
      },
    ];
    const prismaFake = {
      colaborador: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'c1',
            nome: 'Ana Souza',
            funcao: 'OPERADOR',
            matricula: 'ANA',
            usuarioId: null,
          },
        ]),
      },
      batidaPonto: { findMany: jest.fn().mockResolvedValue(batidas) },
      ausencia: { findMany: jest.fn().mockResolvedValue(ausencias) },
      fiscal: { findMany: jest.fn().mockResolvedValue([]) },
      usuario: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const feriadosFake = {
      mapaNoPeriodo: jest.fn().mockResolvedValue(new Map<number, string>()),
    };
    return new CentralJornadaService(
      prismaFake as never,
      feriadosFake as never,
    );
  }

  /**
   * Um fiscal bate ponto pela identidade de Fiscal (batida.pessoaId = Fiscal.id,
   * colaboradorId nulo), diferente do id da sua ficha. A Central deve resolver o
   * vínculo (por conta/matrícula) e atribuir a jornada à ficha — senão o fiscal
   * some da lista mesmo com horas extras.
   */
  function montarFiscal() {
    // Ter 30/06 (base 7h): 07-12 + 14-16:45 = 7h45 → 45min de extra 50%.
    const batidas = [
      {
        id: 'j1',
        pessoaId: 'fisc1',
        colaboradorId: null,
        data: dia('2026-06-30'),
        hora: new Date('2026-06-30T07:00:00.000Z'),
      },
      {
        id: 'j2',
        pessoaId: 'fisc1',
        colaboradorId: null,
        data: dia('2026-06-30'),
        hora: new Date('2026-06-30T12:00:00.000Z'),
      },
      {
        id: 'j3',
        pessoaId: 'fisc1',
        colaboradorId: null,
        data: dia('2026-06-30'),
        hora: new Date('2026-06-30T14:00:00.000Z'),
      },
      {
        id: 'j4',
        pessoaId: 'fisc1',
        colaboradorId: null,
        data: dia('2026-06-30'),
        hora: new Date('2026-06-30T16:45:00.000Z'),
      },
    ];
    const prismaFake = {
      colaborador: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'col-jos',
            nome: 'Josiane Lima',
            funcao: 'FISCAL',
            matricula: 'JOS',
            usuarioId: 'u1',
          },
        ]),
      },
      batidaPonto: { findMany: jest.fn().mockResolvedValue(batidas) },
      ausencia: { findMany: jest.fn().mockResolvedValue([]) },
      fiscal: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'fisc1', nome: 'Josiane', usuarioId: 'u1' },
          ]),
      },
      usuario: {
        findMany: jest.fn().mockResolvedValue([{ id: 'u1', login: 'JOS' }]),
      },
    };
    const feriadosFake = {
      mapaNoPeriodo: jest.fn().mockResolvedValue(new Map<number, string>()),
    };
    return new CentralJornadaService(
      prismaFake as never,
      feriadosFake as never,
    );
  }

  it('agrega extras 50/100, déficit, débito, atestado, faltas e saldo', async () => {
    const service = montar();
    const r = await service.resumoCiclo(0);

    expect(r.periodo.rotulo).toBe('26/06 – 25/07');
    expect(r.pessoas).toHaveLength(1);
    const p = r.pessoas[0];

    expect(p.cargaTrabalhadaMs).toBe(H7 + H8 + 30_000_000 + 18_000_000); // 7+8+8h20+5
    expect(p.extras50Ms).toBe(UMA_HORA); // dia B
    expect(p.extras100Ms).toBe(UMA_HORA); // domingo C
    expect(p.horasDevidasMs).toBe(2 * UMA_HORA + H7); // déficit 2h + débito 7h
    expect(p.horasAtestadoMs).toBe(H8); // atestado 8h (sexta)
    expect(p.faltas).toBe(2);
    expect(p.diasTac).toBe(0);
    expect(p.saldoMs).toBe(2 * UMA_HORA - (2 * UMA_HORA + H7)); // extras − devidas
  });

  it('inclui o fiscal (vínculo por conta/matrícula) com suas horas extras', async () => {
    const service = montarFiscal();
    const r = await service.resumoCiclo(0);

    expect(r.pessoas).toHaveLength(1);
    const p = r.pessoas[0];
    expect(p.nome).toBe('Josiane Lima');
    expect(p.funcao).toBe('FISCAL');
    expect(p.cargaTrabalhadaMs).toBe(H7 + 45 * 60_000); // 7h45
    expect(p.extras50Ms).toBe(45 * 60_000); // 45 min de extra 50%
    expect(p.extras100Ms).toBe(0);
  });

  it('lista todos os colaboradores não-gerentes, mesmo sem movimento (card zerada)', async () => {
    const prismaFake = {
      colaborador: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'a',
            nome: 'Ana',
            funcao: 'OPERADOR',
            matricula: 'A',
            usuarioId: null,
          },
          {
            id: 'b',
            nome: 'Bruno',
            funcao: 'SUPERVISOR',
            matricula: 'B',
            usuarioId: null,
          },
        ]),
      },
      batidaPonto: { findMany: jest.fn().mockResolvedValue([]) },
      ausencia: { findMany: jest.fn().mockResolvedValue([]) },
      fiscal: { findMany: jest.fn().mockResolvedValue([]) },
      usuario: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const feriadosFake = {
      mapaNoPeriodo: jest.fn().mockResolvedValue(new Map<number, string>()),
    };
    const service = new CentralJornadaService(
      prismaFake as never,
      feriadosFake as never,
    );

    const r = await service.resumoCiclo(0);

    // Nenhum bateu ponto, mas os dois aparecem, na ordem em que vêm da query.
    expect(r.pessoas.map((p) => p.nome)).toEqual(['Ana', 'Bruno']);
    expect(r.pessoas[0].cargaTrabalhadaMs).toBe(0);
    expect(r.pessoas[0].saldoMs).toBe(0);
  });

  it('expõe jornada histórica incompleta e o que falta registrar', async () => {
    const prismaFake = {
      colaborador: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'c1',
            nome: 'Ana',
            funcao: 'OPERADOR',
            matricula: 'A',
            usuarioId: null,
          },
        ]),
      },
      batidaPonto: {
        findMany: jest
          .fn()
          .mockResolvedValue([batida('unica', '2026-06-28', '07:00')]),
      },
      ausencia: { findMany: jest.fn().mockResolvedValue([]) },
      fiscal: { findMany: jest.fn().mockResolvedValue([]) },
      usuario: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const feriadosFake = {
      mapaNoPeriodo: jest.fn().mockResolvedValue(new Map<number, string>()),
    };
    const service = new CentralJornadaService(
      prismaFake as never,
      feriadosFake as never,
    );

    const r = await service.detalhePessoa('c1', 0);
    const incompleto = r.dias.find((d) => d.data.startsWith('2026-06-28'));

    expect(incompleto).toMatchObject({
      tipo: 'INCOMPLETO',
      status: 'INCOMPLETO',
      trabalhadoMs: 0,
      faltando: ['encerramento'],
    });
  });

  it('sinaliza conflito quando há batidas e ausência no mesmo dia', async () => {
    const prismaFake = {
      colaborador: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'c1',
            nome: 'Ana',
            funcao: 'OPERADOR',
            matricula: 'A',
            usuarioId: null,
          },
        ]),
      },
      // Dia 28/06 completo (07-12 + 14-16 = 7h) — bateu ponto normalmente…
      batidaPonto: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            batida('e1', '2026-06-28', '07:00'),
            batida('e2', '2026-06-28', '12:00'),
            batida('e3', '2026-06-28', '14:00'),
            batida('e4', '2026-06-28', '16:00'),
          ]),
      },
      // …mas há uma ausência (atestado) marcada no MESMO dia → conflito.
      ausencia: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'aus-1',
            pessoaId: 'c1',
            colaboradorId: 'c1',
            data: dia('2026-06-28'),
            debitoHoras: false,
            motivoJustificativa: 'ATESTADO_MEDICO',
            statusJustificativa: 'JUSTIFICADA',
          },
        ]),
      },
      fiscal: { findMany: jest.fn().mockResolvedValue([]) },
      usuario: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const feriadosFake = {
      mapaNoPeriodo: jest.fn().mockResolvedValue(new Map<number, string>()),
    };
    const service = new CentralJornadaService(
      prismaFake as never,
      feriadosFake as never,
    );

    const r = await service.resumoCiclo(0);
    // As horas vêm das batidas; a ausência NÃO conta como falta, mas o dia
    // fica marcado como conflito.
    expect(r.pessoas[0].conflitos).toBe(1);
    expect(r.pessoas[0].faltas).toBe(0);
    expect(r.pessoas[0].cargaTrabalhadaMs).toBe(7 * 3_600_000);
    expect(r.totais.conflitos).toBe(1);

    const det = await service.detalhePessoa('c1', 0);
    const diaConf = det.dias.find((d) => d.data.startsWith('2026-06-28'));
    expect(diaConf?.tipo).toBe('TRABALHO');
    expect(diaConf?.conflitoAusencia).toMatchObject({
      ausenciaId: 'aus-1',
      motivoJustificativa: 'ATESTADO_MEDICO',
      statusJustificativa: 'JUSTIFICADA',
      debito: false,
    });
  });

  it('sinaliza atraso quando a entrada passa da tolerância do turno', async () => {
    const prismaFake = {
      colaborador: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'c1',
            nome: 'Ana',
            funcao: 'OPERADOR',
            matricula: 'A',
            usuarioId: null,
            folgaDiaSemana: 0, // folga aos domingos
            grupoDomingo: null,
            entradaSemana: '07:00',
            entradaFds: '08:00',
            entradaDom: null,
          },
        ]),
      },
      // Terça 30/06: turno 07:00, mas a entrada foi 07:40 → 40 min de atraso.
      batidaPonto: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            batida('e1', '2026-06-30', '07:40'),
            batida('e2', '2026-06-30', '12:00'),
            batida('e3', '2026-06-30', '13:00'),
            batida('e4', '2026-06-30', '16:00'),
          ]),
      },
      ausencia: { findMany: jest.fn().mockResolvedValue([]) },
      fiscal: { findMany: jest.fn().mockResolvedValue([]) },
      usuario: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const feriadosFake = {
      mapaNoPeriodo: jest.fn().mockResolvedValue(new Map<number, string>()),
    };
    const service = new CentralJornadaService(
      prismaFake as never,
      feriadosFake as never,
    );

    const r = await service.resumoCiclo(0);
    expect(r.pessoas[0].atrasos).toBe(1);
    expect(r.totais.atrasos).toBe(1);

    const det = await service.detalhePessoa('c1', 0);
    const diaAtraso = det.dias.find((d) => d.data.startsWith('2026-06-30'));
    expect(diaAtraso?.entradaPrevista).toBe('07:00');
    expect(diaAtraso?.atrasoMinutos).toBe(40);
  });

  it('aponta atraso no domingo trabalhado pelo rodízio (com âncora)', async () => {
    // Âncora 05/07 folga G1; 28/06 (domingo anterior) folga G2 → G1 trabalha.
    const escalaDomingo = {
      obterAncora: jest.fn().mockResolvedValue({
        data: new Date('2026-07-05T00:00:00.000Z'),
        ordem: ['G1', 'G3', 'G2'],
      }),
    };
    const prismaFake = {
      colaborador: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'c1',
            nome: 'Ana',
            funcao: 'OPERADOR',
            matricula: 'A',
            usuarioId: null,
            folgaDiaSemana: 1,
            grupoDomingo: 'G1',
            entradaSemana: '07:00',
            entradaFds: '08:00',
            entradaDom: '09:00',
          },
        ]),
      },
      // Domingo 28/06: turno 09:00, entrada 09:40 → 40 min de atraso.
      batidaPonto: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            batida('e1', '2026-06-28', '09:40'),
            batida('e2', '2026-06-28', '12:00'),
            batida('e3', '2026-06-28', '13:00'),
            batida('e4', '2026-06-28', '15:20'),
          ]),
      },
      ausencia: { findMany: jest.fn().mockResolvedValue([]) },
      fiscal: { findMany: jest.fn().mockResolvedValue([]) },
      usuario: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const feriadosFake = {
      mapaNoPeriodo: jest.fn().mockResolvedValue(new Map<number, string>()),
    };
    const service = new CentralJornadaService(
      prismaFake as never,
      feriadosFake as never,
      escalaDomingo as never,
    );

    const det = await service.detalhePessoa('c1', 0);
    const d = det.dias.find((x) => x.data.startsWith('2026-06-28'));
    expect(d?.entradaPrevista).toBe('09:00');
    expect(d?.atrasoMinutos).toBe(40);
    expect(escalaDomingo.obterAncora).toHaveBeenCalled();
  });

  it('não aponta atraso em feriado (turno ambíguo)', async () => {
    const prismaFake = {
      colaborador: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'c1',
            nome: 'Ana',
            funcao: 'OPERADOR',
            matricula: 'A',
            usuarioId: null,
            folgaDiaSemana: 0,
            grupoDomingo: null,
            entradaSemana: '07:00',
            entradaFds: '08:00',
            entradaDom: null,
          },
        ]),
      },
      batidaPonto: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            batida('e1', '2026-06-30', '07:40'),
            batida('e2', '2026-06-30', '12:00'),
            batida('e3', '2026-06-30', '13:00'),
            batida('e4', '2026-06-30', '16:00'),
          ]),
      },
      ausencia: { findMany: jest.fn().mockResolvedValue([]) },
      fiscal: { findMany: jest.fn().mockResolvedValue([]) },
      usuario: { findMany: jest.fn().mockResolvedValue([]) },
    };
    // 30/06 marcado como feriado → não aponta atraso mesmo entrando 07:40.
    const feriadosFake = {
      mapaNoPeriodo: jest
        .fn()
        .mockResolvedValue(
          new Map<number, string>([[dia('2026-06-30').getTime(), 'Feriado']]),
        ),
    };
    const service = new CentralJornadaService(
      prismaFake as never,
      feriadosFake as never,
    );

    const r = await service.resumoCiclo(0);
    expect(r.pessoas[0].atrasos).toBe(0);

    const det = await service.detalhePessoa('c1', 0);
    const d = det.dias.find((x) => x.data.startsWith('2026-06-30'));
    expect(d?.atrasoMinutos).toBeUndefined();
  });
});

describe('CentralJornadaService.inconsistenciasCiclo', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-10T12:00:00.000Z'));
  });
  afterAll(() => jest.useRealTimers());

  function servicoInconsist(
    batidas: ReturnType<typeof batida>[],
    ausencias: unknown[],
  ): CentralJornadaService {
    const prismaFake = {
      colaborador: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'c1',
            nome: 'Ana Souza',
            funcao: 'OPERADOR',
            matricula: 'A',
            usuarioId: null,
            folgaDiaSemana: null,
            grupoDomingo: null,
            entradaSemana: null,
            entradaFds: null,
            entradaDom: null,
          },
        ]),
      },
      batidaPonto: { findMany: jest.fn().mockResolvedValue(batidas) },
      ausencia: { findMany: jest.fn().mockResolvedValue(ausencias) },
      fiscal: { findMany: jest.fn().mockResolvedValue([]) },
      usuario: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const feriadosFake = {
      mapaNoPeriodo: jest.fn().mockResolvedValue(new Map<number, string>()),
    };
    return new CentralJornadaService(
      prismaFake as never,
      feriadosFake as never,
    );
  }

  it('detecta jornada incompleta e conflito ponto↔ausência', async () => {
    const batidas = [
      // 28/06: só uma batida num dia passado → jornada incompleta.
      batida('u1', '2026-06-28', '07:00'),
      // 29/06: dia completo (7h), mas há ausência no mesmo dia → conflito.
      batida('c1', '2026-06-29', '07:00'),
      batida('c2', '2026-06-29', '12:00'),
      batida('c3', '2026-06-29', '14:00'),
      batida('c4', '2026-06-29', '16:00'),
    ];
    const ausencias = [
      {
        id: 'aus-1',
        pessoaId: 'c1',
        colaboradorId: 'c1',
        data: dia('2026-06-29'),
        debitoHoras: false,
        motivoJustificativa: 'ATESTADO_MEDICO',
        statusJustificativa: 'JUSTIFICADA',
      },
    ];
    const service = servicoInconsist(batidas, ausencias);

    const r = await service.inconsistenciasCiclo(0);
    const tipos = r.itens.map((i) => i.tipo);

    expect(tipos).toContain('INCOMPLETA');
    expect(tipos).toContain('CONFLITO_AUSENCIA');
    expect(r.totais.conflitos).toBe(1);
    expect(r.totais.incompletas).toBeGreaterThanOrEqual(1);
    // Cada item traz a pessoa e o dia afetados.
    expect(r.itens[0]).toMatchObject({
      nome: 'Ana Souza',
      colaboradorId: 'c1',
    });
  });

  it('detecta batidas duplicadas (muito próximas) no mesmo dia', async () => {
    const batidas = [
      batida('d1', '2026-06-27', '07:00'),
      batida('d2', '2026-06-27', '07:01'), // 1 min depois → duplicada
      batida('d3', '2026-06-27', '12:00'),
      batida('d4', '2026-06-27', '16:00'),
    ];
    const service = servicoInconsist(batidas, []);

    const r = await service.inconsistenciasCiclo(0);

    expect(r.totais.duplicadas).toBe(1);
    expect(r.itens.some((i) => i.tipo === 'DUPLICADA')).toBe(true);
  });
});

describe('CentralJornadaService.exportarCiclo', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-10T12:00:00.000Z'));
  });
  afterAll(() => jest.useRealTimers());

  function servicoExport(
    batidas: ReturnType<typeof batida>[],
    ausencias: unknown[],
  ): CentralJornadaService {
    const prismaFake = {
      colaborador: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'c1',
            nome: 'Ana Souza',
            funcao: 'OPERADOR',
            matricula: 'A',
            usuarioId: null,
            folgaDiaSemana: null,
            grupoDomingo: null,
            entradaSemana: null,
            entradaFds: null,
            entradaDom: null,
          },
        ]),
      },
      batidaPonto: { findMany: jest.fn().mockResolvedValue(batidas) },
      ausencia: { findMany: jest.fn().mockResolvedValue(ausencias) },
      fiscal: { findMany: jest.fn().mockResolvedValue([]) },
      usuario: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const feriadosFake = {
      mapaNoPeriodo: jest.fn().mockResolvedValue(new Map<number, string>()),
    };
    return new CentralJornadaService(
      prismaFake as never,
      feriadosFake as never,
    );
  }

  it('gera linhas por dia relevante e resumo por pessoa', async () => {
    const batidas = [
      // 29/06: dia completo de 7h (trabalho).
      batida('c1', '2026-06-29', '07:00'),
      batida('c2', '2026-06-29', '12:00'),
      batida('c3', '2026-06-29', '14:00'),
      batida('c4', '2026-06-29', '16:00'),
    ];
    const service = servicoExport(batidas, []);

    const exp = await service.exportarCiclo(0);

    // Uma linha para o dia trabalhado (dias sem registro não entram).
    const linha = exp.linhas.find((l) => l.data.startsWith('2026-06-29'));
    expect(linha).toBeDefined();
    expect(linha?.tipo).toBe('TRABALHO');
    expect(linha?.trabalhadoMs).toBe(7 * 3_600_000);
    expect(exp.linhas.every((l) => l.tipo !== 'SEM_REGISTRO')).toBe(true);
    // Resumo por pessoa.
    expect(exp.pessoas).toHaveLength(1);
    expect(exp.pessoas[0].nome).toBe('Ana Souza');
  });

  it('inclui atestado e conta as inconsistências do ciclo', async () => {
    const ausencias = [
      {
        id: 'aus-1',
        pessoaId: 'c1',
        colaboradorId: 'c1',
        data: dia('2026-06-30'),
        debitoHoras: false,
        motivoJustificativa: 'ATESTADO_MEDICO',
        statusJustificativa: 'JUSTIFICADA',
      },
    ];
    // 28/06: uma única batida num dia passado → incompleta (inconsistência).
    const batidas = [batida('c1', '2026-06-28', '07:00')];
    const service = servicoExport(batidas, ausencias);

    const exp = await service.exportarCiclo(0);

    expect(exp.linhas.some((l) => l.atestado)).toBe(true);
    expect(exp.totais.inconsistencias).toBeGreaterThanOrEqual(1);
    expect(exp.linhas.some((l) => l.problemas.includes('Incompleta'))).toBe(
      true,
    );
  });
});
