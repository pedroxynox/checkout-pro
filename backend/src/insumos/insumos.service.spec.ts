import { InsumosService } from './insumos.service';
import { FardoNaoReconhecidoError } from './insumos.errors';
import { QuantidadeInvalidaError } from './insumos.errors';

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
          where: { insumoId: string };
          select?: { delta?: boolean };
          orderBy?: unknown;
        }) => {
          const lista = movimentos
            .filter((m) => m.insumoId === insumoId)
            .map((m) => (select?.delta ? { delta: m.delta } : { ...m }));
          return Promise.resolve(lista);
        },
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new InsumosService(prismaFake as any);
    return { service, insumos, fardos, movimentos };
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
});
