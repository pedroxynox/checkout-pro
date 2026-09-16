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


/**
 * O DETALHE do mês (ADR 0022): o teto de sacolas, os dias de entrada, o cruze
 * consumo × entrada e a projeção do fechamento.
 *
 * Prisma falso mais completo que o de cima: o detalhe também lê estimativas,
 * consumo e a lista de movimentos com data/origem/responsável.
 */
function criarServicoDetalhe(opcoes: {
  entradas?: { delta: number; dataHora: Date; origem?: string | null; responsavelNome?: string | null }[];
  saidas?: { delta: number; dataHora: Date }[];
  vendasPorDia?: Record<string, number>;
  estimativasPorDia?: Record<string, number>;
  meta?: number;
}) {
  const {
    entradas = [],
    saidas = [],
    vendasPorDia = {},
    estimativasPorDia = {},
    meta = 28,
  } = opcoes;

  const movimentos = [
    ...entradas.map((e) => ({
      delta: e.delta,
      dataHora: e.dataHora,
      origem: e.origem ?? 'ENTRADA',
      responsavelNome: e.responsavelNome ?? 'Gerente',
    })),
    ...saidas.map((sa) => ({
      delta: sa.delta,
      dataHora: sa.dataHora,
      origem: 'CONSUMO',
      responsavelNome: 'Fiscal',
    })),
  ];

  const dentro = (d: Date, w: { gte: Date; lt: Date }): boolean =>
    d >= w.gte && d < w.lt;

  const prismaFake = {
    movimentoEstoque: {
      findMany: jest.fn(
        async (args: {
          where: { dataHora: { gte: Date; lt: Date }; delta?: { gt?: number; lt?: number } };
          orderBy?: { dataHora?: 'asc' | 'desc' };
        }) => {
          const w = args.where.dataHora;
          const filtrados = movimentos.filter((m) => {
            if (!dentro(m.dataHora, w)) return false;
            if (args.where.delta?.gt != null) return m.delta > args.where.delta.gt;
            if (args.where.delta?.lt != null) return m.delta < args.where.delta.lt;
            return true;
          });
          // O serviço pede `orderBy: { dataHora: 'desc' }` e a tela conta com a
          // ordem — o falso precisa respeitá-la para o teste valer algo.
          if (args.orderBy?.dataHora === 'desc') {
            filtrados.sort((a, b) => b.dataHora.getTime() - a.dataHora.getTime());
          }
          return filtrados;
        },
      ),
      aggregate: jest.fn(
        async (args: { where: { dataHora: { gte: Date; lt: Date } } }) => {
          const w = args.where.dataHora;
          const soma = movimentos
            .filter((m) => dentro(m.dataHora, w) && m.delta < 0)
            .reduce((s, m) => s + m.delta, 0);
          return { _sum: { delta: soma } };
        },
      ),
    },
    vendaDiaria: {
      aggregate: jest.fn(
        async (args: { where: { data: { gte: Date } } }) => {
          const mes = args.where.data.gte.toISOString().slice(0, 7);
          const soma = Object.entries(vendasPorDia)
            .filter(([dia]) => dia.startsWith(mes))
            .reduce((s, [, v]) => s + v, 0);
          return { _sum: { valor: soma } };
        },
      ),
      findMany: jest.fn(async (args: { where: { data: { gte: Date } } }) => {
        const mes = args.where.data.gte.toISOString().slice(0, 7);
        return Object.entries(vendasPorDia)
          .filter(([dia]) => dia.startsWith(mes))
          .map(([dia, valor]) => ({ data: new Date(`${dia}T00:00:00.000Z`), valor }));
      }),
    },
    estimativaVendaDia: {
      findMany: jest.fn(async (args: { where: { data: { gte: Date } } }) => {
        const mes = args.where.data.gte.toISOString().slice(0, 7);
        return Object.entries(estimativasPorDia)
          .filter(([dia]) => dia.startsWith(mes))
          .map(([dia, valor]) => ({ data: new Date(`${dia}T00:00:00.000Z`), valor }));
      }),
    },
    insumo: { findFirst: jest.fn().mockResolvedValue({ fatorEmbalagem: 1000 }) },
  };
  const metasFake = { resolver: jest.fn().mockResolvedValue(meta) };
  return new IndicadorSacolasService(prismaFake as never, metasFake as never);
}

