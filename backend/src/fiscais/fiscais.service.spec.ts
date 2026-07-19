import { FiscaisService } from './fiscais.service';
import { EscalaService } from './escala.service';
import { inicioDoDia } from './fiscais.domain';

/**
 * Testes unitários dos serviços de fiscais (controle de jornada) e escala,
 * usando um `PrismaService` falso (em memória), sem banco de dados.
 */
describe('FiscaisService e EscalaService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function criarPrisma() {
    const fiscais = [
      { id: 'f1', nome: 'Karen Mendoza Barro', usuarioId: 'u1' },
      { id: 'f2', nome: 'Ana Souza', usuarioId: 'u2' },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registros: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ausencias: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const escalas: any[] = [];
    let seq = 0;

    // Casa a condição de `data` do Prisma: igualdade (Date) ou faixa {gte,lt}.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const casaData = (rData: Date, cond: any): boolean => {
      if (cond === undefined) return true;
      if (cond instanceof Date) return rData.getTime() === cond.getTime();
      const okGte =
        cond.gte === undefined || rData.getTime() >= cond.gte.getTime();
      const okLt = cond.lt === undefined || rData.getTime() < cond.lt.getTime();
      return okGte && okLt;
    };

    return {
      registros,
      ausencias,
      fiscal: {
        findMany: () => Promise.resolve(fiscais.map((f) => ({ ...f }))),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findUnique: ({ where: { id } }: any) =>
          Promise.resolve(fiscais.find((f) => f.id === id) ?? null),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findFirst: ({ where: { usuarioId } }: any) =>
          Promise.resolve(
            fiscais.find((f) => f.usuarioId === usuarioId) ?? null,
          ),
      },
      usuario: {
        findMany: () =>
          Promise.resolve([
            { id: 'u1', login: '223747', nome: 'Karen Mendoza Barro' },
            { id: 'u2', login: '999999', nome: 'Ana Souza' },
          ]),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findUnique: ({ where: { id } }: any) =>
          Promise.resolve(
            [
              { id: 'u1', login: '223747' },
              { id: 'u2', login: '999999' },
            ].find((u) => u.id === id) ?? null,
          ),
      },
      colaborador: {
        findMany: () => Promise.resolve([]),
        // Sem fichas canônicas neste cenário: o vínculo colaboradorId resolve
        // para null (comportamento preservado).
        findFirst: () => Promise.resolve(null),
      },
      batidaPonto: {
        findMany: () => Promise.resolve([]),
      },
      registroPontoFiscal: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: ({ data }: any) => {
          const novo = { id: `r${++seq}`, ...data };
          registros.push(novo);
          return Promise.resolve({ ...novo });
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findMany: ({ where }: any) =>
          Promise.resolve(
            registros
              .filter(
                (r) =>
                  (where.fiscalId === undefined ||
                    r.fiscalId === where.fiscalId) &&
                  casaData(r.data, where.data),
              )
              .map((r) => ({ ...r })),
          ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findFirst: ({ where }: any) =>
          Promise.resolve(
            registros.find(
              (r) =>
                (where.fiscalId === undefined ||
                  r.fiscalId === where.fiscalId) &&
                (where.data === undefined ||
                  r.data.getTime() === where.data.getTime()),
            ) ?? null,
          ),
      },
      ausencia: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findUnique: ({ where }: any) => {
          const { pessoaId, data } = where.pessoaId_data;
          return Promise.resolve(
            ausencias.find(
              (a) =>
                a.pessoaId === pessoaId && a.data.getTime() === data.getTime(),
            ) ?? null,
          );
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        upsert: ({ create }: any) => {
          ausencias.push({ ...create });
          return Promise.resolve({ ...create });
        },
      },
      escalaEntry: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: ({ data }: any) => {
          const novo = { id: `e${++seq}`, ...data };
          escalas.push(novo);
          return Promise.resolve({ ...novo });
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findMany: ({ where }: any) =>
          Promise.resolve(
            escalas
              .filter(
                (e) =>
                  (where.funcionarioId === undefined ||
                    e.funcionarioId === where.funcionarioId) &&
                  (where.diaSemana === undefined ||
                    e.diaSemana === where.diaSemana),
              )
              .map((e) => ({ ...e })),
          ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findFirst: ({ where }: any) =>
          Promise.resolve(
            escalas.find(
              (e) =>
                (where.funcionarioId === undefined ||
                  e.funcionarioId === where.funcionarioId) &&
                (where.diaSemana === undefined ||
                  e.diaSemana === where.diaSemana) &&
                (where.folga === undefined || e.folga === where.folga),
            ) ?? null,
          ),
      },
    };
  }

  it('define o status do fiscal e registra o ponto', async () => {
    const prisma = criarPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fiscais = new FiscaisService(prisma as any);
    const r = await fiscais.definirStatus(
      'f1',
      'DISPONIVEL',
      new Date('2024-03-10T08:00:00Z'),
    );
    expect(r.status).toBe('DISPONIVEL');
    expect(r.primeiroNome).toBe('Karen');
    expect(prisma.registros).toHaveLength(1);
    expect(prisma.registros[0].data.getTime()).toBe(
      inicioDoDia(new Date('2024-03-10T08:00:00Z')).getTime(),
    );
  });

  it('grava o vínculo colaboradorId no ponto do fiscal (ponte da Fase 4)', async () => {
    const prisma = criarPrisma();
    // Ficha canônica vinculada pela conta de acesso (mesmo usuarioId do fiscal).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma as any).colaborador.findFirst = ({ where }: any) =>
      Promise.resolve(where.usuarioId === 'u1' ? { id: 'colab-1' } : null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fiscais = new FiscaisService(prisma as any);
    await fiscais.definirStatus(
      'f1',
      'DISPONIVEL',
      new Date('2024-03-10T08:00:00Z'),
    );
    // O registro novo já carrega o vínculo com a ficha canônica.
    expect(prisma.registros[0].colaboradorId).toBe('colab-1');
  });

  it('reescreverRegistrosDoDia propaga o colaboradorId às transições', async () => {
    const prisma = criarPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fiscais = new FiscaisService(prisma as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const criados: any[] = [];
    const cliente = {
      registroPontoFiscal: {
        deleteMany: () => Promise.resolve({ count: 0 }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createMany: ({ data }: any) => {
          criados.push(...data);
          return Promise.resolve({ count: data.length });
        },
      },
    };
    await fiscais.reescreverRegistrosDoDia(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cliente as any,
      'f1',
      new Date('2024-03-10T00:00:00Z'),
      [{ status: 'DISPONIVEL', em: new Date('2024-03-10T11:00:00Z') }],
      'colab-1',
    );
    expect(criados).toHaveLength(1);
    expect(criados[0].colaboradorId).toBe('colab-1');
    expect(criados[0].fiscalId).toBe('f1');
  });

  it('registrarFalta grava o vínculo colaboradorId na ausência (Fase 4)', async () => {
    const prisma = criarPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma as any).colaborador.findFirst = ({ where }: any) =>
      Promise.resolve(where.usuarioId === 'u1' ? { id: 'colab-1' } : null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fiscais = new FiscaisService(prisma as any);
    await fiscais.registrarFalta('f1', new Date('2024-03-10T08:00:00Z'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ausencia = (prisma as any).ausencias.find(
      (a: { pessoaId: string }) => a.pessoaId === 'f1',
    );
    expect(ausencia?.colaboradorId).toBe('colab-1');
  });

  it('painel lista todos os fiscais; sem ponto hoje => FORA_EXPEDIENTE', async () => {
    const prisma = criarPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fiscais = new FiscaisService(prisma as any);
    await fiscais.definirStatus('f1', 'DISPONIVEL');
    const painel = await fiscais.painel();
    const f1 = painel.find((p) => p.fiscalId === 'f1');
    const f2 = painel.find((p) => p.fiscalId === 'f2');
    expect(f1?.status).toBe('DISPONIVEL');
    expect(f2?.status).toBe('FORA_EXPEDIENTE');
    expect(f1?.primeiroNome).toBe('Karen');
  });

  it('calcula a jornada do dia (trabalhando, intervalo e carga horária)', async () => {
    const prisma = criarPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fiscais = new FiscaisService(prisma as any);
    const h = (hhmm: string) => new Date(`2024-03-10T${hhmm}:00Z`);
    await fiscais.definirStatus('f1', 'DISPONIVEL', h('08:00'));
    await fiscais.definirStatus('f1', 'INTERVALO', h('10:00'));
    await fiscais.definirStatus('f1', 'DISPONIVEL', h('10:30'));
    await fiscais.definirStatus('f1', 'FORA_EXPEDIENTE', h('12:00'));

    const jornada = await fiscais.jornadaDoDia(
      new Date('2024-03-10T00:00:00Z'),
    );
    const f1 = jornada.find((j) => j.fiscalId === 'f1');
    const HORA = 3_600_000;
    // Trabalhando: 08–10 (2h) + 10:30–12 (1,5h) = 3,5h.
    expect(f1?.tempoTrabalhandoMs).toBe(3.5 * HORA);
    // Intervalo: 10–10:30 = 0,5h.
    expect(f1?.tempoIntervaloMs).toBe(0.5 * HORA);
    // Carga horária = tempo trabalhando (sem intervalo), conforme a definição
    // do domínio (`Jornada.cargaHorariaMs`): 3,5h.
    expect(f1?.cargaHorariaMs).toBe(3.5 * HORA);
    expect(f1?.status).toBe('FORA_EXPEDIENTE');
  });

  it('expõe fiscal histórico incompleto sem mantê-lo disponível', async () => {
    const prisma = criarPrisma();
    prisma.registros.push({
      id: 'r-incompleto',
      fiscalId: 'f1',
      status: 'DISPONIVEL',
      data: new Date('2024-03-10T00:00:00.000Z'),
      em: new Date('2024-03-10T11:00:00.000Z'),
    });
    const fiscais = new FiscaisService(prisma as never);

    const jornada = await fiscais.jornadaDoDia(
      new Date('2024-03-10T00:00:00.000Z'),
    );
    const f1 = jornada.find((j) => j.fiscalId === 'f1');

    expect(f1?.jornadaStatus).toBe('INCOMPLETO');
    expect(f1?.status).toBe('FORA_EXPEDIENTE');
    expect(f1?.faltando).toEqual(['encerramento']);
    expect(f1?.tempoTrabalhandoMs).toBe(0);
  });

  it('prefere a classificação canônica mesmo se o tipo histórico persistido estiver antigo', async () => {
    const prisma = criarPrisma();
    prisma.registros.push(
      {
        id: 'r1',
        fiscalId: 'f1',
        status: 'DISPONIVEL',
        data: new Date('2024-03-10T00:00:00.000Z'),
        em: new Date('2024-03-10T10:00:00.000Z'),
      },
      {
        id: 'r2',
        fiscalId: 'f1',
        status: 'INTERVALO',
        data: new Date('2024-03-10T00:00:00.000Z'),
        em: new Date('2024-03-10T14:00:00.000Z'),
      },
    );
    prisma.batidaPonto.findMany = jest.fn().mockResolvedValue([
      {
        id: 'b1',
        pessoaId: 'f1',
        hora: new Date('2024-03-10T07:00:00.000Z'),
        tipo: 'ENTRADA',
      },
      {
        id: 'b2',
        pessoaId: 'f1',
        hora: new Date('2024-03-10T11:00:00.000Z'),
        tipo: 'SAIDA_INTERVALO',
      },
    ]);
    const fiscais = new FiscaisService(prisma as never);

    const jornada = await fiscais.jornadaDoDia(
      new Date('2024-03-10T00:00:00.000Z'),
    );
    const f1 = jornada.find((j) => j.fiscalId === 'f1');

    expect(f1?.jornadaStatus).toBe('ENCERRADO');
    expect(f1?.status).toBe('FORA_EXPEDIENTE');
    expect(f1?.tempoTrabalhandoMs).toBe(4 * 3_600_000);
  });

  it('não encerra a jornada às 21h de Brasília por causa da virada UTC', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-17T02:30:00.000Z')); // 23h30 em Brasília
    try {
      const prisma = criarPrisma();
      prisma.registros.push({
        id: 'r-late',
        fiscalId: 'f1',
        status: 'DISPONIVEL',
        data: new Date('2026-07-16T00:00:00.000Z'),
        em: new Date('2026-07-17T00:00:00.000Z'), // 21h em Brasília
      });
      const fiscais = new FiscaisService(prisma as never);

      const jornada = await fiscais.jornadaDoDia(
        new Date('2026-07-16T00:00:00.000Z'),
      );
      const f1 = jornada.find((j) => j.fiscalId === 'f1');

      expect(f1?.jornadaStatus).toBe('TRABALHANDO');
      expect(f1?.status).toBe('DISPONIVEL');
      expect(f1?.tempoTrabalhandoMs).toBe(2.5 * 3_600_000);
    } finally {
      jest.useRealTimers();
    }
  });

  it('horas extras do mês: domingo conta como 100% e dia útil como 50%', async () => {
    const prisma = criarPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fiscais = new FiscaisService(prisma as any);
    const HORA = 3_600_000;

    // Domingo 10/03/2024: 08–18 = 10h (esperado 7h20) → 2h40 a 100%.
    await fiscais.definirStatus(
      'f1',
      'DISPONIVEL',
      new Date('2024-03-10T08:00:00Z'),
    );
    await fiscais.definirStatus(
      'f1',
      'FORA_EXPEDIENTE',
      new Date('2024-03-10T18:00:00Z'),
    );
    // Segunda 11/03/2024: 08–18 = 10h (esperado 7h) → 3h a 50%.
    await fiscais.definirStatus(
      'f1',
      'DISPONIVEL',
      new Date('2024-03-11T08:00:00Z'),
    );
    await fiscais.definirStatus(
      'f1',
      'FORA_EXPEDIENTE',
      new Date('2024-03-11T18:00:00Z'),
    );

    const extras = await fiscais.horasExtrasMes(
      new Date('2024-03-15T00:00:00Z'),
    );
    const f1 = extras.find((e) => e.pessoaId === 'f1');
    // 2h40 de domingo a 100%.
    expect(f1?.horasExtras100Ms).toBe(2 * HORA + 40 * 60_000);
    // 3h de segunda a 50%.
    expect(f1?.horasExtras50Ms).toBe(3 * HORA);
    expect(f1?.horasExtrasMs).toBe(2 * HORA + 40 * 60_000 + 3 * HORA);
  });

  it('horas extras do mês usam as batidas do fiscal (fonte canônica), não só o log', async () => {
    const prisma = criarPrisma();
    // Fiscal f1 com batidas numa segunda (11/03/2024): 07-12 + 14-17 = 8h →
    // 1h de extra (base 7h). Sem log legado nesse dia → usa as batidas.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.batidaPonto as any).findMany = ({ where }: any) => {
      if (where?.tipoPessoa === 'FISCAL') {
        const data = new Date('2024-03-11T00:00:00.000Z');
        return Promise.resolve([
          {
            id: 'b1',
            pessoaId: 'f1',
            hora: new Date('2024-03-11T07:00:00.000Z'),
            data,
          },
          {
            id: 'b2',
            pessoaId: 'f1',
            hora: new Date('2024-03-11T12:00:00.000Z'),
            data,
          },
          {
            id: 'b3',
            pessoaId: 'f1',
            hora: new Date('2024-03-11T14:00:00.000Z'),
            data,
          },
          {
            id: 'b4',
            pessoaId: 'f1',
            hora: new Date('2024-03-11T17:00:00.000Z'),
            data,
          },
        ]);
      }
      return Promise.resolve([]);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fiscais = new FiscaisService(prisma as any);
    const HORA = 3_600_000;

    const extras = await fiscais.horasExtrasMes(
      new Date('2024-03-15T00:00:00Z'),
    );
    const f1 = extras.find((e) => e.pessoaId === 'f1');
    expect(f1?.horasExtras50Ms).toBe(1 * HORA);
    expect(f1?.horasExtras100Ms).toBe(0);
  });

  it('no mesmo dia, prefere as batidas e ignora o log (sem dobrar)', async () => {
    const prisma = criarPrisma();
    const HORA = 3_600_000;
    // Log legado de f1 na segunda 11/03: 07–17 = 10h (→ 3h extra se usado).
    prisma.registros.push(
      {
        id: 'r1',
        fiscalId: 'f1',
        status: 'DISPONIVEL',
        data: new Date('2024-03-11T00:00:00.000Z'),
        em: new Date('2024-03-11T07:00:00.000Z'),
      },
      {
        id: 'r2',
        fiscalId: 'f1',
        status: 'FORA_EXPEDIENTE',
        data: new Date('2024-03-11T00:00:00.000Z'),
        em: new Date('2024-03-11T17:00:00.000Z'),
      },
    );
    // Batidas de f1 no MESMO dia: 07-12 + 14-17 = 8h (→ 1h extra).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.batidaPonto as any).findMany = ({ where }: any) => {
      if (where?.tipoPessoa === 'FISCAL') {
        const data = new Date('2024-03-11T00:00:00.000Z');
        return Promise.resolve([
          {
            id: 'b1',
            pessoaId: 'f1',
            hora: new Date('2024-03-11T07:00:00.000Z'),
            data,
          },
          {
            id: 'b2',
            pessoaId: 'f1',
            hora: new Date('2024-03-11T12:00:00.000Z'),
            data,
          },
          {
            id: 'b3',
            pessoaId: 'f1',
            hora: new Date('2024-03-11T14:00:00.000Z'),
            data,
          },
          {
            id: 'b4',
            pessoaId: 'f1',
            hora: new Date('2024-03-11T17:00:00.000Z'),
            data,
          },
        ]);
      }
      return Promise.resolve([]);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fiscais = new FiscaisService(prisma as any);

    const extras = await fiscais.horasExtrasMes(
      new Date('2024-03-15T00:00:00Z'),
    );
    const f1 = extras.find((e) => e.pessoaId === 'f1');
    // 1h (batidas), não 3h (log) nem 4h (soma das duas fontes).
    expect(f1?.horasExtras50Ms).toBe(1 * HORA);
    expect(f1?.horasExtras100Ms).toBe(0);
  });

  it('feriado em dia útil conta como domingo: base 7h20 e extras a 100% (fiscal)', async () => {
    const prisma = criarPrisma();
    const feriadoDia = new Date('2024-03-11T00:00:00.000Z').getTime();
    const feriados = {
      mapaNoPeriodo: jest
        .fn()
        .mockResolvedValue(new Map([[feriadoDia, 'Feriado Teste']])),
      ehFeriado: jest.fn().mockResolvedValue(true),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fiscais = new FiscaisService(
      prisma as never,
      undefined,
      undefined,
      undefined,
      feriados as never,
    );
    const HORA = 3_600_000;

    // Segunda 11/03/2024, mas FERIADO: 08–18 = 10h. Base de domingo (7h20) →
    // 2h40 de extra a 100% (igual ao Relógio Ponto e à Central), não 3h a 50%.
    await fiscais.definirStatus(
      'f1',
      'DISPONIVEL',
      new Date('2024-03-11T08:00:00Z'),
    );
    await fiscais.definirStatus(
      'f1',
      'FORA_EXPEDIENTE',
      new Date('2024-03-11T18:00:00Z'),
    );

    const extras = await fiscais.horasExtrasMes(
      new Date('2024-03-15T00:00:00Z'),
    );
    const f1 = extras.find((e) => e.pessoaId === 'f1');
    expect(f1?.horasExtras100Ms).toBe(2 * HORA + 40 * 60_000);
    expect(f1?.horasExtras50Ms).toBe(0);
  });

  it('feriado em dia útil conta como 100% também para operador (batidas)', async () => {
    const prisma = criarPrisma();
    const feriadoDia = new Date('2024-03-11T00:00:00.000Z').getTime();
    const feriados = {
      mapaNoPeriodo: jest
        .fn()
        .mockResolvedValue(new Map([[feriadoDia, 'Feriado Teste']])),
      ehFeriado: jest.fn().mockResolvedValue(true),
    };
    prisma.colaborador.findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'op1', nome: 'Op Um', funcao: 'OPERADOR' }]);
    // 06:00→12:00 (6h) + 14:00→16:20 (2h20) = 8h20; base domingo 7h20 → 1h.
    prisma.batidaPonto.findMany = jest.fn().mockResolvedValue([
      {
        id: 'a',
        pessoaId: 'op1',
        hora: new Date('2024-03-11T06:00:00.000Z'),
        data: new Date('2024-03-11T00:00:00.000Z'),
      },
      {
        id: 'b',
        pessoaId: 'op1',
        hora: new Date('2024-03-11T12:00:00.000Z'),
        data: new Date('2024-03-11T00:00:00.000Z'),
      },
      {
        id: 'c',
        pessoaId: 'op1',
        hora: new Date('2024-03-11T14:00:00.000Z'),
        data: new Date('2024-03-11T00:00:00.000Z'),
      },
      {
        id: 'd',
        pessoaId: 'op1',
        hora: new Date('2024-03-11T16:20:00.000Z'),
        data: new Date('2024-03-11T00:00:00.000Z'),
      },
    ]);
    const fiscais = new FiscaisService(
      prisma as never,
      undefined,
      undefined,
      undefined,
      feriados as never,
    );

    const extras = await fiscais.horasExtrasMes(
      new Date('2024-03-15T00:00:00Z'),
    );
    const op = extras.find((e) => e.pessoaId === 'op1');
    expect(op?.horasExtras100Ms).toBe(3_600_000); // 1h a 100%
    expect(op?.horasExtras50Ms).toBe(0);
  });

  it('registra a falta do fiscal no dia', async () => {
    const prisma = criarPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fiscais = new FiscaisService(prisma as any);
    await fiscais.registrarFalta('f1', new Date('2024-03-10T09:00:00Z'));
    expect(prisma.ausencias).toHaveLength(1);
    expect(prisma.ausencias[0].pessoaId).toBe('f1');
  });

  it('cadastra escala com horários por dia, intervalo variável e folga (Req 4.3.1-4.3.4)', async () => {
    const prisma = criarPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const escala = new EscalaService(prisma as any);
    await escala.cadastrarEscala({
      funcionarioId: 'func-1',
      diaSemana: 1,
      entrada: '08:00',
      saida: '16:00',
      intervaloMin: 60,
    });
    await escala.cadastrarEscala({
      funcionarioId: 'func-1',
      diaSemana: 0,
      folga: true,
    });
    const seg = await escala.resolverEscalaEfetiva('func-1', 1);
    expect((seg as { entrada: string }).entrada).toBe('08:00');
    const dom = await escala.resolverEscalaEfetiva('func-1', 0);
    expect(dom).toBe('FOLGA');
  });

  it('horário especial prevalece sobre a regra geral (Req 4.3.5)', async () => {
    const prisma = criarPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const escala = new EscalaService(prisma as any);
    await escala.cadastrarEscala({
      funcionarioId: 'func-2',
      diaSemana: 3,
      entrada: '08:00',
      saida: '16:00',
      intervaloMin: 60,
    });
    await escala.definirHorarioEspecial('func-2', {
      funcionarioId: 'func-2',
      diaSemana: 3,
      entrada: '10:00',
      saida: '18:00',
      intervaloMin: 30,
    });
    const efetiva = await escala.resolverEscalaEfetiva('func-2', 3);
    expect((efetiva as { entrada: string }).entrada).toBe('10:00');
  });

  it('escala manual grava o vínculo colaboradorId (Fase 4 · Opção A)', async () => {
    const prisma = criarPrisma();
    // Ficha canônica vinculada pela conta de acesso do fiscal (f1 → u1).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma as any).colaborador.findFirst = ({ where }: any) =>
      Promise.resolve(where.usuarioId === 'u1' ? { id: 'colab-1' } : null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const escala = new EscalaService(prisma as any);
    const geral = await escala.cadastrarEscala({
      funcionarioId: 'f1',
      diaSemana: 1,
      entrada: '08:00',
      saida: '16:00',
      intervaloMin: 60,
    });
    expect((geral as { colaboradorId: string | null }).colaboradorId).toBe(
      'colab-1',
    );
    const especial = await escala.definirHorarioEspecial('f1', {
      funcionarioId: 'f1',
      diaSemana: 2,
      entrada: '10:00',
      saida: '18:00',
    });
    expect((especial as { colaboradorId: string | null }).colaboradorId).toBe(
      'colab-1',
    );
  });
});
