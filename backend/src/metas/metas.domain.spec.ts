import {
  CONFIG_METAS,
  TIPOS_META,
  ehMetaDerivada,
  intervaloDoMes,
  metaDeEstimativas,
} from './metas.domain';

/**
 * Testes do domínio puro das Metas mensais, com foco na regra nova: a meta de
 * VENDAS é a soma das estimativas diárias do mês (ADR 0017). Sem I/O — a
 * leitura no banco fica no serviço.
 */
describe('metas.domain', () => {
  describe('ehMetaDerivada', () => {
    it('marca VENDAS como derivada (não digitável)', () => {
      expect(ehMetaDerivada('VENDAS')).toBe(true);
    });

    it('mantém todas as outras metas como digitadas', () => {
      const digitadas = TIPOS_META.filter((t) => t !== 'VENDAS');
      expect(digitadas).toHaveLength(6);
      for (const tipo of digitadas) {
        expect(ehMetaDerivada(tipo)).toBe(false);
      }
    });

    /**
     * SACOLAS tem o **valor apurado** calculado pelo sistema (venda do mês ÷
     * sacolas recebidas), mas a **meta** é digitada pelo gestor. Derivada é
     * sobre o alvo, não sobre o realizado — confundir os dois deixaria a meta
     * somente leitura na tela e sem como ser definida.
     */
    it('SACOLAS é digitada: o apurado é calculado, a meta não', () => {
      expect(ehMetaDerivada('SACOLAS')).toBe(false);
    });
  });

  describe('CONFIG_METAS.SACOLAS', () => {
    it('é uma razão em R$ por unidade, com piso de R$ 28,00', () => {
      const cfg = CONFIG_METAS.SACOLAS;
      expect(cfg.unidade).toBe('REAIS_POR_UNIDADE');
      expect(cfg.valorPadrao).toBe(28);
    });

    it('é MAIOR_MELHOR: vender mais por sacola é usar menos sacolas', () => {
      expect(CONFIG_METAS.SACOLAS.sentido).toBe('MAIOR_MELHOR');
    });
  });

  /**
   * O teto do indicador calculado Cancelamentos Totais (itens + cupom sobre as
   * vendas). Duas coisas precisam ficar travadas por teste:
   *  - ele é **digitado** (o gestor edita o mês em Centro de Controle ▸ Metas);
   *  - o padrão é 0,75% e **não** a soma das duas metas (0,75 + 0,5 = 1,25). É
   *    um limite global mais exigente, decidido pelo dono do projeto; se alguém
   *    "corrigir" isso para a soma, o indicador deixa de apertar o total.
   */
  describe('CONFIG_METAS.CANCELAMENTOS_TOTAIS', () => {
    it('é um percentual sobre as vendas, com teto padrão de 0,75%', () => {
      const cfg = CONFIG_METAS.CANCELAMENTOS_TOTAIS;
      expect(cfg.unidade).toBe('PERCENTUAL');
      expect(cfg.sentido).toBe('MENOR_MELHOR');
      expect(cfg.valorPadrao).toBe(0.75);
    });

    it('não é a soma das metas das duas metades', () => {
      const soma =
        CONFIG_METAS.CANCELAMENTO_ITENS.valorPadrao +
        CONFIG_METAS.CANCELAMENTO_CUPOM.valorPadrao;
      expect(CONFIG_METAS.CANCELAMENTOS_TOTAIS.valorPadrao).not.toBe(soma);
    });

    it('é digitada pelo gestor, não derivada', () => {
      expect(ehMetaDerivada('CANCELAMENTOS_TOTAIS')).toBe(false);
    });
  });

  describe('metaDeEstimativas', () => {
    it('soma as estimativas diárias do mês', () => {
      expect(metaDeEstimativas([10000, 12500.5, 8000.25])).toBe(30500.75);
    });

    it('mês sem estimativas resolve 0 ("meta ainda não definida")', () => {
      expect(metaDeEstimativas([])).toBe(0);
    });

    it('arredonda em 2 casas (valor monetário)', () => {
      expect(metaDeEstimativas([0.014, 0.014])).toBe(0.03);
    });

    it('ignora valores não finitos em vez de propagar NaN', () => {
      expect(metaDeEstimativas([100, NaN, Infinity, 50])).toBe(150);
    });

    it('nunca devolve meta negativa', () => {
      expect(metaDeEstimativas([-500])).toBe(0);
    });
  });

  describe('intervaloDoMes', () => {
    it('cobre o mês inteiro em UTC, com fim exclusivo', () => {
      const { inicio, fim } = intervaloDoMes('2026-06');
      expect(inicio.toISOString()).toBe('2026-06-01T00:00:00.000Z');
      expect(fim.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    });

    it('vira o ano corretamente em dezembro', () => {
      const { inicio, fim } = intervaloDoMes('2026-12');
      expect(inicio.toISOString()).toBe('2026-12-01T00:00:00.000Z');
      expect(fim.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    });

    it('recusa período fora do formato AAAA-MM', () => {
      expect(() => intervaloDoMes('2026-13')).toThrow(RangeError);
      expect(() => intervaloDoMes('junho/2026')).toThrow(RangeError);
    });
  });
});
