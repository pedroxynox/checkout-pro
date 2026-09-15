import { AtestadosService } from './atestados.service';
import {
  AtestadoSobrepostoError,
  PeriodoAtestadoInvalidoError,
} from './atestados.errors';

/**
 * Guard de sobreposição do `lancar`: um dia só pode pertencer a UM atestado, e
 * validação do período. Usa um Prisma falso em memória.
 */
describe('AtestadosService.lancar', () => {
  const dia = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

  function criarServico(opts: { temSobreposto?: boolean } = {}) {
    const criadasAusencias: unknown[] = [];
    const prismaFake = {
      atestado: {
        findFirst: () =>
          Promise.resolve(opts.temSobreposto ? { id: 'a-existente' } : null),
        findMany: () => Promise.resolve([]),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: (args: any) =>
          Promise.resolve({ id: 'a-novo', ...(args?.data ?? {}) }),
      },
      colaborador: {
        findUnique: () => Promise.resolve({ nome: 'Fulano' }),
      },
      ausencia: {
        findMany: () => Promise.resolve([]),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: (args: any) => {
          criadasAusencias.push(args?.data);
          return Promise.resolve({});
        },
        update: () => Promise.resolve({}),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: (fn: (tx: any) => any) => fn(prismaFake),
    };
    const service = new AtestadosService(
      prismaFake as never,
      undefined,
      undefined,
      undefined,
    );
    return { service, criadasAusencias };
  }

  it('rejeita quando há um atestado sobreposto do colaborador', async () => {
    const { service } = criarServico({ temSobreposto: true });
    await expect(
      service.lancar({
        colaboradorId: 'c1',
        inicio: dia('2026-07-10'),
        fim: dia('2026-07-15'),
        cid: 'M54.5',
      }),
    ).rejects.toBeInstanceOf(AtestadoSobrepostoError);
  });

  it('lança normalmente quando não há sobreposição (cria uma falta por dia)', async () => {
    const { service, criadasAusencias } = criarServico({
      temSobreposto: false,
    });
    const r = await service.lancar({
      colaboradorId: 'c1',
      inicio: dia('2026-07-10'),
      fim: dia('2026-07-12'),
      cid: 'M54.5',
    });
    expect(r.atestadoId).toBe('a-novo');
    expect(r.dias).toBe(3);
    expect(criadasAusencias).toHaveLength(3); // 10, 11, 12
  });

  it('rejeita período com fim antes do início', async () => {
    const { service } = criarServico();
    await expect(
      service.lancar({
        colaboradorId: 'c1',
        inicio: dia('2026-07-15'),
        fim: dia('2026-07-10'),
        cid: 'M54.5',
      }),
    ).rejects.toBeInstanceOf(PeriodoAtestadoInvalidoError);
  });
});

/**
 * `listar` marca `vigente` — o atestado está em curso na data de referência.
 *
 * O card de Atestados na escala usa isso para destacar quem está de atestado
 * agora, e passa a janela começando HOJE para deixar de fora os já encerrados
 * (o `where` do backend é de INTERSEÇÃO, então um atestado que começou antes
 * mas ainda não terminou continua aparecendo).
 */
describe('AtestadosService.listar (vigente)', () => {
  const dia = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

  /** Um atestado gravado, no formato mínimo que o `listar` consome. */
  function atestadoFake(id: string, inicio: string, fim: string) {
    return {
      id,
      colaboradorId: 'col-1',
      inicio: dia(inicio),
      fim: dia(fim),
      dias: 3,
      cid: 'J11',
      semCid: false,
      observacao: null,
      registradaPorNome: null,
      criadoEm: dia(inicio),
    };
  }

  function criarServico(gravados: ReturnType<typeof atestadoFake>[]) {
    const prismaFake = {
      atestado: {
        findMany: ({
          where,
        }: {
          where: { inicio: { lte: Date }; fim: { gte: Date } };
        }) =>
          // Reproduz a interseção de períodos do serviço.
          Promise.resolve(
            gravados.filter(
              (a) =>
                a.inicio.getTime() <= where.inicio.lte.getTime() &&
                a.fim.getTime() >= where.fim.gte.getTime(),
            ),
          ),
      },
      colaborador: {
        findMany: () => Promise.resolve([{ id: 'col-1', nome: 'Fulano' }]),
      },
      ausencia: { groupBy: () => Promise.resolve([]) },
    };
    return new AtestadosService(
      prismaFake as never,
      undefined,
      undefined,
      undefined,
    );
  }

  const janela = { inicio: dia('2026-07-10'), fim: dia('2026-09-08') };

  it('marca vigente o atestado que engloba a referência', async () => {
    const service = criarServico([
      atestadoFake('a1', '2026-07-08', '2026-07-12'),
    ]);
    const lista = await service.listar({
      ...janela,
      referencia: dia('2026-07-10'),
    });
    expect(lista).toHaveLength(1);
    expect(lista[0].vigente).toBe(true);
  });

  it('não marca vigente um atestado ainda por começar (programado)', async () => {
    const service = criarServico([
      atestadoFake('a1', '2026-07-20', '2026-07-25'),
    ]);
    const lista = await service.listar({
      ...janela,
      referencia: dia('2026-07-10'),
    });
    expect(lista[0].vigente).toBe(false);
  });

  it('inclui os dois extremos do período como vigentes', async () => {
    const service = criarServico([
      atestadoFake('a1', '2026-07-10', '2026-07-14'),
    ]);
    const noPrimeiro = await service.listar({
      ...janela,
      referencia: dia('2026-07-10'),
    });
    expect(noPrimeiro[0].vigente).toBe(true);
    const noUltimo = await service.listar({
      ...janela,
      referencia: dia('2026-07-14'),
    });
    expect(noUltimo[0].vigente).toBe(true);
  });

  it('uma janela que começa hoje deixa de fora os atestados encerrados', async () => {
    const service = criarServico([
      atestadoFake('encerrado', '2026-06-01', '2026-06-05'),
      atestadoFake('em-curso', '2026-07-08', '2026-07-12'),
      atestadoFake('programado', '2026-07-20', '2026-07-25'),
    ]);
    const lista = await service.listar({
      ...janela,
      referencia: dia('2026-07-10'),
    });
    expect(lista.map((a) => a.id)).toEqual(['em-curso', 'programado']);
  });
});
