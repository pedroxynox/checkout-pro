import { OperadoresService } from './operadores.service';

/**
 * Passo A.3 (Fase 4 · Opção A): `listarAusencias` resolve o nome pela FICHA
 * canônica (Colaborador) — via `pessoaId` (operador) ou `colaboradorId`
 * (fiscal) —, deixando o modelo legado `Fiscal` apenas como fallback.
 */
describe('OperadoresService.listarAusencias — nome pela ficha', () => {
  const periodo = {
    inicio: new Date(Date.UTC(2026, 5, 1)),
    fim: new Date(Date.UTC(2026, 5, 30)),
  };

  function criar(fiscalFindMany: jest.Mock) {
    const prisma = {
      ausencia: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'a1',
            pessoaId: 'fiscal-1',
            colaboradorId: 'colab-1',
            data: new Date(Date.UTC(2026, 5, 10)),
            registradaPorNome: null,
            statusJustificativa: 'PENDENTE',
            motivoJustificativa: null,
            observacaoJustificativa: null,
            justificadaPorNome: null,
            justificadaEm: null,
          },
          {
            id: 'a2',
            pessoaId: 'colab-2',
            colaboradorId: 'colab-2',
            data: new Date(Date.UTC(2026, 5, 11)),
            registradaPorNome: null,
            statusJustificativa: 'PENDENTE',
            motivoJustificativa: null,
            observacaoJustificativa: null,
            justificadaPorNome: null,
            justificadaEm: null,
          },
        ]),
      },
      colaborador: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'colab-1', nome: 'Ana Fiscal', matricula: '1001' },
          { id: 'colab-2', nome: 'Beto Operador', matricula: '2002' },
        ]),
      },
      fiscal: { findMany: fiscalFindMany },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new OperadoresService(prisma as any);
  }

  it('usa a ficha canônica (colaboradorId do fiscal) e não consulta o Fiscal legado', async () => {
    const fiscalFindMany = jest.fn().mockResolvedValue([]);
    const service = criar(fiscalFindMany);
    const linhas = await service.listarAusencias(periodo);

    const doFiscal = linhas.find((l) => l.pessoaId === 'fiscal-1');
    const doOperador = linhas.find((l) => l.pessoaId === 'colab-2');
    // Nome do fiscal resolvido pela ficha vinculada (colaboradorId).
    expect(doFiscal?.nome).toBe('Ana Fiscal');
    expect(doFiscal?.matricula).toBe('1001');
    // Nome do operador resolvido pelo próprio pessoaId (já é a ficha).
    expect(doOperador?.nome).toBe('Beto Operador');
    // Como todas as faltas têm ficha, o modelo legado Fiscal NEM é consultado.
    expect(fiscalFindMany).not.toHaveBeenCalled();
  });
});
