import { InsumosService } from './insumos.service';
import { FardoNaoReconhecidoError } from './insumos.errors';
import { QuantidadeInvalidaError } from './insumos.errors';
import { EstoqueInsuficienteError } from './insumos.errors';

/**
 * Testes de exemplo (unitários) do `InsumosService`. Usam um `PrismaService`
 * falso (em memória) exercitando o saldo por soma de movimentos, a retirada de
 * fardo por código de barras, o consumo de bobinas/insumos e o alerta de
 * estoque baixo, sem banco de dados.
 */
describe('InsumosService', () => {
  interface InsumoFake {
    id: string;
    nome: string;
    categoria: string;
    saldo: number;
    limiteMinimo: number;
  }
  interface FardoFake {
    id: string;
    codigoBarras: string;
    quantidadeSacolas: number;
  }
  interface MovFake {
    id: string;
    insumoId: string;
    delta: number;
    responsavelId?: string | null;
    destino?: string | null;
    pdvId?: string | null;
    dataHora: Date;
  }

  function criarServico() {
    const insumos: InsumoFake[] = [];
    const fardos: FardoFake[] = [];
    const movimentos: MovFake[] = [];
    let seq = 0;

    const prismaFake = {
      insumo: {
        create: ({ data }: { data: Omit<InsumoFake, 'id'> }) => {
          const novo: InsumoFake = { id: `ins${++seq}`, ...data };
          insumos.push(novo);
          return Promise.resolve({ ...novo });
        },
        findUnique: ({ where: { id } }: { where: { id: string } }) => {
          const i = insumos.find((x) => x.id === id);
          return Promise.resolve(i ? { ...i } : null);
        },
        findMany: () =>
          Promise.resolve(
            insumos
              .slice()
              .sort((a, b) => a.nome.localeCompare(b.nome))
              .map((i) => ({ ...i })),
          ),
      },
      fardo: {
        findMany: () => Promise.resolve(fardos.map((f) => ({ ...f }))),
      },
      movimentoEstoque: {
        create: ({ data }: { data: Omit<MovFake, 'id' | 'dataHora'> }) => {
          const novo: MovFake = {
            id: `mov${++seq}`,
            dataHora: new Date(seq * 1000),
            ...data,
          };
          movimentos.push(novo);
          return Promise.resolve({ ...novo });
        },
        findMany: ({
          where: { insumoId },
          select,
        }: {
          where: { insumoId: string | { in: string[] } };
          select?: { insumoId?: boolean; delta?: boolean; dataHora?: boolean };
          orderBy?: unknown;
        }) => {
          const casa = (m: MovFake): boolean =>
            typeof insumoId === 'object' &&
            insumoId !== null &&
            'in' in insumoId
              ? insumoId.in.includes(m.insumoId)
              : m.insumoId === insumoId;
          const lista = movimentos.filter(casa).map((m) => {
            if (!select) return { ...m };
            const out: Partial<MovFake> = {};
            if (select.insumoId) out.insumoId = m.insumoId;
            if (select.delta) out.delta = m.delta;
            if (select.dataHora) out.dataHora = m.dataHora;
            return out;
          });
          return Promise.resolve(lista);
        },
        aggregate: ({
          where: { insumoId },
        }: {
          where: { insumoId: string };
          _sum?: { delta?: boolean };
        }) => {
          const soma = movimentos
            .filter((m) => m.insumoId === insumoId)
            .reduce((acc, m) => acc + m.delta, 0);
          return Promise.resolve({ _sum: { delta: soma } });
        },
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new InsumosService(prismaFake as any);
    return { service, insumos, fardos, movimentos, prismaFake };
  }

  it('cadastra insumo e registra saldo inicial como movimento de entrada', async () => {
    const { service } = criarServico();
    const insumo = await service.cadastrarInsumo('Pano', 'PANO' as any, 5, 20);
    expect(await service.saldo(insumo.id)).toBe(20);
  });

  it('registra retirada de fardo reduzindo o saldo pela quantidade de sacolas', async () => {
    const { service, fardos } = criarServico();
    const sacolas = await service.cadastrarInsumo(
      'Sacolas',
      'SACOLA' as any,
      100,
      1000,
    );
    fardos.push({ id: 'f1', codigoBarras: '789', quantidadeSacolas: 250 });
    const saldo = await service.registrarRetiradaFardo({
      codigoBarras: '789',
      insumoId: sacolas.id,
      destino: 'Caixa 01',
    });
    expect(saldo).toBe(750);
  });

  it('rejeita fardo não reconhecido sem alterar o saldo (Req 3.1.3)', async () => {
    const { service } = criarServico();
    const sacolas = await service.cadastrarInsumo(
      'Sacolas',
      'SACOLA' as any,
      100,
      500,
    );
    await expect(
      service.registrarRetiradaFardo({
        codigoBarras: 'INEXISTENTE',
        insumoId: sacolas.id,
      }),
    ).rejects.toBeInstanceOf(FardoNaoReconhecidoError);
    expect(await service.saldo(sacolas.id)).toBe(500);
  });

  it('registra consumo de bobina por PDV reduzindo o saldo', async () => {
    const { service } = criarServico();
    const bobina = await service.cadastrarInsumo(
      'Bobina',
      'BOBINA' as any,
      10,
      100,
    );
    const saldo = await service.registrarConsumoBobina(bobina.id, 'PDV-07', 30);
    expect(saldo).toBe(70);
  });

  it('rejeita consumo de quantidade inválida', async () => {
    const { service } = criarServico();
    const insumo = await service.cadastrarInsumo(
      'Insumo',
      'OUTRO' as any,
      1,
      10,
    );
    await expect(
      service.registrarConsumoInsumo(insumo.id, 0),
    ).rejects.toBeInstanceOf(QuantidadeInvalidaError);
  });

  it('rejeita consumo maior que o saldo e mantém o saldo inalterado', async () => {
    const { service } = criarServico();
    const insumo = await service.cadastrarInsumo(
      'Álcool',
      'ALCOOL' as any,
      1,
      5,
    );
    await expect(
      service.registrarConsumoInsumo(insumo.id, 6),
    ).rejects.toBeInstanceOf(EstoqueInsuficienteError);
    // O saldo NÃO foi alterado (nenhum movimento negativo foi gravado).
    expect(await service.saldo(insumo.id)).toBe(5);
  });

  it('bloqueia consumo quando o saldo é 0 (não deixa ir a negativo)', async () => {
    const { service } = criarServico();
    const insumo = await service.cadastrarInsumo(
      'Álcool',
      'ALCOOL' as any,
      1,
      0,
    );
    await expect(
      service.registrarConsumoInsumo(insumo.id, 1),
    ).rejects.toBeInstanceOf(EstoqueInsuficienteError);
    expect(await service.saldo(insumo.id)).toBe(0);
  });

  it('permite consumir exatamente o saldo disponível (deixando 0)', async () => {
    const { service } = criarServico();
    const insumo = await service.cadastrarInsumo(
      'Álcool',
      'ALCOOL' as any,
      1,
      5,
    );
    const saldo = await service.registrarConsumoInsumo(insumo.id, 5);
    expect(saldo).toBe(0);
  });

  it('rejeita retirada de fardo maior que o saldo de sacolas', async () => {
    const { service, fardos } = criarServico();
    const sacolas = await service.cadastrarInsumo(
      'Sacolas',
      'SACOLA' as any,
      100,
      200,
    );
    fardos.push({ id: 'f1', codigoBarras: '789', quantidadeSacolas: 250 });
    await expect(
      service.registrarRetiradaFardo({
        codigoBarras: '789',
        insumoId: sacolas.id,
      }),
    ).rejects.toBeInstanceOf(EstoqueInsuficienteError);
    expect(await service.saldo(sacolas.id)).toBe(200);
  });

  it('emite alerta de estoque baixo na fronteira do limite (Req 3.1.5)', async () => {
    const { service } = criarServico();
    const insumo = await service.cadastrarInsumo(
      'Insumo',
      'OUTRO' as any,
      50,
      60,
    );
    expect(await service.verificarEstoqueBaixo(insumo.id)).toBe(false);
    await service.registrarConsumoInsumo(insumo.id, 10); // saldo = 50 = limite
    expect(await service.verificarEstoqueBaixo(insumo.id)).toBe(true);
  });

  it('listarInsumos faz UMA única busca de movimentos (sem N+1) e calcula o resumo por insumo', async () => {
    const { service, prismaFake } = criarServico();
    // Três insumos com saldos distintos (cada cadastro gera 1 movimento de entrada).
    const a = await service.cadastrarInsumo('A-Pano', 'PANO' as any, 5, 30);
    const b = await service.cadastrarInsumo('B-Bobina', 'BOBINA' as any, 5, 10);
    const c = await service.cadastrarInsumo('C-Sacola', 'SACOLA' as any, 5, 50);

    const spy = jest.spyOn(prismaFake.movimentoEstoque, 'findMany');
    const lista = await service.listarInsumos();
    // Uma única consulta de movimentos, independentemente do número de insumos.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({
      where: { insumoId: { in: [a.id, b.id, c.id] } },
    });

    const porId = new Map(lista.map((i) => [i.id, i]));
    expect(porId.get(a.id)?.saldo).toBe(30);
    expect(porId.get(b.id)?.saldo).toBe(10);
    expect(porId.get(c.id)?.saldo).toBe(50);
  });

  it('saldo retorna a soma agregada dos deltas (_sum.delta)', async () => {
    const { service, prismaFake } = criarServico();
    const insumo = await service.cadastrarInsumo(
      'Insumo',
      'OUTRO' as any,
      5,
      100,
    );
    await service.registrarConsumoInsumo(insumo.id, 40); // 100 - 40 = 60
    const spy = jest.spyOn(prismaFake.movimentoEstoque, 'aggregate');
    expect(await service.saldo(insumo.id)).toBe(60);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({
      where: { insumoId: insumo.id },
      _sum: { delta: true },
    });
  });
});
