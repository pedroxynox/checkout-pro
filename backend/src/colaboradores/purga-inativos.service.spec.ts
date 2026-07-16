import { PurgaInativosService } from './purga-inativos.service';

/**
 * Testes da purga mensal de colaboradores inativos.
 *
 * Foco: a janela de retenção padrão é de 3 meses (só entra na purga quem foi
 * desligado ATÉ 3 meses atrás) e a purga apaga a ficha + o histórico de RRHH
 * sem tocar nos registros de arrecadação (totais preservados).
 */
describe('PurgaInativosService', () => {
  interface WhereFindMany {
    ativo: boolean;
    desligadoEm: { not: null; lte: Date };
  }

  function criarServico(opts: {
    /** Valor retornado por config.get; undefined => usa o default (3). */
    mesesEnv?: number;
    /** Ids "inativos" que a query devolve. */
    idsInativos?: string[];
  }): {
    service: PurgaInativosService;
    capturas: { findManyWhere?: WhereFindMany; apagados: string[] };
  } {
    const capturas: { findManyWhere?: WhereFindMany; apagados: string[] } = {
      apagados: [],
    };
    const ids = opts.idsInativos ?? [];

    const tx = {
      ausencia: { deleteMany: () => Promise.resolve({ count: 1 }) },
      incidenciaEscala: { deleteMany: () => Promise.resolve({ count: 2 }) },
      solicitacaoAdvertencia: {
        deleteMany: () => Promise.resolve({ count: 3 }),
      },
      decisaoContrato: { deleteMany: () => Promise.resolve({ count: 4 }) },
      registroPontoFiscal: { deleteMany: () => Promise.resolve({ count: 5 }) },
      escalaEntry: { deleteMany: () => Promise.resolve({ count: 6 }) },
      colaborador: {
        deleteMany: ({ where }: { where: { id: { in: string[] } } }) => {
          capturas.apagados.push(...where.id.in);
          return Promise.resolve({ count: where.id.in.length });
        },
      },
    };

    const prismaFake = {
      colaborador: {
        findMany: ({ where }: { where: WhereFindMany }) => {
          capturas.findManyWhere = where;
          return Promise.resolve(ids.map((id) => ({ id })));
        },
      },
      $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    };

    const configFake = {
      get: (_key: string, def: number) =>
        opts.mesesEnv === undefined ? def : opts.mesesEnv,
    };

    const service = new PurgaInativosService(
      prismaFake as never,
      configFake as never,
    );
    return { service, capturas };
  }

  it('usa a janela de retenção padrão de 3 meses', async () => {
    const { service, capturas } = criarServico({ idsInativos: [] });

    const antes = new Date();
    antes.setMonth(antes.getMonth() - 3);
    await service.purgarInativos();
    const depois = new Date();
    depois.setMonth(depois.getMonth() - 3);

    const limite = capturas.findManyWhere?.desligadoEm.lte as Date;
    expect(limite).toBeInstanceOf(Date);
    // A data-limite deve ser ~3 meses atrás (entre os dois marcos calculados).
    expect(limite.getTime()).toBeGreaterThanOrEqual(antes.getTime());
    expect(limite.getTime()).toBeLessThanOrEqual(depois.getTime());
    // Só busca inativos desligados (desligadoEm não nulo).
    expect(capturas.findManyWhere?.ativo).toBe(false);
  });

  it('respeita a janela configurada na env (ex.: 6 meses)', async () => {
    const { service, capturas } = criarServico({
      mesesEnv: 6,
      idsInativos: [],
    });

    const antes = new Date();
    antes.setMonth(antes.getMonth() - 6);
    await service.purgarInativos();
    const depois = new Date();
    depois.setMonth(depois.getMonth() - 6);

    const limite = capturas.findManyWhere?.desligadoEm.lte as Date;
    expect(limite.getTime()).toBeGreaterThanOrEqual(antes.getTime());
    expect(limite.getTime()).toBeLessThanOrEqual(depois.getTime());
  });

  it('não faz nada quando não há inativos elegíveis', async () => {
    const { service, capturas } = criarServico({ idsInativos: [] });
    const resumo = await service.purgarInativos();
    expect(resumo.colaboradores).toBe(0);
    expect(capturas.apagados).toEqual([]);
  });

  it('apaga a ficha e o histórico de RRHH dos inativos elegíveis', async () => {
    const { service, capturas } = criarServico({
      idsInativos: ['c1', 'c2'],
    });
    const resumo = await service.purgarInativos();
    expect(capturas.apagados).toEqual(['c1', 'c2']);
    expect(resumo.colaboradores).toBe(2);
    expect(resumo.ausencias).toBe(1);
    expect(resumo.incidencias).toBe(2);
    expect(resumo.solicitacoesAdvertencia).toBe(3);
    expect(resumo.decisoesContrato).toBe(4);
    expect(resumo.pontos).toBe(5);
    expect(resumo.escalas).toBe(6);
  });
});
