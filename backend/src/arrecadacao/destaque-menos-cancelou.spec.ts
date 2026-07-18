import { IndicadoresInteligenteService } from './indicadores-inteligente.service';

/**
 * Destaque "menos cancelou": premia quem cancelou menos itens, medido em %
 * SOBRE AS VENDAS da loja. Só concorre quem está ATIVO e com assiduidade
 * perfeita (sem faltas no período). Inativos somam nos totais da loja, mas não
 * disputam o destaque individual.
 */
describe('IndicadoresInteligenteService.destaquesMes — menos cancelou', () => {
  function criarServico() {
    const identificadores = [
      { colaboradorId: 'ca', tipo: 'MATRICULA', valor: '100' },
      { colaboradorId: 'cb', tipo: 'MATRICULA', valor: '200' },
      { colaboradorId: 'cc', tipo: 'MATRICULA', valor: '300' },
    ];
    const colaboradores = [
      { id: 'ca', nome: 'Ana', funcao: 'OPERADOR', ativo: true },
      { id: 'cb', nome: 'Bruno', funcao: 'OPERADOR', ativo: true },
      { id: 'cc', nome: 'Carla', funcao: 'OPERADOR', ativo: false },
    ];
    // Contribuição (troco) para todos; cancelamento: Ana 100, Bruno 0, Carla 0.
    const arrecad = [
      { tipo: 'TROCO_SOLIDARIO', matricula: '100', nome: 'Ana', valor: 50 },
      { tipo: 'TROCO_SOLIDARIO', matricula: '200', nome: 'Bruno', valor: 50 },
      { tipo: 'TROCO_SOLIDARIO', matricula: '300', nome: 'Carla', valor: 50 },
      { tipo: 'CANCELAMENTO_ITENS', matricula: '100', nome: 'Ana', valor: 100 },
    ];

    const prisma = {
      colaboradorIdentificador: {
        findMany: () => Promise.resolve(identificadores),
      },
      colaborador: {
        findMany: ({ where }: { where?: { ativo?: boolean } }) =>
          Promise.resolve(
            where?.ativo ? colaboradores.filter((c) => c.ativo) : colaboradores,
          ),
      },
      registroArrecadacao: {
        findMany: ({ where }: { where: { tipo: unknown } }) => {
          const t = where.tipo as string | { in: string[] };
          const casa = (tipo: string) =>
            typeof t === 'string' ? t === tipo : t.in.includes(tipo);
          return Promise.resolve(arrecad.filter((r) => casa(r.tipo)));
        },
      },
      // Bruno (cb) tem 1 falta no período → sem assiduidade perfeita.
      ausencia: {
        findMany: () => Promise.resolve([{ pessoaId: 'cb' }]),
      },
      // Vendas totais da loja no mês = 10.000 → % da Ana = 100/10000 = 1%.
      vendaDiaria: {
        findMany: () => Promise.resolve([{ valor: 10000 }]),
      },
    };
    return new IndicadoresInteligenteService(prisma as never, {} as never);
  }

  it('exclui quem tem falta e quem está inativo; premia por % sobre as vendas', async () => {
    const service = criarServico();
    const destaques = await service.destaquesMes(new Date('2026-07-15'));

    // Bruno (0 cancel, mas com falta) e Carla (0 cancel, mas inativa) NÃO
    // concorrem. Sobra a Ana (ativa, sem faltas), mesmo tendo cancelado mais.
    expect(destaques.menosCancelou?.nome).toBe('Ana');
    // % sobre as vendas da loja: 100 / 10.000 * 100 = 1.
    expect(destaques.menosCancelou?.percentual).toBe(1);
  });
});
