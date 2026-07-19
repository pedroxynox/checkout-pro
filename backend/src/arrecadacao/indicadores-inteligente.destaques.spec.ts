import {
  IndicadoresInteligenteService,
  concorreAosDestaques,
} from './indicadores-inteligente.service';

/**
 * Regra de negócio dos Destaques do Mês: **apenas OPERADORES concorrem**.
 * Fiscais, supervisores e gestores (gerente/administrador) NÃO devem aparecer,
 * mesmo que tenham movimento de caixa lançado em seu nome.
 */
describe('Destaques do mês — só operadores concorrem', () => {
  describe('concorreAosDestaques (regra pura)', () => {
    it('aceita apenas OPERADOR', () => {
      expect(concorreAosDestaques('OPERADOR')).toBe(true);
      expect(concorreAosDestaques('FISCAL')).toBe(false);
      expect(concorreAosDestaques('SUPERVISOR')).toBe(false);
      expect(concorreAosDestaques('GESTOR')).toBe(false);
      expect(concorreAosDestaques('')).toBe(false);
    });
  });

  interface Colab {
    id: string;
    nome: string;
    funcao: string;
    login: string;
    ativo?: boolean;
  }
  interface Reg {
    tipo: string;
    matricula: string; // código do arquivo (aqui, o login)
    valor: number;
    nome: string;
  }

  function servico(dados: {
    colaboradores: Colab[];
    registros: Reg[];
    ausencias?: { pessoaId: string }[];
    vendas?: { valor: number }[];
  }): IndicadoresInteligenteService {
    const identificadores = dados.colaboradores.map((c) => ({
      colaboradorId: c.id,
      tipo: 'LOGIN',
      valor: c.login,
    }));
    const prismaFake = {
      colaboradorIdentificador: {
        findMany: () => Promise.resolve(identificadores),
      },
      colaborador: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findMany: (args?: any) => {
          if (args?.where?.ativo === true) {
            return Promise.resolve(
              dados.colaboradores
                .filter((c) => c.ativo !== false)
                .map((c) => ({ id: c.id })),
            );
          }
          return Promise.resolve(
            dados.colaboradores.map((c) => ({
              id: c.id,
              nome: c.nome,
              funcao: c.funcao,
            })),
          );
        },
      },
      registroArrecadacao: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findMany: (args: any) => {
          const t = args.where.tipo;
          const tipos: string[] = typeof t === 'string' ? [t] : t.in;
          return Promise.resolve(
            dados.registros.filter((r) => tipos.includes(r.tipo)),
          );
        },
      },
      ausencia: { findMany: () => Promise.resolve(dados.ausencias ?? []) },
      vendaDiaria: {
        findMany: () => Promise.resolve(dados.vendas ?? [{ valor: 1000 }]),
      },
    };
    return new IndicadoresInteligenteService(prismaFake as never, {} as never);
  }

  const DATA = new Date('2026-07-15T12:00:00Z');

  it('premia o operador mesmo quando fiscal/supervisor/gestor têm valores maiores', async () => {
    const service = servico({
      colaboradores: [
        { id: 'op1', nome: 'Ana', funcao: 'OPERADOR', login: 'ana' },
        { id: 'sup1', nome: 'Bia', funcao: 'SUPERVISOR', login: 'bia' },
        { id: 'ger1', nome: 'Caio', funcao: 'GESTOR', login: 'caio' },
        { id: 'fis1', nome: 'Davi', funcao: 'FISCAL', login: 'davi' },
      ],
      registros: [
        // Troco: supervisor/gestor com valores MAIORES que o operador.
        { tipo: 'TROCO_SOLIDARIO', matricula: 'ana', valor: 50, nome: 'Ana' },
        { tipo: 'TROCO_SOLIDARIO', matricula: 'bia', valor: 300, nome: 'Bia' },
        {
          tipo: 'TROCO_SOLIDARIO',
          matricula: 'caio',
          valor: 200,
          nome: 'Caio',
        },
        // Recargas: gestor com valor maior.
        { tipo: 'RECARGAS_CELULAR', matricula: 'ana', valor: 40, nome: 'Ana' },
        {
          tipo: 'RECARGAS_CELULAR',
          matricula: 'caio',
          valor: 500,
          nome: 'Caio',
        },
        // Cancelamento: supervisor com valor maior.
        {
          tipo: 'CANCELAMENTO_ITENS',
          matricula: 'ana',
          valor: 10,
          nome: 'Ana',
        },
        {
          tipo: 'CANCELAMENTO_ITENS',
          matricula: 'bia',
          valor: 999,
          nome: 'Bia',
        },
      ],
    });

    const d = await service.destaquesMes(DATA);

    // Em todas as categorias, o destaque é a operadora Ana (não os demais).
    expect(d.trocoSolidario).toEqual({ nome: 'Ana', total: 50 });
    expect(d.recargas).toEqual({ nome: 'Ana', total: 40 });
    expect(d.cancelamentoItens).toEqual({ nome: 'Ana', total: 10 });
    expect(d.menosCancelou?.nome).toBe('Ana');

    const nomes = [
      d.trocoSolidario?.nome,
      d.recargas?.nome,
      d.cancelamentoItens?.nome,
      d.menosCancelou?.nome,
    ];
    expect(nomes).not.toContain('Bia');
    expect(nomes).not.toContain('Caio');
    expect(nomes).not.toContain('Davi');
  });

  it('não retorna destaque quando só há movimento de não-operadores', async () => {
    const service = servico({
      colaboradores: [
        { id: 'ger1', nome: 'Caio', funcao: 'GESTOR', login: 'caio' },
        { id: 'fis1', nome: 'Davi', funcao: 'FISCAL', login: 'davi' },
      ],
      registros: [
        {
          tipo: 'TROCO_SOLIDARIO',
          matricula: 'caio',
          valor: 300,
          nome: 'Caio',
        },
        {
          tipo: 'RECARGAS_CELULAR',
          matricula: 'davi',
          valor: 500,
          nome: 'Davi',
        },
        {
          tipo: 'CANCELAMENTO_ITENS',
          matricula: 'caio',
          valor: 999,
          nome: 'Caio',
        },
      ],
    });

    const d = await service.destaquesMes(DATA);

    expect(d.trocoSolidario).toBeNull();
    expect(d.recargas).toBeNull();
    expect(d.cancelamentoItens).toBeNull();
    expect(d.menosCancelou).toBeNull();
  });
});
