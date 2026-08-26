import { HistoricoIndicadoresService } from './historico-indicadores.service';
import { ArrecadacaoService } from './arrecadacao.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { anoMesDe } from '../metas/metas.domain';

/**
 * Serviço do Histórico de Indicadores.
 *
 * Cobre as três decisões que sustentam a janela móvel:
 *  1. mês corrente ao vivo (parcial) e mês fechado lido da foto congelada;
 *  2. um mês fechado com movimento e sem foto é congelado na hora (é o que
 *     preenche o histórico dos meses que já existiam);
 *  3. a limpeza só apaga o que é ESTRITAMENTE anterior ao mês limite — nada
 *     dentro da janela é tocado.
 */

/** Movimento de um mês no cenário de teste. */
interface MesFake {
  /** Total por tipo (R$). */
  total?: Record<string, number>;
  /** Quantidade (itens/cupons) por tipo. */
  itens?: Record<string, number>;
  /** Vendas da loja no mês. */
  vendas?: number;
}

interface FotoFake {
  tipo: string;
  anoMes: string;
  total: number;
  itens: number;
  vendas: number;
  percentual: number | null;
  meta: number;
  nivel: string;
  cumpriu: boolean;
}

interface Cenario {
  meses?: Record<string, MesFake>;
  fotos?: FotoFake[];
  /** Meta devolvida por `ArrecadacaoService.metaDe` (por tipo ou única). */
  metas?: Record<string, number>;
  retencao?: number;
}

interface Apagados {
  registros: { lt?: Date };
  semMovimento: { lt?: Date };
  vendasHora: { lt?: Date };
  vendasDiarias: { lt?: Date };
  fotos: { lt?: string };
}

interface Montagem {
  servico: HistoricoIndicadoresService;
  upserts: { tipo: string; anoMes: string; dados: Record<string, unknown> }[];
  apagados: Apagados;
}

