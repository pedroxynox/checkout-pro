import { PrismaService } from '../prisma/prisma.service';
import { CONFIG_METAS } from './metas.domain';
import { MetaDerivadaNaoEditavelError } from './metas.errors';
import { MetasService } from './metas.service';

/**
 * Testes de wiring do MetasService com Prisma mockado. Cobrem a mudança de
 * fonte da meta de VENDAS (ADR 0017): ela passa a ser a soma das estimativas
 * diárias do mês, deixa de aceitar valor digitado e ignora tanto o registro em
 * `metas_mensais` quanto a meta legada de `config_vendas`.
 *
 * As quatro metas digitadas devem continuar funcionando exatamente como antes.
 */
describe('MetasService', () => {
  interface Deps {
    /** Valores das estimativas diárias do mês. */
    estimativas?: number[];
    /** Registros salvos em `metas_mensais`. */
    salvos?: { tipo: string; meta: number }[];
    /** Simula tabela ainda não migrada. */
    metaMensalThrows?: boolean;
    estimativasThrows?: boolean;
  }

  function criarServico(deps: Deps = {}) {
    const estimativaFindMany = jest.fn(() => {
      if (deps.estimativasThrows) {
        return Promise.reject(new Error('no table'));
      }
      return Promise.resolve(
        (deps.estimativas ?? []).map((valor) => ({ valor })),
      );
    });
    const metaMensalFindUnique = jest.fn(
      (args: { where: { tipo_anoMes: { tipo: string } } }) => {
        if (deps.metaMensalThrows) return Promise.reject(new Error('no table'));
        const achado = (deps.salvos ?? []).find(
          (s) => s.tipo === args.where.tipo_anoMes.tipo,
        );
        return Promise.resolve(achado ? { meta: achado.meta } : null);
      },
    );
    const metaMensalFindMany = jest.fn(() => {
      if (deps.metaMensalThrows) return Promise.reject(new Error('no table'));
      return Promise.resolve(deps.salvos ?? []);
    });
    const metaMensalUpsert = jest.fn(() => Promise.resolve({}));
    const configVendasFindUnique = jest.fn(() =>
      Promise.resolve({ metaMensal: 999999 }),
    );

    const prismaFake = {
      estimativaVendaDia: { findMany: estimativaFindMany },
      metaMensal: {
        findUnique: metaMensalFindUnique,
        findMany: metaMensalFindMany,
        upsert: metaMensalUpsert,
      },
      configVendas: { findUnique: configVendasFindUnique },
    };

    return {
      service: new MetasService(prismaFake as unknown as PrismaService),
      estimativaFindMany,
      metaMensalUpsert,
      configVendasFindUnique,
    };
  }

  describe('resolver — VENDAS (meta derivada)', () => {
    it('devolve a soma das estimativas diárias do mês', async () => {
      const { service } = criarServico({ estimativas: [10000, 5000, 2500.5] });
      await expect(service.resolver('VENDAS', '2026-06')).resolves.toBe(
        17500.5,
      );
    });

    it('devolve 0 quando o mês não tem estimativas', async () => {
      const { service } = criarServico({ estimativas: [] });
      await expect(service.resolver('VENDAS', '2026-06')).resolves.toBe(0);
    });

    it('consulta somente o intervalo do mês pedido (UTC, fim exclusivo)', async () => {
      const { service, estimativaFindMany } = criarServico({
        estimativas: [100],
      });
      await service.resolver('VENDAS', '2026-06');
      expect(estimativaFindMany).toHaveBeenCalledWith({
        where: {
          data: {
            gte: new Date('2026-06-01T00:00:00.000Z'),
            lt: new Date('2026-07-01T00:00:00.000Z'),
          },
        },
        select: { valor: true },
      });
    });

    it('ignora registro digitado em metas_mensais (estimativas mandam)', async () => {
      const { service } = criarServico({
        estimativas: [7000],
        salvos: [{ tipo: 'VENDAS', meta: 500000 }],
      });
      await expect(service.resolver('VENDAS', '2026-06')).resolves.toBe(7000);
    });

    it('não consulta mais a meta legada de config_vendas', async () => {
      const { service, configVendasFindUnique } = criarServico({
        estimativas: [],
      });
      await service.resolver('VENDAS', '2026-06');
      expect(configVendasFindUnique).not.toHaveBeenCalled();
    });

    it('não derruba a chamada se a tabela de estimativas faltar', async () => {
      const { service } = criarServico({ estimativasThrows: true });
      await expect(service.resolver('VENDAS', '2026-06')).resolves.toBe(0);
    });
  });

  describe('resolver — metas digitadas (inalteradas)', () => {
    it('usa o valor salvo do mês quando existe', async () => {
      const { service } = criarServico({
        salvos: [{ tipo: 'RECARGAS_CELULAR', meta: 3500 }],
      });
      await expect(
        service.resolver('RECARGAS_CELULAR', '2026-06'),
      ).resolves.toBe(3500);
    });

    it('cai no valor padrão quando o mês não foi definido', async () => {
      const { service } = criarServico({ salvos: [] });
      await expect(service.resolver('DEVOLUCOES', '2026-06')).resolves.toBe(
        CONFIG_METAS.DEVOLUCOES.valorPadrao,
      );
    });

    it('cai no valor padrão se a tabela ainda não foi migrada', async () => {
      const { service } = criarServico({ metaMensalThrows: true });
      await expect(
        service.resolver('CANCELAMENTO_ITENS', '2026-06'),
      ).resolves.toBe(CONFIG_METAS.CANCELAMENTO_ITENS.valorPadrao);
    });
  });

  describe('definir', () => {
    it('recusa a meta de VENDAS (é derivada das estimativas)', async () => {
      const { service, metaMensalUpsert } = criarServico();
      await expect(
        service.definir('VENDAS', '2026-06', 500000),
      ).rejects.toThrow(MetaDerivadaNaoEditavelError);
      expect(metaMensalUpsert).not.toHaveBeenCalled();
    });

    it('salva normalmente as metas digitadas', async () => {
      const { service, metaMensalUpsert } = criarServico();
      const view = await service.definir(
        'RECARGAS_CELULAR',
        '2026-06',
        4000,
        'gestor-1',
      );
      expect(metaMensalUpsert).toHaveBeenCalledTimes(1);
      expect(view).toMatchObject({
        tipo: 'RECARGAS_CELULAR',
        meta: 4000,
        definida: true,
        derivada: false,
      });
    });
  });

  describe('listar', () => {
    it('marca VENDAS como derivada, com a soma das estimativas', async () => {
      const { service } = criarServico({ estimativas: [10000, 10000] });
      const lista = await service.listar('2026-06');
      const vendas = lista.find((m) => m.tipo === 'VENDAS');
      expect(vendas).toMatchObject({
        meta: 20000,
        derivada: true,
        definida: true,
      });
      expect(vendas?.origem).toContain('estimativas');
    });

    it('marca VENDAS como não definida quando o mês está sem estimativas', async () => {
      const { service } = criarServico({ estimativas: [] });
      const vendas = (await service.listar('2026-06')).find(
        (m) => m.tipo === 'VENDAS',
      );
      expect(vendas).toMatchObject({
        meta: 0,
        definida: false,
        derivada: true,
      });
    });

    it('devolve os 5 tipos, com só VENDAS derivada', async () => {
      const { service } = criarServico();
      const lista = await service.listar('2026-06');
      expect(lista).toHaveLength(5);
      expect(lista.filter((m) => m.derivada).map((m) => m.tipo)).toEqual([
        'VENDAS',
      ]);
    });
  });
});