const dh = (iso: string) => new Date(`${iso}T10:00:00.000Z`);

describe('IndicadorSacolasService.detalhe — o teto de sacolas', () => {
  it('diz quantos fardos ainda cabem sem furar a meta', async () => {
    // Realizado até 16/09: R$ 1,5 mi. Estimativas dos dias 17 a 20: R$ 1,5 mi.
    // Venda esperada = R$ 3 mi → teto = 107 fardos. Já entraram 100.
    const service = criarServicoDetalhe({
      entradas: [{ delta: 100_000, dataHora: dh('2026-09-05') }],
      vendasPorDia: { '2026-09-10': 1_500_000 },
      estimativasPorDia: {
        '2026-09-17': 500_000,
        '2026-09-18': 500_000,
        '2026-09-19': 500_000,
      },
    });
    const d = await service.detalhe('2026-09', HOJE);

    expect(d.vendaEsperada.fonte).toBe('ESTIMATIVA');
    expect(d.vendaEsperada.valor).toBe(3_000_000);
    expect(d.teto?.tetoFardos).toBe(107);
    expect(d.teto?.podemEntrarFardos).toBe(7);
    expect(d.teto?.tetoEstourado).toBe(false);
  });

  it('teto estourado: mostra a venda que faltaria para justificar o recebido', async () => {
    const service = criarServicoDetalhe({
      entradas: [{ delta: 200_000, dataHora: dh('2026-09-05') }],
      vendasPorDia: { '2026-09-10': 1_500_000 },
      estimativasPorDia: { '2026-09-20': 1_500_000 },
    });
    const d = await service.detalhe('2026-09', HOJE);

    expect(d.vendaEsperada.valor).toBe(3_000_000);
    expect(d.teto?.tetoEstourado).toBe(true);
    expect(d.teto?.podemEntrarFardos).toBe(0);
    expect(d.teto?.vendaNecessaria).toBe(5_600_000);
  });

  it('lista os dias em que entrou sacola, com fardos, origem e responsável', async () => {
    const service = criarServicoDetalhe({
      entradas: [
        { delta: 50_000, dataHora: dh('2026-09-05'), responsavelNome: 'Ana' },
        { delta: 50_000, dataHora: dh('2026-09-12'), origem: 'REQUISICAO' },
      ],
      vendasPorDia: { '2026-09-10': 3_000_000 },
    });
    const d = await service.detalhe('2026-09', HOJE);

    expect(d.entradas).toHaveLength(2);
    // Mais recente primeiro.
    expect(d.entradas[0].data).toBe('2026-09-12');
    expect(d.entradas[0].fardos).toBe(50);
    expect(d.entradas[0].origem).toBe('REQUISICAO');
    expect(d.entradas[1].responsavelNome).toBe('Ana');
  });

  it('o estoque inicial não aparece na lista de entradas', async () => {
    const service = criarServicoDetalhe({
      entradas: [
        { delta: 200_000, dataHora: dh('2026-09-02'), origem: 'ESTOQUE_INICIAL' },
        { delta: 100_000, dataHora: dh('2026-09-05') },
      ],
      vendasPorDia: { '2026-09-10': 3_000_000 },
    });
    const d = await service.detalhe('2026-09', HOJE);

    expect(d.entradas).toHaveLength(1);
    expect(d.indicador.sacolasRecebidas).toBe(100_000);
  });

  it('distingue acúmulo de estoque de desperdício', async () => {
    const service = criarServicoDetalhe({
      entradas: [{ delta: 200_000, dataHora: dh('2026-09-05') }],
      saidas: [{ delta: -150_000, dataHora: dh('2026-09-10') }],
      vendasPorDia: { '2026-09-10': 3_000_000 },
    });
    const d = await service.detalhe('2026-09', HOJE);

    expect(d.consumoVsEntrada.sacolasConsumidas).toBe(150_000);
    expect(d.consumoVsEntrada.variacaoEstoque).toBe(50_000);
    expect(d.consumoVsEntrada.porEntrada).toBe(15);
    expect(d.consumoVsEntrada.porConsumo).toBe(20);
    expect(d.consumoVsEntrada.leitura).toContain('não é desperdício');
  });

  it('a série cobre todos os dias do mês, com venda, estimativa e consumo', async () => {
    const service = criarServicoDetalhe({
      entradas: [{ delta: 100_000, dataHora: dh('2026-09-05') }],
      saidas: [{ delta: -10_000, dataHora: dh('2026-09-06') }],
      vendasPorDia: { '2026-09-06': 100_000 },
      estimativasPorDia: { '2026-09-20': 90_000 },
    });
    const d = await service.detalhe('2026-09', HOJE);

    expect(d.serie).toHaveLength(30); // setembro
    const dia6 = d.serie.find((x) => x.data === '2026-09-06');
    expect(dia6).toMatchObject({ venda: 100_000, consumo: 10_000, entrada: 0 });
    const dia5 = d.serie.find((x) => x.data === '2026-09-05');
    expect(dia5?.entrada).toBe(100_000);
    expect(d.serie.find((x) => x.data === '2026-09-20')?.estimativa).toBe(90_000);
    expect(d.serie.find((x) => x.data === '2026-09-01')?.estimativa).toBeNull();
  });

  it('projeta o fechamento supondo a 2ª entrega do ciclo quinzenal', async () => {
    // Uma entrega só até agora e faltam dias no mês → supõe outra igual.
    const service = criarServicoDetalhe({
      entradas: [{ delta: 100_000, dataHora: dh('2026-09-05') }],
      vendasPorDia: { '2026-09-10': 1_500_000 },
      estimativasPorDia: { '2026-09-20': 1_500_000 },
    });
    const d = await service.detalhe('2026-09', HOJE);

    expect(d.projecao.sacolasPrevistas).toBe(100_000);
    expect(d.projecao.sacolasNoFechamento).toBe(200_000);
    expect(d.projecao.valor).toBe(15);
    expect(d.projecao.cumprira).toBe(false);
    // A suposição fica escrita, nunca implícita.
    expect(d.projecao.baseDaPrevisao).toContain('quinzenal');
  });

  it('com as 2 entregas do mês já recebidas, não supõe uma terceira', async () => {
    const service = criarServicoDetalhe({
      entradas: [
        { delta: 50_000, dataHora: dh('2026-09-05') },
        { delta: 50_000, dataHora: dh('2026-09-12') },
      ],
      vendasPorDia: { '2026-09-10': 3_000_000 },
    });
    const d = await service.detalhe('2026-09', HOJE);

    expect(d.projecao.sacolasPrevistas).toBe(0);
    expect(d.projecao.baseDaPrevisao).toContain('Não supõe entrega nova');
  });

  it('mês fechado: venda esperada é o realizado e não prevê entrega', async () => {
    const service = criarServicoDetalhe({
      entradas: [{ delta: 100_000, dataHora: dh('2026-08-05') }],
      vendasPorDia: { '2026-08-10': 2_800_000 },
    });
    const d = await service.detalhe('2026-08', HOJE);

    expect(d.vendaEsperada.fonte).toBe('REALIZADO');
    expect(d.vendaEsperada.fracaoRealizada).toBe(1);
    expect(d.projecao.sacolasPrevistas).toBe(0);
    expect(d.projecao.baseDaPrevisao).toContain('Mês fechado');
  });

  it('sem estimativas futuras, a venda esperada vem do ritmo', async () => {
    const service = criarServicoDetalhe({
      entradas: [{ delta: 100_000, dataHora: dh('2026-09-05') }],
      vendasPorDia: { '2026-09-10': 100_000, '2026-09-11': 100_000 },
    });
    const d = await service.detalhe('2026-09', HOJE);

    expect(d.vendaEsperada.fonte).toBe('RUN_RATE');
    // 200.000 em 2 dias com venda × 30 dias = 3.000.000.
    expect(d.vendaEsperada.valor).toBe(3_000_000);
  });
});
