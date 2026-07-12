import { RequisicoesService } from './requisicoes.service';

/**
 * Testes do `RequisicoesService` com Prisma/serviços falsos: criação notifica
 * os gestores; aprovação gera entrada no estoque e notifica o solicitante;
 * requisição já decidida não pode ser aprovada novamente.
 */
describe('RequisicoesService', () => {
  const insumo = {
    id: 'i1',
    nome: 'Álcool',
    unidade: 'litro',
    embalagem: 'galão',
    fatorEmbalagem: 5,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function criarServico(reqExistente?: any) {
    const prismaFake = {
      insumo: { findUnique: jest.fn(() => Promise.resolve(insumo)) },
      usuario: {
        findUnique: jest.fn(() =>
          Promise.resolve({ id: 'u1', nome: 'Fulano', login: '1' }),
        ),
        findMany: jest.fn(() => Promise.resolve([{ id: 'g1' }, { id: 's1' }])),
      },
      requisicao: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: jest.fn(({ data }: any) =>
          Promise.resolve({
            id: 'r1',
            ...data,
            criadaEm: new Date(),
            decididaEm: null,
            decididaPorNome: null,
            motivo: null,
            insumo,
          }),
        ),
        findUnique: jest.fn(() => Promise.resolve(reqExistente ?? null)),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update: jest.fn(({ data }: any) =>
          Promise.resolve({ ...reqExistente, ...data, insumo }),
        ),
        findMany: jest.fn(() => Promise.resolve([])),
        count: jest.fn(() => Promise.resolve(0)),
      },
    };
    const notificacoes = { enviar: jest.fn(() => Promise.resolve([])) };
    const insumos = { registrarEntrada: jest.fn(() => Promise.resolve(100)) };
    const service = new RequisicoesService(
      prismaFake as never,
      notificacoes as never,
      insumos as never,
    );
    return { service, prismaFake, notificacoes, insumos };
  }

  it('cria requisição PENDENTE e notifica os gestores', async () => {
    const { service, notificacoes } = criarServico();
    const r = await service.criar('i1', 5, 'urgente', 'u1');
    expect(r.status).toBe('PENDENTE');
    expect(r.insumoNome).toBe('Álcool');
    expect(r.solicitanteNome).toBe('Fulano');
    expect(notificacoes.enviar).toHaveBeenCalledTimes(1);
  });

  it('aprova: gera entrada no estoque e notifica o solicitante', async () => {
    const { service, insumos, notificacoes } = criarServico({
      id: 'r1',
      insumoId: 'i1',
      quantidade: 5,
      status: 'PENDENTE',
      solicitanteId: 'u1',
    });
    const r = await service.aprovar('r1', 'g1');
    expect(insumos.registrarEntrada).toHaveBeenCalledWith(
      'i1',
      25, // 5 caixas/galões × fator 5 = 25 unidades base
      'REQUISICAO',
      'g1',
      undefined, // data
      'Fulano', // aprovador (decididaPorNome)
      undefined, // requisitante (solicitanteNome ausente neste caso)
    );
    expect(r.status).toBe('APROVADA');
    expect(notificacoes.enviar).toHaveBeenCalledTimes(1);
  });

  it('não aprova requisição já decidida', async () => {
    const { service } = criarServico({
      id: 'r1',
      insumoId: 'i1',
      quantidade: 5,
      status: 'APROVADA',
    });
    await expect(service.aprovar('r1', 'g1')).rejects.toBeTruthy();
  });
});