function montar(cenario: Cenario = {}): Montagem {
  const meses = cenario.meses ?? {};
  const fotos = cenario.fotos ?? [];
  const upserts: Montagem['upserts'] = [];
  const apagados: Apagados = {
    registros: {},
    semMovimento: {},
    vendasHora: {},
    vendasDiarias: {},
    fotos: {},
  };

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const prismaFake = {
    registroArrecadacao: {
      aggregate: (args: any) => {
        const anoMes = anoMesDe(args.where.data.gte as Date);
        const mes = meses[anoMes] ?? {};
        if (args._sum?.quantidade) {
          return Promise.resolve({
            _sum: { quantidade: mes.itens?.[args.where.tipo] ?? 0 },
          });
        }
        return Promise.resolve({
          _sum: { valor: mes.total?.[args.where.tipo] ?? 0 },
        });
      },
      deleteMany: (args: any) => {
        apagados.registros = args.where.data;
        return Promise.resolve({ count: 7 });
      },
    },
    vendaDiaria: {
      aggregate: (args: any) => {
        const anoMes = anoMesDe(args.where.data.gte as Date);
        return Promise.resolve({ _sum: { valor: meses[anoMes]?.vendas ?? 0 } });
      },
      deleteMany: (args: any) => {
        apagados.vendasDiarias = args.where.data;
        return Promise.resolve({ count: 3 });
      },
    },
    vendaHora: {
      deleteMany: (args: any) => {
        apagados.vendasHora = args.where.data;
        return Promise.resolve({ count: 2 });
      },
    },
    arrecadacaoSemMovimento: {
      deleteMany: (args: any) => {
        apagados.semMovimento = args.where.data;
        return Promise.resolve({ count: 1 });
      },
    },
    fotoMesIndicador: {
      findMany: (args: any) => {
        const lista: string[] = args?.where?.anoMes?.in ?? [];
        const tipo: string | undefined = args?.where?.tipo;
        return Promise.resolve(
          fotos.filter(
            (f) =>
              lista.includes(f.anoMes) && (tipo === undefined || f.tipo === tipo),
          ),
        );
      },
      upsert: (args: any) => {
        upserts.push({
          tipo: args.where.tipo_anoMes.tipo,
          anoMes: args.where.tipo_anoMes.anoMes,
          dados: args.create,
        });
        return Promise.resolve({});
      },
      deleteMany: (args: any) => {
        apagados.fotos = args.where.anoMes;
        return Promise.resolve({ count: 5 });
      },
    },
    $transaction: (fn: any) => fn(prismaFake),
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const arrecadacaoFake = {
    metaDe: (tipo: string) =>
      Promise.resolve(cenario.metas?.[tipo] ?? cenario.metas?.PADRAO ?? 2000),
  } as unknown as ArrecadacaoService;

  const configFake = {
    get: (_chave: string, padrao: number) => cenario.retencao ?? padrao,
  } as unknown as ConfigService;

  const servico = new HistoricoIndicadoresService(
    prismaFake as unknown as PrismaService,
    arrecadacaoFake,
    configFake,
  );
  return { servico, upserts, apagados };
}

const HOJE = new Date('2026-08-15T12:00:00.000Z');

describe('HistoricoIndicadoresService', () => {
  describe('série mensal', () => {
    it('devolve a janela do mais antigo ao mais recente, com o mês corrente parcial', async () => {
      const { servico } = montar({
        meses: { '2026-08': { total: { TROCO_SOLIDARIO: 1200 } } },
      });
      const h = await servico.historico('TROCO_SOLIDARIO', 3, HOJE);

      expect(h.meses.map((m) => m.anoMes)).toEqual([
        '2026-06',
        '2026-07',
        '2026-08',
      ]);
      expect(h.meses[2].parcial).toBe(true);
      expect(h.meses[0].parcial).toBe(false);
      expect(h.meses[2].total).toBe(1200);
      expect(h.mesesRetencao).toBe(24);
      expect(h.anoMesLimite).toBe('2024-09');
    });

    it('lê o mês fechado da foto congelada, não dos lançamentos crus', async () => {
      const { servico } = montar({
        // O cru diz 999, a foto diz 5000: vale a foto (o mês já fechou).
        meses: { '2026-07': { total: { TROCO_SOLIDARIO: 999 } } },
        fotos: [
          {
            tipo: 'TROCO_SOLIDARIO',
            anoMes: '2026-07',
            total: 5000,
            itens: 0,
            vendas: 0,
            percentual: null,
            meta: 2000,
            nivel: 'OK',
            cumpriu: true,
          },
        ],
      });
      const h = await servico.historico('TROCO_SOLIDARIO', 2, HOJE);
      const julho = h.meses.find((m) => m.anoMes === '2026-07');
      expect(julho?.total).toBe(5000);
      expect(julho?.parcial).toBe(false);
    });

    it('congela o mês fechado que tem movimento e ainda não tem foto', async () => {
      const { servico, upserts } = montar({
        meses: {
          '2026-07': { total: { TROCO_SOLIDARIO: 3000 } },
          '2026-08': { total: { TROCO_SOLIDARIO: 100 } },
        },
      });
      await servico.historico('TROCO_SOLIDARIO', 3, HOJE);

      // Julho (fechado, com movimento) é congelado; junho está vazio e agosto é
      // o mês corrente — nenhum dos dois vira foto.
      expect(upserts.map((u) => u.anoMes)).toEqual(['2026-07']);
      expect(upserts[0].dados).toMatchObject({
        tipo: 'TROCO_SOLIDARIO',
        total: 3000,
        meta: 2000,
        nivel: 'OK',
        cumpriu: true,
      });
    });

    it('marca como "sem dados" o mês sem nenhum movimento nem venda', async () => {
      const { servico } = montar({
        meses: { '2026-08': { total: { TROCO_SOLIDARIO: 500 } } },
      });
      const h = await servico.historico('TROCO_SOLIDARIO', 3, HOJE);
      expect(h.meses[0].semDados).toBe(true);
      expect(h.meses[2].semDados).toBe(false);
      // Mês vazio não serve de base de comparação (evita "+∞%").
      expect(h.meses[1].variacao).toBeNull();
    });

    it('compara cada mês com o anterior e interpreta pelo sentido do indicador', async () => {
      // Cancelamento de itens: menor é melhor. O % caiu de 1,0% para 0,5%.
      const { servico } = montar({
        metas: { CANCELAMENTO_ITENS: 0.75 },
        meses: {
          '2026-07': { total: { CANCELAMENTO_ITENS: 1000 }, vendas: 100000 },
          '2026-08': { total: { CANCELAMENTO_ITENS: 500 }, vendas: 100000 },
        },
      });
      const h = await servico.historico('CANCELAMENTO_ITENS', 2, HOJE);
      const agosto = h.meses[1];
      expect(h.meses[0].percentual).toBeCloseTo(1);
      expect(agosto.percentual).toBeCloseTo(0.5);
      expect(agosto.variacao).toBeCloseTo(-50);
      // Caiu → para este indicador é MELHORA.
      expect(agosto.evolucao).toBe('MELHOROU');
      expect(agosto.nivel).toBe('OK');
    });

    it('subir num indicador "menor é melhor" é PIORA', async () => {
      const { servico } = montar({
        metas: { DEVOLUCOES: 0.05 },
        meses: {
          '2026-07': { total: { DEVOLUCOES: 50 }, vendas: 100000 },
          '2026-08': { total: { DEVOLUCOES: 200 }, vendas: 100000 },
        },
      });
      const h = await servico.historico('DEVOLUCOES', 2, HOJE);
      expect(h.meses[1].evolucao).toBe('PIOROU');
      expect(h.meses[1].nivel).toBe('FORA');
    });

    it('conta a sequência de meses dentro da meta', async () => {
      const { servico } = montar({
        metas: { RECARGAS_CELULAR: 2000 },
        meses: {
          '2026-06': { total: { RECARGAS_CELULAR: 2500 } },
          '2026-07': { total: { RECARGAS_CELULAR: 2600 } },
          '2026-08': { total: { RECARGAS_CELULAR: 2700 } },
        },
      });
      const h = await servico.historico('RECARGAS_CELULAR', 3, HOJE);
      expect(h.sequenciaCumprindo).toBe(3);
    });

    it('nunca devolve mais meses do que a retenção configurada', async () => {
      const { servico } = montar({ retencao: 6 });
      const h = await servico.historico('TROCO_SOLIDARIO', 48, HOJE);
      expect(h.meses).toHaveLength(6);
      expect(h.mesesRetencao).toBe(6);
      expect(h.anoMesLimite).toBe('2026-03');
    });

    it('a leitura sobrevive a uma falha ao gravar a foto', async () => {
      const { servico } = montar({
        meses: { '2026-07': { total: { TROCO_SOLIDARIO: 3000 } } },
      });
      // Simula banco indisponível apenas na escrita.
      const prisma = (servico as unknown as { prisma: Record<string, never> })
        .prisma as unknown as {
        fotoMesIndicador: { upsert: () => Promise<never> };
      };
      prisma.fotoMesIndicador.upsert = () =>
        Promise.reject(new Error('banco indisponível'));

      const h = await servico.historico('TROCO_SOLIDARIO', 2, HOJE);
      expect(h.meses[0].total).toBe(3000);
    });
  });

  describe('congelamento', () => {
    it('congela todos os tipos com movimento e ignora os vazios', async () => {
      const { servico, upserts } = montar({
        meses: {
          '2026-07': {
            total: { TROCO_SOLIDARIO: 2500, CANCELAMENTO_ITENS: 800 },
            vendas: 100000,
          },
        },
      });
      const gravadas = await servico.congelarMes('2026-07');
      // Os 3 indicadores base VENDAS entram porque o mês tem vendas > 0;
      // recargas ficou sem movimento e sem vendas próprias, mas as vendas da
      // loja contam como dado do mês — só o que é totalmente vazio é ignorado.
      expect(gravadas).toBe(upserts.length);
      expect(upserts.every((u) => u.anoMes === '2026-07')).toBe(true);
      expect(upserts.map((u) => u.tipo)).toContain('TROCO_SOLIDARIO');
    });

    it('não cria foto de um mês inteiramente vazio', async () => {
      const { servico, upserts } = montar({ meses: {} });
      const gravadas = await servico.congelarMes('2025-01');
      expect(gravadas).toBe(0);
      expect(upserts).toHaveLength(0);
    });

    it('é idempotente: rodar de novo reescreve os mesmos números', async () => {
      const { servico, upserts } = montar({
        meses: { '2026-07': { total: { TROCO_SOLIDARIO: 2500 } } },
      });
      await servico.congelarMes('2026-07');
      const primeira = JSON.stringify(upserts);
      await servico.congelarMes('2026-07');
      const segunda = JSON.stringify(upserts.slice(upserts.length / 2));
      expect(segunda).toBe(JSON.stringify(JSON.parse(primeira)));
    });
  });

  describe('limpeza da janela móvel', () => {
    it('apaga apenas o que é anterior ao mês limite', async () => {
      const { servico, apagados } = montar({ retencao: 24 });
      const resumo = await servico.purgarForaDaJanela(HOJE);

      // Janela de 24 meses terminando em ago/2026 → o mais antigo conservado é
      // set/2024; o corte é 2024-09-01.
      expect(resumo.anoMesLimite).toBe('2024-09');
      const corte = new Date('2024-09-01T00:00:00.000Z');
      expect(apagados.registros.lt?.toISOString()).toBe(corte.toISOString());
      expect(apagados.semMovimento.lt?.toISOString()).toBe(corte.toISOString());
      expect(apagados.vendasDiarias.lt?.toISOString()).toBe(corte.toISOString());
      expect(apagados.vendasHora.lt?.toISOString()).toBe(corte.toISOString());
      expect(apagados.fotos.lt).toBe('2024-09');
    });

    it('a janela anda com o mês: um mês novo entra, o mais antigo sai', async () => {
      const { servico, apagados } = montar({ retencao: 24 });
      await servico.purgarForaDaJanela(new Date('2026-09-01T03:00:00.000Z'));
      // Um mês depois, o corte também andou um mês.
      expect(apagados.fotos.lt).toBe('2024-10');
    });

    it('devolve a contagem apagada por entidade', async () => {
      const { servico } = montar();
      const resumo = await servico.purgarForaDaJanela(HOJE);
      expect(resumo).toMatchObject({
        registrosArrecadacao: 7,
        arrecadacaoSemMovimento: 1,
        vendasDiarias: 3,
        vendasHora: 2,
        fotosMes: 5,
      });
    });
  });
});
