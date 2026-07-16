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

describe('PontoOcrService — memória de nomes protegida (aprendizado)', () => {
  function montar() {
    const prisma = {
      aliasLeituraPonto: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    return { prisma, service: new PontoOcrService(prisma as never) };
  }

  const ALVO_A = {
    pessoaId: 'pessoa-A',
    tipoPessoa: 'FISCAL' as const,
    colaboradorId: 'col-A',
    nome: 'Ana Fiscal',
  };
  const ALVO_B = {
    pessoaId: 'pessoa-B',
    tipoPessoa: 'FISCAL' as const,
    colaboradorId: 'col-B',
    nome: 'Bruna Fiscal',
  };

  it('cria a associação na primeira confirmação de um nome novo', async () => {
    const { prisma, service } = montar();
    await service.aprenderAlias('ANA FISCAL', ALVO_A);
    expect(prisma.aliasLeituraPonto.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ pessoaId: 'pessoa-A' }),
    });
    expect(prisma.aliasLeituraPonto.update).not.toHaveBeenCalled();
  });

  it('reforça a associação e limpa o pendente ao confirmar a MESMA pessoa', async () => {
    const { prisma, service } = montar();
    prisma.aliasLeituraPonto.findUnique.mockResolvedValue({
      textoNome: 'ANA FISCAL',
      pessoaId: 'pessoa-A',
      tipoPessoa: 'FISCAL',
      usos: 3,
      pendentePessoaId: 'pessoa-B',
      pendenteUsos: 1,
    });

    await service.aprenderAlias('ANA FISCAL', ALVO_A);

    expect(prisma.aliasLeituraPonto.update).toHaveBeenCalledWith({
      where: { textoNome: 'ANA FISCAL' },
      data: expect.objectContaining({
        usos: { increment: 1 },
        pendentePessoaId: null,
        pendenteUsos: 0,
      }),
    });
  });

  it('NÃO troca a associação numa seleção isolada de outra pessoa: só registra o pendente', async () => {
    const { prisma, service } = montar();
    prisma.aliasLeituraPonto.findUnique.mockResolvedValue({
      textoNome: 'ANA FISCAL',
      pessoaId: 'pessoa-A',
      tipoPessoa: 'FISCAL',
      usos: 5,
      pendentePessoaId: null,
      pendenteUsos: 0,
    });

    await service.aprenderAlias('ANA FISCAL', ALVO_B);

    const dados = prisma.aliasLeituraPonto.update.mock.calls[0][0].data;
    // Registra o desafiante pendente com 1 confirmação…
    expect(dados).toEqual(
      expect.objectContaining({
        pendentePessoaId: 'pessoa-B',
        pendenteUsos: 1,
      }),
    );
    // …e NÃO substitui a associação vigente (não muda pessoaId).
    expect(dados).not.toHaveProperty('pessoaId');
  });

  it('troca a associação só após confirmações repetidas do mesmo desafiante', async () => {
    const { prisma, service } = montar();
    prisma.aliasLeituraPonto.findUnique.mockResolvedValue({
      textoNome: 'ANA FISCAL',
      pessoaId: 'pessoa-A',
      tipoPessoa: 'FISCAL',
      usos: 5,
      pendentePessoaId: 'pessoa-B',
      pendenteTipoPessoa: 'FISCAL',
      pendenteUsos: 1,
    });

    await service.aprenderAlias('ANA FISCAL', ALVO_B);

    expect(prisma.aliasLeituraPonto.update).toHaveBeenCalledWith({
      where: { textoNome: 'ANA FISCAL' },
      data: expect.objectContaining({
        pessoaId: 'pessoa-B',
        usos: 2,
        pendentePessoaId: null,
        pendenteUsos: 0,
      }),
    });
  });

  it('um desafiante diferente reinicia a contagem (não acumula com outro)', async () => {
    const { prisma, service } = montar();
    prisma.aliasLeituraPonto.findUnique.mockResolvedValue({
      textoNome: 'ANA FISCAL',
      pessoaId: 'pessoa-A',
      tipoPessoa: 'FISCAL',
      usos: 5,
      pendentePessoaId: 'pessoa-C',
      pendenteTipoPessoa: 'FISCAL',
      pendenteUsos: 1,
    });

    await service.aprenderAlias('ANA FISCAL', ALVO_B);

    const dados = prisma.aliasLeituraPonto.update.mock.calls[0][0].data;
    expect(dados).toEqual(
      expect.objectContaining({
        pendentePessoaId: 'pessoa-B',
        pendenteUsos: 1,
      }),
    );
    expect(dados).not.toHaveProperty('pessoaId');
  });
});
