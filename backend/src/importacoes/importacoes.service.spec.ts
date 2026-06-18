import { ImportacoesService } from './importacoes.service';
import { ColunaAusenteError } from './importacoes.errors';
import { parseCsv } from './importacoes.parser';

/**
 * Testes de exemplo (unitários) do Modulo_Importacoes (subtarefa 5.8).
 *
 * Cobrem o registro de data/nome/valor por tipo de arquivo (Req 1.1.2–1.1.5)
 * via parsing, a validação de colunas (Req 1.1.6), a vinculação por nome e a
 * fila de não reconhecidos (Req 1.1.7, 1.1.8), o status do dia (Req 1.2), os
 * pendentes de fim do dia (Req 1.4.1) com data de referência configurável
 * (Req 1.4.2) e o histórico ordenado/filtrado (Req 1.3). Usa um
 * `PrismaService` falso em memória.
 */
describe('Modulo_Importacoes', () => {
  interface OperadorFake {
    id: string;
    nome: string;
  }
  interface FiscalFake {
    id: string;
    nome: string;
  }
  interface RegistroOpFake {
    tipo: string;
    data: Date;
    pessoaId: string;
    valor: number;
    operadorId?: string;
    fiscalId?: string;
  }
  interface ImportacaoFake {
    id: string;
    tipo: string;
    dataReferencia: Date;
    importadoEm: Date;
    importadoPor?: string;
    nomesNaoReconhecidos: string[];
    registros: RegistroOpFake[];
  }

  function criarServico(opcoes?: {
    operadores?: string[];
    fiscais?: string[];
    relogio?: () => Date;
  }): {
    service: ImportacoesService;
    importacoes: ImportacaoFake[];
  } {
    const operadores: OperadorFake[] = (opcoes?.operadores ?? []).map(
      (nome, i) => ({ id: `op${i}`, nome }),
    );
    const fiscais: FiscalFake[] = (opcoes?.fiscais ?? []).map((nome, i) => ({
      id: `fi${i}`,
      nome,
    }));
    const importacoes: ImportacaoFake[] = [];
    let seq = 0;
    const agora = opcoes?.relogio ?? (() => new Date());

    const prismaFake = {
      operador: {
        findMany: () =>
          Promise.resolve(operadores.map((o) => ({ id: o.id, nome: o.nome }))),
      },
      fiscal: {
        findMany: () =>
          Promise.resolve(fiscais.map((f) => ({ id: f.id, nome: f.nome }))),
      },
      registroImportacao: {
        create: ({
          data,
        }: {
          data: {
            tipo: string;
            dataReferencia: Date;
            importadoPor?: string;
            nomesNaoReconhecidos: string[];
            registros?: { create: RegistroOpFake[] };
          };
        }) => {
          const nova: ImportacaoFake = {
            id: `imp${++seq}`,
            tipo: data.tipo,
            dataReferencia: data.dataReferencia,
            importadoEm: agora(),
            importadoPor: data.importadoPor,
            nomesNaoReconhecidos: data.nomesNaoReconhecidos,
            registros: data.registros?.create ?? [],
          };
          importacoes.push(nova);
          return Promise.resolve({ ...nova });
        },
        findMany: (args?: {
          where?: { dataReferencia?: { gte?: Date; lte?: Date } };
          select?: { tipo?: boolean };
        }) => {
          let lista = [...importacoes];
          const gte = args?.where?.dataReferencia?.gte;
          const lte = args?.where?.dataReferencia?.lte;
          if (gte) {
            lista = lista.filter(
              (i) => i.dataReferencia.getTime() >= gte.getTime(),
            );
          }
          if (lte) {
            lista = lista.filter(
              (i) => i.dataReferencia.getTime() <= lte.getTime(),
            );
          }
          return Promise.resolve(lista.map((i) => ({ ...i })));
        },
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { service: new ImportacoesService(prismaFake as any), importacoes };
  }

  describe('parsing por tipo de arquivo (Req 1.1.2–1.1.5)', () => {
    const csv =
      'data,nome,valor\n2024-03-10,Ana,12.50\n2024-03-10,Bruno,"1.234,56"\n';

    it('extrai data, nome e valor de cada linha (Cancelamento)', () => {
      const { cabecalho, linhas } = parseCsv(csv);
      expect(cabecalho).toEqual(['data', 'nome', 'valor']);
      expect(linhas).toHaveLength(2);
      expect(linhas[0].nome).toBe('Ana');
      expect(linhas[0].valor).toBeCloseTo(12.5, 2);
      expect(linhas[0].data.getTime()).toBe(Date.UTC(2024, 2, 10));
      // Formato brasileiro "1.234,56" -> 1234.56.
      expect(linhas[1].valor).toBeCloseTo(1234.56, 2);
    });

    it('aceita data no formato brasileiro dd/mm/aaaa', () => {
      const { linhas } = parseCsv('data,nome,valor\n10/03/2024,Carla,5\n');
      expect(linhas[0].data.getTime()).toBe(Date.UTC(2024, 2, 10));
      expect(linhas[0].valor).toBe(5);
    });
  });

  describe('validação de colunas (Req 1.1.6)', () => {
    it('aceita cabeçalho completo', () => {
      const { service } = criarServico();
      expect(() =>
        service.validarColunas('TROCO_SOLIDARIO', ['data', 'nome', 'valor']),
      ).not.toThrow();
    });

    it('rejeita cabeçalho sem a coluna valor lançando ColunaAusenteError', () => {
      const { service } = criarServico();
      try {
        service.validarColunas('DEVOLUCOES', ['data', 'nome']);
        fail('deveria ter lançado');
      } catch (e) {
        expect(e).toBeInstanceOf(ColunaAusenteError);
        expect((e as ColunaAusenteError).colunasAusentes).toEqual(['valor']);
        expect((e as Error).message).toContain('valor');
      }
    });
  });

  describe('importar: vinculação e fila de não reconhecidos (Req 1.1.7, 1.1.8)', () => {
    it('vincula nomes cadastrados e lista os não reconhecidos', async () => {
      const { service } = criarServico({ operadores: ['Ana', 'Bruno'] });
      const dia = new Date(Date.UTC(2024, 2, 10));
      const resultado = await service.importar(
        'CANCELAMENTO_ITENS',
        [
          { data: dia, nome: 'Ana', valor: 10 },
          { data: dia, nome: 'Bruno', valor: 20 },
          { data: dia, nome: 'Desconhecido', valor: 5 },
        ],
        'user-1',
        dia,
      );
      expect(resultado.totalVinculados).toBe(2);
      expect(resultado.nomesNaoReconhecidos).toEqual(['Desconhecido']);
    });

    it('vincula devoluções a fiscais por nome', async () => {
      const { service } = criarServico({ fiscais: ['Karen Barro'] });
      const dia = new Date(Date.UTC(2024, 2, 10));
      const resultado = await service.importar(
        'DEVOLUCOES',
        [{ data: dia, nome: 'karen barro', valor: 30 }],
        null,
        dia,
      );
      expect(resultado.totalVinculados).toBe(1);
      expect(resultado.nomesNaoReconhecidos).toEqual([]);
    });
  });

  describe('status do dia e pendentes (Req 1.2, 1.4.1)', () => {
    it('reflete os tipos importados e o complemento pendente', async () => {
      const dia = new Date(Date.UTC(2024, 2, 10));
      const { service } = criarServico({ operadores: ['Ana'] });
      await service.importar(
        'CANCELAMENTO_ITENS',
        [{ data: dia, nome: 'Ana', valor: 10 }],
        null,
        dia,
      );
      await service.importar(
        'RECARGAS_CELULAR',
        [{ data: dia, nome: 'Ana', valor: 10 }],
        null,
        dia,
      );

      const status = await service.statusDoDia(dia);
      expect(status.CANCELAMENTO_ITENS).toBe('importado');
      expect(status.RECARGAS_CELULAR).toBe('importado');
      expect(status.TROCO_SOLIDARIO).toBe('pendente');
      expect(status.DEVOLUCOES).toBe('pendente');

      const pendentes = await service.verificarPendentesFimDoDia(dia);
      expect(pendentes.sort()).toEqual(['DEVOLUCOES', 'TROCO_SOLIDARIO']);
    });

    it('considera a data de referência configurada na verificação de fim do dia (Req 1.4.2)', async () => {
      const { service } = criarServico({ operadores: ['Ana'] });
      const diaA = new Date(Date.UTC(2024, 2, 10));
      const diaB = new Date(Date.UTC(2024, 2, 11));
      await service.importar(
        'CANCELAMENTO_ITENS',
        [{ data: diaA, nome: 'Ana', valor: 10 }],
        null,
        diaA,
      );
      // No dia B, nenhum arquivo foi importado: todos os quatro pendentes.
      const pendentesB = await service.verificarPendentesFimDoDia(diaB);
      expect(pendentesB).toHaveLength(4);
    });
  });

  describe('histórico ordenado e filtrado (Req 1.3)', () => {
    it('ordena do mais recente ao mais antigo e filtra por intervalo', async () => {
      let t = Date.UTC(2024, 2, 10, 8, 0, 0);
      const relogio = () => new Date((t += 1000));
      const { service } = criarServico({ operadores: ['Ana'], relogio });

      const dia1 = new Date(Date.UTC(2024, 2, 1));
      const dia2 = new Date(Date.UTC(2024, 2, 15));
      const dia3 = new Date(Date.UTC(2024, 5, 1));

      await service.importar(
        'CANCELAMENTO_ITENS',
        [{ data: dia1, nome: 'Ana', valor: 1 }],
        null,
        dia1,
      );
      await service.importar(
        'TROCO_SOLIDARIO',
        [{ data: dia2, nome: 'Ana', valor: 1 }],
        null,
        dia2,
      );
      await service.importar(
        'RECARGAS_CELULAR',
        [{ data: dia3, nome: 'Ana', valor: 1 }],
        null,
        dia3,
      );

      const todos = await service.historico();
      // Ordenado: a importação mais recente vem primeiro.
      expect(todos[0].importadoEm.getTime()).toBeGreaterThanOrEqual(
        todos[1].importadoEm.getTime(),
      );

      const filtrado = await service.historico({
        inicio: new Date(Date.UTC(2024, 2, 1)),
        fim: new Date(Date.UTC(2024, 2, 31)),
      });
      // Apenas as duas importações de março (data de referência no intervalo).
      expect(filtrado).toHaveLength(2);
    });
  });
});
