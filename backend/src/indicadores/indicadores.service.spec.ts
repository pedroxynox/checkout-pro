import { IndicadoresService } from './indicadores.service';
import { ValorVendaInvalidoError } from './indicadores.errors';

/**
 * Testes de exemplo (unitários) do `IndicadoresService`. Usam um
 * `PrismaService` falso (em memória) exercitando o Painel de Vendas
 * (registrar/alterar/acumular), o cálculo do indicador percentual, a
 * classificação de cor e os rankings, sem banco de dados.
 */
describe('IndicadoresService', () => {
  interface VendaFake {
    data: Date;
    valor: number;
  }
  interface RegistroOpFake {
    tipo: string;
    data: Date;
    operadorId?: string | null;
    fiscalId?: string | null;
    valor: number;
  }

  function criarServico(registros: RegistroOpFake[] = []): IndicadoresService {
    const vendas: VendaFake[] = [];

    const prismaFake = {
      vendaDiaria: {
        upsert: ({
          where: { data },
          create,
          update,
        }: {
          where: { data: Date };
          create: { data: Date; valor: number };
          update: { valor: number };
        }) => {
          const existente = vendas.find(
            (v) => v.data.getTime() === data.getTime(),
          );
          if (existente) {
            existente.valor = update.valor;
            return Promise.resolve({ ...existente });
          }
          const nova = { data: create.data, valor: create.valor };
          vendas.push(nova);
          return Promise.resolve({ ...nova });
        },
        update: ({
          where: { data },
          data: { valor },
        }: {
          where: { data: Date };
          data: { valor: number };
        }) => {
          const existente = vendas.find(
            (v) => v.data.getTime() === data.getTime(),
          );
          if (!existente) {
            return Promise.reject(new Error('Venda não encontrada'));
          }
          existente.valor = valor;
          return Promise.resolve({ ...existente });
        },
        findMany: (args?: {
          where?: { data?: { gte?: Date; lte?: Date } };
        }) => {
          let lista = [...vendas];
          const gte = args?.where?.data?.gte;
          const lte = args?.where?.data?.lte;
          if (gte) {
            lista = lista.filter((v) => v.data.getTime() >= gte.getTime());
          }
          if (lte) {
            lista = lista.filter((v) => v.data.getTime() <= lte.getTime());
          }
          return Promise.resolve(lista.map((v) => ({ ...v })));
        },
      },
      registroOperacional: {
        findMany: (args?: {
          where?: { tipo?: string; data?: { gte?: Date; lte?: Date } };
        }) => {
          let lista = [...registros];
          const tipo = args?.where?.tipo;
          if (tipo) {
            lista = lista.filter((r) => r.tipo === tipo);
          }
          const gte = args?.where?.data?.gte;
          const lte = args?.where?.data?.lte;
          if (gte) {
            lista = lista.filter((r) => r.data.getTime() >= gte.getTime());
          }
          if (lte) {
            lista = lista.filter((r) => r.data.getTime() <= lte.getTime());
          }
          return Promise.resolve(lista.map((r) => ({ ...r })));
        },
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new IndicadoresService(prismaFake as any);
  }

  describe('Painel de Vendas (Req 2.1)', () => {
    it('acumula vendas por dia, semana e mês e recalcula após alteração', async () => {
      const service = criarServico();
      // Semana de domingo (2024-03-03) a sábado (2024-03-09).
      await service.registrarVenda(new Date(Date.UTC(2024, 2, 4)), 100); // seg
      await service.registrarVenda(new Date(Date.UTC(2024, 2, 5)), 200); // ter
      await service.registrarVenda(new Date(Date.UTC(2024, 2, 20)), 50); // outra semana/mesmo mês

      expect(
        await service.acumulado(new Date(Date.UTC(2024, 2, 4)), 'DIA'),
      ).toBe(100);
      expect(
        await service.acumulado(new Date(Date.UTC(2024, 2, 4)), 'SEMANA'),
      ).toBe(300);
      expect(
        await service.acumulado(new Date(Date.UTC(2024, 2, 4)), 'MES'),
      ).toBe(350);

      // Alteração recalcula os acumulados.
      await service.alterarVenda(new Date(Date.UTC(2024, 2, 4)), 1000);
      expect(
        await service.acumulado(new Date(Date.UTC(2024, 2, 4)), 'SEMANA'),
      ).toBe(1200);
    });

    it('rejeita valor de venda negativo (Req 2.1.4)', async () => {
      const service = criarServico();
      await expect(
        service.registrarVenda(new Date(Date.UTC(2024, 2, 4)), -1),
      ).rejects.toBeInstanceOf(ValorVendaInvalidoError);
    });
  });

  describe('percentual e cor', () => {
    it('calcula o percentual sobre vendas e classifica a cor do cancelamento', () => {
      const service = criarServico();
      const pct = service.percentual(75, 10000); // 0,75%
      expect(pct).toBeCloseTo(0.75, 6);

      const config = service.configPadrao('CANCELAMENTO', 1.5);
      expect(service.statusCor(0.5, config)).toBe('VERDE');
      expect(service.statusCor(0.75, config)).toBe('VERDE');
      expect(service.statusCor(1.0, config)).toBe('AMARELO');
      expect(service.statusCor(2.0, config)).toBe('VERMELHO');
    });

    it('classifica a cor do troco solidário (maior é melhor)', () => {
      const service = criarServico();
      const config = service.configPadrao('TROCO', 1500);
      expect(service.statusCor(2500, config)).toBe('VERDE');
      expect(service.statusCor(1800, config)).toBe('AMARELO');
      expect(service.statusCor(1000, config)).toBe('VERMELHO');
    });
  });

  describe('rankings (Req 2.2.6, 2.3.6)', () => {
    it('ranqueia operadores por cancelamento de forma decrescente', async () => {
      const dia = new Date(Date.UTC(2024, 2, 10));
      const service = criarServico([
        { tipo: 'CANCELAMENTO', data: dia, operadorId: 'op1', valor: 10 },
        { tipo: 'CANCELAMENTO', data: dia, operadorId: 'op2', valor: 30 },
        { tipo: 'CANCELAMENTO', data: dia, operadorId: 'op1', valor: 5 },
      ]);
      const ranking = await service.rankingOperadores('CANCELAMENTO', {
        inicio: new Date(Date.UTC(2024, 2, 1)),
        fim: new Date(Date.UTC(2024, 2, 31)),
      });
      expect(ranking).toEqual([
        { pessoaId: 'op2', total: 30 },
        { pessoaId: 'op1', total: 15 },
      ]);
    });

    it('ranqueia fiscais por devoluções', async () => {
      const dia = new Date(Date.UTC(2024, 2, 10));
      const service = criarServico([
        { tipo: 'DEVOLUCAO', data: dia, fiscalId: 'fi1', valor: 40 },
        { tipo: 'DEVOLUCAO', data: dia, fiscalId: 'fi2', valor: 90 },
      ]);
      const ranking = await service.rankingFiscais({
        inicio: new Date(Date.UTC(2024, 2, 1)),
        fim: new Date(Date.UTC(2024, 2, 31)),
      });
      expect(ranking).toEqual([
        { pessoaId: 'fi2', total: 90 },
        { pessoaId: 'fi1', total: 40 },
      ]);
    });
  });
});
