import { LoteApaeService } from './lote-apae.service';
import { SaldoInvalidoError } from './lote-apae.errors';

/**
 * Testes de exemplo (unitários) do `LoteApaeService`. Usam um `PrismaService`
 * falso (em memória) exercitando o ciclo de lote (registrar, atualizar saldo,
 * reiniciar e histórico) sem banco de dados.
 */
describe('LoteApaeService', () => {
  interface LoteFake {
    id: string;
    quantidadeInicial: number;
    saldoAtual: number;
    quantidadeVendida: number;
    dataInicio: Date;
    dataEncerramento: Date | null;
    status: string;
  }

  function criarServico(): { service: LoteApaeService; lotes: LoteFake[] } {
    const lotes: LoteFake[] = [];
    let seq = 0;

    const loteApae = {
      create: ({
        data,
      }: {
        data: Omit<LoteFake, 'id' | 'dataEncerramento'> & {
          dataEncerramento?: Date | null;
        };
      }) => {
        const novo: LoteFake = {
          id: `lote${++seq}`,
          quantidadeInicial: data.quantidadeInicial,
          saldoAtual: data.saldoAtual,
          quantidadeVendida: data.quantidadeVendida,
          dataInicio: data.dataInicio,
          dataEncerramento: data.dataEncerramento ?? null,
          status: data.status,
        };
        lotes.push(novo);
        return Promise.resolve({ ...novo });
      },
      findUnique: ({ where: { id } }: { where: { id: string } }) => {
        const lote = lotes.find((l) => l.id === id);
        return Promise.resolve(lote ? { ...lote } : null);
      },
      update: ({
        where: { id },
        data,
      }: {
        where: { id: string };
        data: Partial<LoteFake>;
      }) => {
        const lote = lotes.find((l) => l.id === id);
        if (!lote) {
          return Promise.reject(new Error('não encontrado'));
        }
        Object.assign(lote, data);
        return Promise.resolve({ ...lote });
      },
      findMany: (args?: {
        where?: { status?: string };
        orderBy?: { dataEncerramento?: 'asc' | 'desc' };
      }) => {
        let lista = [...lotes];
        if (args?.where?.status) {
          lista = lista.filter((l) => l.status === args.where!.status);
        }
        if (args?.orderBy?.dataEncerramento) {
          const dir = args.orderBy.dataEncerramento === 'desc' ? -1 : 1;
          lista.sort(
            (a, b) =>
              ((a.dataEncerramento?.getTime() ?? 0) -
                (b.dataEncerramento?.getTime() ?? 0)) *
              dir,
          );
        }
        return Promise.resolve(lista.map((l) => ({ ...l })));
      },
    };

    const prismaFake = {
      loteApae,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: async (fn: (tx: any) => Promise<any>) => fn({ loteApae }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { service: new LoteApaeService(prismaFake as any), lotes };
  }

  it('registra o lote inicial com saldo igual à quantidade e nada vendido', async () => {
    const { service } = criarServico();
    const lote = await service.registrarLoteInicial(500);
    expect(lote.quantidadeInicial).toBe(500);
    expect(lote.saldoAtual).toBe(500);
    expect(lote.quantidadeVendida).toBe(0);
    expect(lote.status).toBe('ABERTO');
  });

  it('atualiza o saldo calculando a quantidade vendida e o percentual', async () => {
    const { service } = criarServico();
    const lote = await service.registrarLoteInicial(200);
    const atualizado = await service.atualizarSaldo(lote.id, 150);
    expect(atualizado.quantidadeVendida).toBe(50);
    expect(service.percentualVendido(atualizado)).toBeCloseTo(0.25, 6);
  });

  it('rejeita saldo atual maior que o anterior (Req 2.6.4)', async () => {
    const { service } = criarServico();
    const lote = await service.registrarLoteInicial(200);
    await service.atualizarSaldo(lote.id, 100);
    await expect(service.atualizarSaldo(lote.id, 150)).rejects.toBeInstanceOf(
      SaldoInvalidoError,
    );
  });

  it('reinicia o lote preservando o histórico e zerando a vendida do novo', async () => {
    const { service } = criarServico();
    const lote = await service.registrarLoteInicial(100);
    await service.atualizarSaldo(lote.id, 0); // tudo vendido
    const { encerrado, novo } = await service.reiniciarLote(lote.id, 300);

    expect(encerrado.status).toBe('ENCERRADO');
    expect(encerrado.quantidadeInicial).toBe(100);
    expect(encerrado.quantidadeVendida).toBe(100);
    expect(encerrado.dataEncerramento).not.toBeNull();

    expect(novo.status).toBe('ABERTO');
    expect(novo.quantidadeInicial).toBe(300);
    expect(novo.quantidadeVendida).toBe(0);

    const historico = await service.historicoLotes();
    expect(historico).toHaveLength(1);
    expect(historico[0].id).toBe(encerrado.id);
  });
});
