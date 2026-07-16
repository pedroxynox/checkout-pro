import { PontoOcrService } from './ponto-ocr.service';

describe('PontoOcrService — somente pessoas ativas', () => {
  function montar() {
    const prisma = {
      aliasLeituraPonto: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
      fiscal: { findMany: jest.fn().mockResolvedValue([]) },
      usuario: { findMany: jest.fn().mockResolvedValue([]) },
      colaborador: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { prisma, service: new PontoOcrService(prisma as never) };
  }

  it('sugere fiscal somente quando possui ficha canônica ativa', async () => {
    const { prisma, service } = montar();
    prisma.fiscal.findMany.mockResolvedValue([
      { id: 'fiscal-1', nome: 'Ana Antiga', usuarioId: 'u1' },
      { id: 'fiscal-inativo', nome: 'Bruno Inativo', usuarioId: 'u2' },
    ]);
    prisma.usuario.findMany.mockResolvedValue([
      { id: 'u1', login: 'ANA' },
      { id: 'u2', login: 'BRUNO' },
    ]);
    prisma.colaborador.findMany
      .mockResolvedValueOnce([
        {
          id: 'col-ana',
          nome: 'Ana Fiscal',
          matricula: 'ANA',
          usuarioId: 'u1',
        },
      ])
      .mockResolvedValueOnce([]);

    const resposta = await service.lerComprovante({
      texto: 'NOME:ANA FISCAL\nDATA:10/07/2026 HORA:08:00',
    });

    expect(resposta.candidatos).toEqual([
      expect.objectContaining({
        id: 'fiscal-1',
        nome: 'Ana Fiscal',
        colaboradorId: 'col-ana',
        tipoPessoa: 'FISCAL',
      }),
    ]);
    expect(resposta.candidatos.some((c) => c.id === 'fiscal-inativo')).toBe(
      false,
    );
  });

  it('ignora alias antigo quando a pessoa deixou de ter ficha ativa', async () => {
    const { prisma, service } = montar();
    prisma.aliasLeituraPonto.findUnique.mockResolvedValue({
      pessoaId: 'fiscal-inativo',
      tipoPessoa: 'FISCAL',
      colaboradorId: 'col-inativo',
      nome: 'Bruno Inativo',
    });
    prisma.fiscal.findMany.mockResolvedValue([
      { id: 'fiscal-inativo', nome: 'Bruno Inativo', usuarioId: 'u2' },
    ]);
    prisma.usuario.findMany.mockResolvedValue([{ id: 'u2', login: 'BRUNO' }]);
    prisma.colaborador.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const resposta = await service.lerComprovante({
      texto: 'NOME:BRUNO INATIVO\nDATA:10/07/2026 HORA:08:00',
    });

    expect(resposta.candidatos).toEqual([]);
  });
});
