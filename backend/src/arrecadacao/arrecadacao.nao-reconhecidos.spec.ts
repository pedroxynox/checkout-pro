import { ArrecadacaoService } from './arrecadacao.service';

/**
 * Testes dos lançamentos NÃO reconhecidos (códigos do arquivo que não casam
 * com nenhum colaborador cadastrado). Garante que:
 *  - o agregado por tipo soma só os não reconhecidos (o total do indicador,
 *    calculado por `somar`, já inclui todos — aqui é a fatia "de fora");
 *  - a fila agrupa por código, somando todos os indicadores e ignorando
 *    lançamentos sem código (matrícula vazia).
 */
describe('ArrecadacaoService — não reconhecidos', () => {
  interface RegFake {
    tipo: string;
    matricula: string | null;
    nome: string;
    valor: number;
    data: Date;
  }

  function criarServico(registros: RegFake[]): ArrecadacaoService {
    const prismaFake = {
      registroArrecadacao: {
        findMany: (args?: { where?: { tipo?: string } }) => {
          const tipo = args?.where?.tipo;
          const lista =
            tipo === undefined
              ? registros
              : registros.filter((r) => r.tipo === tipo);
          return Promise.resolve(lista);
        },
      },
      colaboradorIdentificador: {
        findMany: () =>
          Promise.resolve([
            { colaboradorId: 'c1', tipo: 'MATRICULA', valor: '100' },
          ]),
      },
      colaborador: {
        findMany: () =>
          Promise.resolve([{ id: 'c1', nome: 'Ana', funcao: 'OPERADOR' }]),
      },
    };
    return new ArrecadacaoService(
      prismaFake as never,
      {} as never,
      {} as never,
    );
  }

  const inicio = new Date(Date.UTC(2026, 5, 1));
  const fim = new Date(Date.UTC(2026, 5, 30));

  it('agrega só os não reconhecidos de um tipo (cadastrado é excluído)', async () => {
    const service = criarServico([
      {
        tipo: 'TROCO_SOLIDARIO',
        matricula: '100',
        nome: 'Ana',
        valor: 10,
        data: inicio,
      },
      {
        tipo: 'TROCO_SOLIDARIO',
        matricula: '999',
        nome: 'Externo',
        valor: 5,
        data: inicio,
      },
      {
        tipo: 'TROCO_SOLIDARIO',
        matricula: '888',
        nome: 'Outro',
        valor: 3,
        data: inicio,
      },
    ]);

    const resumo = await service.naoReconhecidos(
      'TROCO_SOLIDARIO',
      inicio,
      fim,
    );
    expect(resumo).toEqual({ total: 8, lancamentos: 2 });
  });

  it('lista os códigos soltos agrupados, somando indicadores e ordenando por valor', async () => {
    const service = criarServico([
      // cadastrado (Ana) — não entra
      {
        tipo: 'TROCO_SOLIDARIO',
        matricula: '100',
        nome: 'Ana',
        valor: 10,
        data: inicio,
      },
      // 999 aparece em dois indicadores -> agrupa
      {
        tipo: 'TROCO_SOLIDARIO',
        matricula: '999',
        nome: 'Externo',
        valor: 5,
        data: inicio,
      },
      {
        tipo: 'RECARGAS_CELULAR',
        matricula: '999',
        nome: 'Externo',
        valor: 7,
        data: inicio,
      },
      // 888 só num indicador
      {
        tipo: 'TROCO_SOLIDARIO',
        matricula: '888',
        nome: 'Outro',
        valor: 3,
        data: inicio,
      },
      // sem código -> ignorado na fila
      {
        tipo: 'TROCO_SOLIDARIO',
        matricula: '',
        nome: 'Sem código',
        valor: 99,
        data: inicio,
      },
    ]);

    const lista = await service.listarNaoReconhecidos(inicio, fim);
    expect(lista).toEqual([
      {
        matricula: '999',
        nome: 'Externo',
        total: 12,
        lancamentos: 2,
        tipos: ['TROCO_SOLIDARIO', 'RECARGAS_CELULAR'],
      },
      {
        matricula: '888',
        nome: 'Outro',
        total: 3,
        lancamentos: 1,
        tipos: ['TROCO_SOLIDARIO'],
      },
    ]);
  });
});
