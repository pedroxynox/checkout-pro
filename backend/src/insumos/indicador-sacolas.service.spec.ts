import { IndicadorSacolasService } from './indicador-sacolas.service';

/**
 * Serviço do indicador SACOLAS (ADR 0022).
 *
 * Cobre o que só se vê com banco no meio: o **estoque inicial fora da conta**,
 * a soma por **categoria** (e não por nome do item), a contagem de entregas, o
 * mês em andamento e a comparação com o mês anterior.
 *
 * "Hoje" é 16/09/2026, então setembro é parcial e agosto é fechado.
 */
const HOJE = new Date('2026-09-16T12:00:00.000Z');

/** Um movimento de entrada como o Prisma o devolveria. */
function entrada(delta: number, origem: string | null = 'ENTRADA') {
  return { delta, origem };
}

/**
 * Prisma falso. `movimentosPorMes` é indexado por "AAAA-MM" para o teste poder
 * dar entradas diferentes a setembro e agosto (o serviço consulta os dois).
 */
function criarServico(opcoes: {
  movimentosPorMes?: Record<string, ReturnType<typeof entrada>[]>;
  vendaPorMes?: Record<string, number>;
  fatorEmbalagem?: number | null;
  meta?: number;
}) {
  const {
    movimentosPorMes = {},
    vendaPorMes = {},
    fatorEmbalagem = 1000,
    meta = 28,
  } = opcoes;

  /** "AAAA-MM" do início da janela consultada. */
  const mesDaConsulta = (where: { gte: Date }): string =>
    where.gte.toISOString().slice(0, 7);

  const prismaFake = {
    movimentoEstoque: {
      findMany: jest.fn(async (args: { where: { dataHora: { gte: Date } } }) => {
        return movimentosPorMes[mesDaConsulta(args.where.dataHora)] ?? [];
      }),
    },
    vendaDiaria: {
      aggregate: jest.fn(async (args: { where: { data: { gte: Date } } }) => ({
        _sum: { valor: vendaPorMes[mesDaConsulta(args.where.data)] ?? 0 },
      })),
    },
    insumo: {
      findFirst: jest.fn().mockResolvedValue(
        fatorEmbalagem == null ? null : { fatorEmbalagem },
      ),
    },
  };
  const metasFake = { resolver: jest.fn().mockResolvedValue(meta) };
  const service = new IndicadorSacolasService(
    prismaFake as never,
    metasFake as never,
  );
  return { service, prismaFake, metasFake };
}

