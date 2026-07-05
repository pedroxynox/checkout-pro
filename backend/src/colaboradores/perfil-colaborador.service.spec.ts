import { PerfilColaboradorService } from './perfil-colaborador.service';
import { CONFIG_ARRECADACAO } from '../arrecadacao/arrecadacao.domain';

/**
 * Testes de integração/exemplo do **wiring** do Score no serviço de perfil
 * (Ola B — score-perfil-abrangente). Exercitam, com dependências mockadas
 * (Prisma, `MetasService`, `IncidenciasService`), os auxiliares que alimentam
 * a `EntradaScore` do operador:
 *  - `resolverMetaGlobal`: RECARGAS via MetasService e TROCO via `metaIndicador`,
 *    ambos com fallback à configuração quando não há meta/tabela;
 *  - `scoreDoOperador`: monta a meta individual derivada, os cancelamentos e os
 *    não-retornos do período e delega ao domínio puro `calcularScore`.
 *
 * As funções são privadas; os testes as acessam por casting, sem tocar no
 * domínio puro (validado à parte pelos property tests).
 */
describe('PerfilColaboradorService (wiring do score — Ola B)', () => {
  interface Deps {
    metaIndicador?: number | null;
    metaIndicadorThrows?: boolean;
    recargasResolver?: number;
    recargasThrows?: boolean;
    nOperadoresAtivos?: number;
    naoRetornos?: number;
  }

  function criarServico(deps: Deps = {}): {
    service: PerfilColaboradorService;
    metaIndicadorFindUnique: jest.Mock;
    contarNaoRetornos: jest.Mock;
    resolverRecargas: jest.Mock;
  } {
    const metaIndicadorFindUnique = jest.fn(() => {
      if (deps.metaIndicadorThrows)
        return Promise.reject(new Error('no table'));
      return Promise.resolve(
        deps.metaIndicador == null ? null : { meta: deps.metaIndicador },
      );
    });
    const resolverRecargas = jest.fn(() => {
      if (deps.recargasThrows) return Promise.reject(new Error('no table'));
      return Promise.resolve(deps.recargasResolver ?? 2000);
    });
    const contarNaoRetornos = jest.fn(() =>
      Promise.resolve(deps.naoRetornos ?? 0),
    );

    const prismaFake = {
      metaIndicador: { findUnique: metaIndicadorFindUnique },
      colaborador: {
        count: jest.fn(() => Promise.resolve(deps.nOperadoresAtivos ?? 1)),
      },
    };
    const metasFake = { resolver: resolverRecargas };
    const incidenciasFake = { contarNaoRetornos };
    // Contrato não participa do score (informativo). Basta um stub inerte.
    const contratosFake = {
      resumoDoColaborador: jest.fn(() => Promise.resolve({})),
    };

    const service = new PerfilColaboradorService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prismaFake as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      null as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      incidenciasFake as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metasFake as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contratosFake as any,
    );
    return {
      service,
      metaIndicadorFindUnique,
      contarNaoRetornos,
      resolverRecargas,
    };
  }

  // Acesso tipado aos métodos privados exercitados.
  type PrivadoMetaGlobal = (
    tipo: 'TROCO_SOLIDARIO' | 'RECARGAS_CELULAR',
    anoMes: string,
  ) => Promise<number>;
  const metaGlobalDe = (s: PerfilColaboradorService): PrivadoMetaGlobal =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s as any).resolverMetaGlobal.bind(s);

  describe('resolverMetaGlobal', () => {
    it('RECARGAS_CELULAR: usa o valor do MetasService quando configurado', async () => {
      const { service, resolverRecargas } = criarServico({
        recargasResolver: 3500,
      });
      const meta = await metaGlobalDe(service)('RECARGAS_CELULAR', '2026-07');
      expect(meta).toBe(3500);
      expect(resolverRecargas).toHaveBeenCalledWith(
        'RECARGAS_CELULAR',
        '2026-07',
      );
    });

    it('RECARGAS_CELULAR: cai no fallback da CONFIG quando a tabela falha', async () => {
      const { service } = criarServico({ recargasThrows: true });
      const meta = await metaGlobalDe(service)('RECARGAS_CELULAR', '2026-07');
      expect(meta).toBe(CONFIG_ARRECADACAO.RECARGAS_CELULAR.meta);
    });

    it('TROCO_SOLIDARIO: usa a meta global de metaIndicador quando existe', async () => {
      const { service } = criarServico({ metaIndicador: 5000 });
      const meta = await metaGlobalDe(service)('TROCO_SOLIDARIO', '2026-07');
      expect(meta).toBe(5000);
    });

    it('TROCO_SOLIDARIO: fallback à CONFIG quando não há registro', async () => {
      const { service } = criarServico({ metaIndicador: null });
      const meta = await metaGlobalDe(service)('TROCO_SOLIDARIO', '2026-07');
      expect(meta).toBe(CONFIG_ARRECADACAO.TROCO_SOLIDARIO.meta);
    });

    it('TROCO_SOLIDARIO: fallback à CONFIG quando a tabela não está migrada', async () => {
      const { service } = criarServico({ metaIndicadorThrows: true });
      const meta = await metaGlobalDe(service)('TROCO_SOLIDARIO', '2026-07');
      expect(meta).toBe(CONFIG_ARRECADACAO.TROCO_SOLIDARIO.meta);
    });
  });

  describe('scoreDoOperador', () => {
    // Janela = mês cheio no passado, sem folga → diasEscalados = diasUteisMes,
    // de modo que metaIndividualPeriodo = metaGlobalMensal / nOperadoresAtivos.
    const INICIO = new Date(Date.UTC(2020, 0, 1));
    const FIM = new Date(Date.UTC(2020, 0, 31));
    const FIM_EXCL = new Date(Date.UTC(2020, 1, 1));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chamar = (s: PerfilColaboradorService, args: any[]): Promise<any> =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s as any).scoreDoOperador(...args);

    function insumos(over: Record<string, number> = {}): {
      valorIndicador: (c: string) => number;
      mediaIndicador: (c: string) => number;
    } {
      const valores: Record<string, number> = {
        TROCO_SOLIDARIO: 200,
        RECARGAS_CELULAR: 300,
        CANCELAMENTO_ITENS: 0,
        CANCELAMENTO_CUPOM: 0,
        ...over,
      };
      const medias: Record<string, number> = {
        CANCELAMENTO_ITENS: 5,
        CANCELAMENTO_CUPOM: 5,
      };
      return {
        valorIndicador: (c) => valores[c] ?? 0,
        mediaIndicador: (c) => medias[c] ?? 0,
      };
    }

    it('monta a EntradaScore com meta individual derivada, cancelamentos e não-retornos', async () => {
      // metaGlobal = 2000 (troco CONFIG) + 2000 (recargas) = 4000; 4 operadores
      // → metaIndividual = 1000. aporteReal = 200 + 300 = 500 → contribuição 50.
      const { service, contarNaoRetornos } = criarServico({
        metaIndicador: null,
        recargasResolver: 2000,
        nOperadoresAtivos: 4,
        naoRetornos: 0,
      });
      const { valorIndicador, mediaIndicador } = insumos();
      const score = await chamar(service, [
        'op1',
        -1,
        0, // taxaFaltas → assiduidade 100
        INICIO,
        FIM,
        FIM_EXCL,
        valorIndicador,
        mediaIndicador,
      ]);

      const comp = (chave: string): number =>
        score.componentes.find((c: { chave: string }) => c.chave === chave)
          ?.valor;
      expect(comp('assiduidade')).toBe(100);
      expect(comp('contribuicao')).toBe(50); // 500 / 1000 * 100
      expect(comp('disciplina')).toBe(100); // cancel 0 <= base 10, sem não-retorno
      // score = round(100*.4 + 50*.3 + 100*.3) = 85 → BOM
      expect(score.valor).toBe(85);
      expect(score.nivel).toBe('BOM');
      expect(contarNaoRetornos).toHaveBeenCalledWith('op1', INICIO, FIM_EXCL);
    });

    it('penaliza a Disciplina pelos não-retornos do período', async () => {
      const { service } = criarServico({
        metaIndicador: null,
        recargasResolver: 2000,
        nOperadoresAtivos: 4,
        naoRetornos: 2,
      });
      const { valorIndicador, mediaIndicador } = insumos();
      const score = await chamar(service, [
        'op1',
        -1,
        0,
        INICIO,
        FIM,
        FIM_EXCL,
        valorIndicador,
        mediaIndicador,
      ]);
      const disciplina = score.componentes.find(
        (c: { chave: string }) => c.chave === 'disciplina',
      )?.valor;
      // 100 - 2 * PENAL_POR_NAO_RETORNO(20) = 60.
      expect(disciplina).toBe(60);
    });

    it('usa sub-nota de Contribuição neutra quando não há operadores ativos (meta indefinida)', async () => {
      const { service } = criarServico({
        metaIndicador: null,
        recargasResolver: 2000,
        nOperadoresAtivos: 0, // → metaIndividualDerivada = null
        naoRetornos: 0,
      });
      const { valorIndicador, mediaIndicador } = insumos();
      const score = await chamar(service, [
        'op1',
        -1,
        0,
        INICIO,
        FIM,
        FIM_EXCL,
        valorIndicador,
        mediaIndicador,
      ]);
      const contribuicao = score.componentes.find(
        (c: { chave: string }) => c.chave === 'contribuicao',
      )?.valor;
      expect(contribuicao).toBe(50); // NEUTRA
    });
  });
});