describe('IndicadorSacolasService.doMes', () => {
  it('calcula o exemplo do dono do projeto: 200 fardos e R$ 3 milhões', async () => {
    const { service } = criarServico({
      movimentosPorMes: { '2026-09': [entrada(200_000)] },
      vendaPorMes: { '2026-09': 3_000_000 },
    });
    const r = await service.doMes('2026-09', HOJE);

    expect(r.sacolasRecebidas).toBe(200_000);
    expect(r.fardosRecebidos).toBe(200);
    expect(r.vendaMes).toBe(3_000_000);
    expect(r.valor).toBe(15);
    expect(r.meta).toBe(28);
    expect(r.unidade).toBe('REAIS_POR_UNIDADE');
    expect(r.sentido).toBe('MAIOR_MELHOR');
    // R$ 15 contra piso de R$ 28: está bem abaixo.
    expect(r.nivel).toBe('FORA');
    expect(r.cumpriuMeta).toBe(false);
    expect(r.desvio).toMatchObject({ absoluto: -13, noPiso: false });
  });

  /**
   * O erro que este teste impede: as 200.000 sacolas de `ESTOQUE_INICIAL`
   * (migração `9i`) não foram uma compra. Somá-las cortaria o indicador do mês
   * de implantação pela metade — com um número plausível, que ninguém acharia.
   */
  it('IGNORA o estoque inicial no denominador', async () => {
    const { service } = criarServico({
      movimentosPorMes: {
        '2026-09': [
          entrada(200_000, 'ESTOQUE_INICIAL'),
          entrada(100_000, 'ENTRADA'),
        ],
      },
      vendaPorMes: { '2026-09': 3_000_000 },
    });
    const r = await service.doMes('2026-09', HOJE);

    expect(r.sacolasRecebidas).toBe(100_000); // não 300.000
    expect(r.entregas).toBe(1); // a linha do estoque inicial não é entrega
    expect(r.valor).toBe(30);
  });

  it('conta entradas de requisição, pedido recorrente e sem origem', async () => {
    const { service } = criarServico({
      movimentosPorMes: {
        '2026-09': [
          entrada(50_000, 'ENTRADA'),
          entrada(30_000, 'REQUISICAO'),
          entrada(10_000, 'PEDIDO_RECORRENTE'),
          entrada(10_000, null), // registro antigo, antes do campo existir
        ],
      },
      vendaPorMes: { '2026-09': 2_800_000 },
    });
    const r = await service.doMes('2026-09', HOJE);

    expect(r.sacolasRecebidas).toBe(100_000);
    expect(r.entregas).toBe(4);
    expect(r.valor).toBe(28);
    expect(r.nivel).toBe('OK'); // exatamente no piso
  });

  it('soma por CATEGORIA sacola, não por nome do item', async () => {
    const { service, prismaFake } = criarServico({
      movimentosPorMes: { '2026-09': [entrada(100_000)] },
      vendaPorMes: { '2026-09': 3_000_000 },
    });
    await service.doMes('2026-09', HOJE);

    const where = prismaFake.movimentoEstoque.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      delta: { gt: 0 },
      insumo: { categoria: 'SACOLA' },
    });
  });

  it('mês sem entrada não vira zero: devolve estado próprio e sem semáforo', async () => {
    const { service } = criarServico({
      movimentosPorMes: {},
      vendaPorMes: { '2026-09': 3_000_000 },
    });
    const r = await service.doMes('2026-09', HOJE);

    expect(r.estado).toBe('SEM_ENTRADA');
    expect(r.valor).toBeNull();
    expect(r.nivel).toBeNull();
    expect(r.cumpriuMeta).toBeNull();
    expect(r.resumo).toContain('Nenhuma sacola entrou');
  });

  it('mês com entrada mas sem venda aponta os arquivos que faltam', async () => {
    const { service } = criarServico({
      movimentosPorMes: { '2026-09': [entrada(100_000)] },
      vendaPorMes: {},
    });
    const r = await service.doMes('2026-09', HOJE);

    expect(r.estado).toBe('SEM_VENDA');
    expect(r.valor).toBeNull();
    expect(r.resumo).toContain('arquivos de venda');
  });

  it('compara com o mês anterior lendo pelo sentido (subir é melhorar)', async () => {
    const { service } = criarServico({
      movimentosPorMes: {
        '2026-09': [entrada(100_000)],
        '2026-08': [entrada(100_000)],
      },
      vendaPorMes: { '2026-09': 3_300_000, '2026-08': 3_000_000 },
    });
    const r = await service.doMes('2026-09', HOJE);

    expect(r.valor).toBe(33);
    expect(r.valorAnterior).toBe(30);
    expect(r.variacao).toBeCloseTo(10);
    expect(r.evolucao).toBe('MELHOROU');
  });

  it('marca o mês corrente como parcial e o fechado como definitivo', async () => {
    const { service } = criarServico({
      movimentosPorMes: { '2026-09': [entrada(100_000)], '2026-08': [entrada(100_000)] },
      vendaPorMes: { '2026-09': 3_000_000, '2026-08': 3_000_000 },
    });
    expect((await service.doMes('2026-09', HOJE)).parcial).toBe(true);
    expect((await service.doMes('2026-08', HOJE)).parcial).toBe(false);
  });

  it('avisa quando o mês teve só 1 entrega (o normal são 2)', async () => {
    const { service } = criarServico({
      movimentosPorMes: { '2026-09': [entrada(100_000)] },
      vendaPorMes: { '2026-09': 3_000_000 },
    });
    expect((await service.doMes('2026-09', HOJE)).avisoEntregas).toContain(
      'mais alto',
    );
  });

  it('mês com 2 entregas não gera aviso', async () => {
    const { service } = criarServico({
      movimentosPorMes: { '2026-09': [entrada(50_000), entrada(50_000)] },
      vendaPorMes: { '2026-09': 3_000_000 },
    });
    expect((await service.doMes('2026-09', HOJE)).avisoEntregas).toBeNull();
  });

  it('resolve a meta pelo MetasService, no mês pedido', async () => {
    const { service, metasFake } = criarServico({
      movimentosPorMes: { '2026-09': [entrada(100_000)] },
      vendaPorMes: { '2026-09': 3_000_000 },
      meta: 35,
    });
    const r = await service.doMes('2026-09', HOJE);

    expect(metasFake.resolver).toHaveBeenCalledWith('SACOLAS', '2026-09');
    expect(r.meta).toBe(35);
    expect(r.nivel).toBe('ATENCAO'); // R$ 30 contra piso de R$ 35
  });

  it('sem insumo de sacola cadastrado, usa 1000 sacolas por fardo', async () => {
    const { service } = criarServico({
      movimentosPorMes: { '2026-09': [entrada(200_000)] },
      vendaPorMes: { '2026-09': 3_000_000 },
      fatorEmbalagem: null,
    });
    const r = await service.doMes('2026-09', HOJE);
    expect(r.fatorEmbalagem).toBe(1000);
    expect(r.fardosRecebidos).toBe(200);
  });

  it('usa o fator do cadastro quando ele é diferente', async () => {
    const { service } = criarServico({
      movimentosPorMes: { '2026-09': [entrada(200_000)] },
      vendaPorMes: { '2026-09': 3_000_000 },
      fatorEmbalagem: 500,
    });
    const r = await service.doMes('2026-09', HOJE);
    expect(r.fardosRecebidos).toBe(400);
    // O indicador em R$/sacola NÃO depende do fator (usa a unidade base).
    expect(r.valor).toBe(15);
  });
});
