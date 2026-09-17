import { nivelDoMes } from './historico-indicadores.domain';
import {
  META_PADRAO_CANCELAMENTOS_TOTAIS,
  ROTULO_NAO_INFORMADO,
  SENTIDO_CANCELAMENTOS,
  agruparPorRotulo,
  avaliarMes,
  compararComAnterior,
  composicaoDe,
  concentracaoDe,
  desvioDoTeto,
  diagnosticar,
  estadoDoIndicador,
  excedenteEmReais,
  fundirOfensores,
  limiteEmReais,
  percentualSobreVendas,
  perfilDoDano,
  reaisTexto,
  simularSemMaiores,
} from './cancelamentos-totais.domain';

/** Cenário base: R$ 100.000 de venda, R$ 800 de itens e R$ 300 de cupom. */
const VENDAS = 100_000;
const ITENS = 800;
const CUPOM = 300;
const TOTAL = ITENS + CUPOM; // 1.100 → 1,10% das vendas
const META = META_PADRAO_CANCELAMENTOS_TOTAIS; // 0,75%

/**
 * Domínio puro do indicador Cancelamentos Totais.
 *
 * Os dois pontos que mais importam aqui:
 *  1. o semáforo é **o mesmo** do Cancelamento de Itens (nada é recalculado: a
 *     regra vem de `nivelDoMes`);
 *  2. sem venda registrada o mês fica **sem percentual e sem cor**, em vez de
 *     virar "0% verde" — o erro que os outros indicadores ainda cometem.
 */
describe('Cancelamentos Totais — domínio puro', () => {
  describe('estado e percentual', () => {
    it('calcula o percentual da soma das duas metades sobre as vendas', () => {
      expect(percentualSobreVendas(TOTAL, VENDAS)).toBe(1.1);
      expect(estadoDoIndicador(VENDAS, 12)).toBe('OK');
    });

    it('sem venda registrada não inventa 0%: devolve null e estado SEM_VENDA', () => {
      expect(percentualSobreVendas(TOTAL, 0)).toBeNull();
      expect(estadoDoIndicador(0, 12)).toBe('SEM_VENDA');
    });

    it('mês sem cancelamento e sem venda é SEM_MOVIMENTO', () => {
      expect(estadoDoIndicador(0, 0)).toBe('SEM_MOVIMENTO');
    });

    it('zero cancelamento com venda registrada é um 0% legítimo (e verde)', () => {
      const a = avaliarMes(0, VENDAS, 0, META);
      expect(a.estado).toBe('OK');
      expect(a.valor).toBe(0);
      expect(a.nivel).toBe('OK');
      expect(a.cumpriu).toBe(true);
    });
  });

  describe('semáforo — igual ao Cancelamento de Itens', () => {
    it('usa a mesma regra da fonte única (dentro da meta, 1,5× a meta, acima)', () => {
      const dentro = avaliarMes(700, VENDAS, 5, META); // 0,70%
      const atencao = avaliarMes(1_100, VENDAS, 5, META); // 1,10%
      const fora = avaliarMes(1_200, VENDAS, 5, META); // 1,20%

      expect(dentro.nivel).toBe('OK');
      expect(atencao.nivel).toBe('ATENCAO');
      expect(fora.nivel).toBe('FORA');

      // Nenhum limiar novo: o resultado é idêntico ao da função compartilhada.
      expect(dentro.nivel).toBe(nivelDoMes(SENTIDO_CANCELAMENTOS, 0.7, META));
      expect(atencao.nivel).toBe(nivelDoMes(SENTIDO_CANCELAMENTOS, 1.1, META));
      expect(fora.nivel).toBe(nivelDoMes(SENTIDO_CANCELAMENTOS, 1.2, META));
    });

    it('sem venda não pinta cor nenhuma (nivel e cumpriu ficam null)', () => {
      const a = avaliarMes(TOTAL, 0, 12, META);
      expect(a.estado).toBe('SEM_VENDA');
      expect(a.valor).toBeNull();
      expect(a.nivel).toBeNull();
      expect(a.cumpriu).toBeNull();
      expect(a.excedente).toBeNull();
    });
  });

  describe('teto em dinheiro', () => {
    it('traduz a meta em reais e mostra quanto passou dela', () => {
      expect(limiteEmReais(VENDAS, META)).toBe(750);
      expect(excedenteEmReais(TOTAL, VENDAS, META)).toBe(350);
    });

    it('dentro da meta o excedente é zero, não negativo', () => {
      expect(excedenteEmReais(700, VENDAS, META)).toBe(0);
    });

    it('o desvio acompanha o valor, com sinal e em pontos percentuais', () => {
      const desvio = desvioDoTeto(1.1, META);
      expect(desvio).toEqual({ absoluto: 0.35, percentual: 46.67, dentro: false });
      expect(desvioDoTeto(0.7, META)?.dentro).toBe(true);
    });
  });

  describe('composição — qual metade manda', () => {
    it('aponta itens como dominante quando ele passa de 60% do valor', () => {
      const c = composicaoDe(ITENS, CUPOM, VENDAS);
      expect(c.participacaoItens).toBe(72.73);
      expect(c.participacaoCupom).toBe(27.27);
      expect(c.percentualItens).toBe(0.8);
      expect(c.percentualCupom).toBe(0.3);
      expect(c.dominante).toBe('ITENS');
    });

    it('aponta cupom como dominante quando é ele que pesa', () => {
      expect(composicaoDe(200, 900, VENDAS).dominante).toBe('CUPOM');
    });

    it('metades parecidas ficam EQUILIBRADO — tratar um lado não resolveria', () => {
      expect(composicaoDe(550, 550, VENDAS).dominante).toBe('EQUILIBRADO');
    });
  });

  describe('ranking combinado', () => {
    it('funde os dois rankings pela mesma pessoa e ordena pelo maior valor', () => {
      const ofensores = fundirOfensores(
        [
          { nome: 'Ana', total: 500 },
          { nome: 'Bia', total: 300 },
        ],
        [{ nome: 'Ana', total: 100 }],
        VENDAS,
      );
      expect(ofensores.map((o) => o.nome)).toEqual(['Ana', 'Bia']);
      expect(ofensores[0]).toEqual({
        nome: 'Ana',
        total: 600,
        totalItens: 500,
        totalCupom: 100,
        participacao: 66.67,
        percentualVendas: 0.6,
      });
    });
  });

  describe('concentração — é gente ou é processo', () => {
    it('poucas pessoas concentrando muito não é "espalhado"', () => {
      const ofensores = fundirOfensores(
        [
          { nome: 'Ana', total: 600 },
          { nome: 'Bia', total: 300 },
        ],
        [],
        VENDAS,
      );
      const c = concentracaoDe(ofensores);
      expect(c.pessoas).toBe(2);
      expect(c.participacaoTop3).toBe(100);
      expect(c.pessoasParaMetade).toBe(1);
      expect(c.espalhado).toBe(false);
    });

    it('valor repartido entre muita gente é problema de processo', () => {
      const lista = Array.from({ length: 10 }, (_, i) => ({
        nome: `Pessoa ${i}`,
        total: 100,
      }));
      const c = concentracaoDe(fundirOfensores(lista, [], VENDAS));
      expect(c.participacaoTop3).toBe(30);
      expect(c.pessoasParaMetade).toBe(5);
      expect(c.espalhado).toBe(true);
    });
  });

  describe('simulação — o que bastaria resolver', () => {
    it('diz se o mês fecharia dentro da meta sem os maiores', () => {
      const ofensores = fundirOfensores(
        [
          { nome: 'Ana', total: 600 },
          { nome: 'Bia', total: 300 },
        ],
        [],
        VENDAS,
      );
      const s = simularSemMaiores(ofensores, TOTAL, VENDAS, META);
      expect(s).toEqual({
        quantos: 2,
        nomes: ['Ana', 'Bia'],
        valorRemovido: 900,
        percentualSimulado: 0.2,
        ficariaDentro: true,
      });
    });

    it('sem venda ou sem ninguém no ranking não há o que simular', () => {
      expect(simularSemMaiores([], TOTAL, VENDAS, META)).toBeNull();
      expect(
        simularSemMaiores([
          { nome: 'Ana', total: 600, totalItens: 600, totalCupom: 0, participacao: 100, percentualVendas: 0.6 },
        ], TOTAL, 0, META),
      ).toBeNull();
    });
  });

  describe('perfil do dano', () => {
    it('reconhece poucos lançamentos grandes', () => {
      const valores = [1_000, 10, 10, 10, 10, 10, 10, 10, 10, 10];
      const p = perfilDoDano(valores);
      expect(p.lancamentos).toBe(10);
      expect(p.maioresConsiderados).toBe(1);
      expect(p.participacaoMaiores).toBe(91.74);
      expect(p.perfil).toBe('POUCOS_GRANDES');
    });

    it('reconhece muitos lançamentos pequenos (é rotina, não exceção)', () => {
      const p = perfilDoDano(Array.from({ length: 20 }, () => 10));
      expect(p.ticketMedio).toBe(10);
      expect(p.participacaoMaiores).toBe(10);
      expect(p.perfil).toBe('MUITOS_PEQUENOS');
    });

    it('mês sem lançamento não quebra nem inventa perfil', () => {
      expect(perfilDoDano([])).toEqual({
        lancamentos: 0,
        ticketMedio: 0,
        maioresConsiderados: 0,
        participacaoMaiores: 0,
        perfil: 'MISTO',
      });
    });
  });

  describe('motivos e autorizadores', () => {
    it('agrupa por texto, soma e ordena pelo mais caro', () => {
      const fatias = agruparPorRotulo([
        { rotulo: 'Cliente desistiu', valor: 300 },
        { rotulo: null, valor: 100 },
        { rotulo: 'Cliente desistiu', valor: 200 },
        { rotulo: 'Erro de digitação', valor: 50 },
      ]);
      expect(fatias[0]).toEqual({
        rotulo: 'Cliente desistiu',
        total: 500,
        lancamentos: 2,
        participacao: 76.92,
      });
      // Um arquivo que não traz motivo é, ele próprio, informação de gestão:
      // aparece como "Não informado" em vez de desaparecer.
      expect(fatias[1].rotulo).toBe(ROTULO_NAO_INFORMADO);
    });
  });

  describe('evolução mês a mês', () => {
    it('cair é MELHORAR neste indicador', () => {
      const c = compararComAnterior(0.7, 1.2);
      expect(c.variacao).toBe(-41.67);
      expect(c.evolucao).toBe('MELHOROU');
    });

    it('subir é PIORAR', () => {
      expect(compararComAnterior(1.2, 0.7).evolucao).toBe('PIOROU');
    });

    it('sem mês anterior comparável não há leitura de evolução', () => {
      expect(compararComAnterior(1.1, null)).toEqual({
        valorAnterior: null,
        variacao: null,
        evolucao: null,
      });
    });
  });

  describe('diagnóstico — o que está impactando e o que fazer', () => {
    const montar = (itens: number, cupom: number, vendas: number, ranking: {
      itens: { nome: string; total: number }[];
      cupom: { nome: string; total: number }[];
    }, extras: {
      motivos?: { rotulo: string | null; valor: number }[];
      autorizadores?: { rotulo: string | null; valor: number }[];
      valores?: number[];
      anterior?: number | null;
    } = {}) => {
      const total = itens + cupom;
      // Lançamentos coerentes com o cenário: um mês sem valor não tem linha
      // nenhuma nos arquivos, e é isso que distingue SEM_MOVIMENTO de SEM_VENDA.
      const lancamentos = extras.valores?.length ?? (total > 0 ? 1 : 0);
      const avaliacao = avaliarMes(total, vendas, lancamentos, META);
      const composicao = composicaoDe(itens, cupom, vendas);
      const ofensores = fundirOfensores(ranking.itens, ranking.cupom, vendas);
      const concentracao = concentracaoDe(ofensores);
      return diagnosticar({
        avaliacao,
        composicao,
        concentracao,
        simulacao: simularSemMaiores(ofensores, total, vendas, META),
        perfil: perfilDoDano(extras.valores ?? [total]),
        motivos: agruparPorRotulo(extras.motivos ?? []),
        autorizadores: agruparPorRotulo(extras.autorizadores ?? []),
        evolucao: compararComAnterior(avaliacao.valor, extras.anterior ?? null)
          .evolucao,
        ofensores,
      });
    };

    it('sem venda no mês, a única conclusão honesta é pedir o arquivo', () => {
      const d = montar(ITENS, CUPOM, 0, { itens: [], cupom: [] });
      expect(d.resumo).toContain('nenhuma venda registrada');
      expect(d.causas).toHaveLength(0);
      expect(d.acoes[0]).toContain('arquivo de vendas');
    });

    it('mês vazio não gera diagnóstico', () => {
      const d = montar(0, 0, 0, { itens: [], cupom: [] });
      expect(d.resumo).toContain('nada a analisar');
      expect(d.causas).toHaveLength(0);
    });

    it('dentro da meta, o resumo diz o valor e a folga até o teto', () => {
      const d = montar(400, 200, VENDAS, {
        itens: [{ nome: 'Ana', total: 400 }],
        cupom: [{ nome: 'Ana', total: 200 }],
      });
      expect(d.resumo).toContain('Dentro da meta');
      expect(d.resumo).toContain('0,60%');
      expect(d.resumo).toContain('−0,15 p.p.');
    });

    it('peso em itens e valor distribuído → ação de processo, não individual', () => {
      const ranking = Array.from({ length: 10 }, (_, i) => ({
        nome: `Pessoa ${i}`,
        total: 100,
      }));
      const d = montar(1_000, 100, VENDAS, { itens: ranking, cupom: [] });
      expect(d.causas[0].titulo).toContain('cancelamento de itens');
      expect(d.causas[1].titulo).toContain('distribuído');
      expect(d.acoes[0]).toContain('escaneamento');
      expect(d.acoes[1]).toContain('processo');
    });

    /**
     * O texto do diagnóstico é lido por quem gere a loja, então o tom importa:
     * português padrão levemente formal, sem gíria e sem anglicismo. Estes dois
     * casos travam os termos que já foram corrigidos uma vez.
     */
    it('não usa anglicismo nem gíria nos textos do diagnóstico', () => {
      const d = montar(
        1_000,
        100,
        VENDAS,
        { itens: [{ nome: 'Ana', total: 900 }], cupom: [] },
        { valores: [800, 100, 100, 50, 50, 50, 50, 50, 50, 50] },
      );
      const texto = [
        d.resumo,
        ...d.causas.map((c) => `${c.titulo} ${c.detalhe}`),
        ...d.acoes,
      ].join(' ');
      expect(texto).not.toMatch(/ticket/i);
      expect(texto).not.toMatch(/espalhad/i);
      expect(texto).not.toMatch(/atacar/i);
      expect(texto).not.toMatch(/metade[s]? do valor vem/i);
    });

    it('peso em cupom e concentrado → critério de autorização e conversa individual', () => {
      const d = montar(
        100,
        1_000,
        VENDAS,
        {
          itens: [],
          cupom: [
            { nome: 'Ana', total: 700 },
            { nome: 'Bia', total: 300 },
          ],
        },
        {
          motivos: [
            // Dois lançamentos do mesmo motivo, para conferir o plural "cupons".
            { rotulo: 'Cliente desistiu', valor: 400 },
            { rotulo: 'Cliente desistiu', valor: 400 },
            { rotulo: 'Erro de preço', valor: 200 },
          ],
          autorizadores: [
            { rotulo: 'Fiscal Carla', valor: 900 },
            { rotulo: 'Fiscal Duda', valor: 100 },
          ],
        },
      );
      expect(d.causas[0].titulo).toContain('cancelamento de cupom');
      expect(d.causas[1].titulo).toContain('concentrado');
      expect(d.causas[1].detalhe).toContain('Ana');
      const motivo = d.causas.find((c) => c.titulo.includes('Cliente desistiu'));
      expect(motivo).toBeDefined();
      // Plural correto: "2 cupons", nunca "2 cupom(ns)".
      expect(motivo?.detalhe).toContain('cupons');
      expect(motivo?.detalhe).not.toContain('cupom(ns)');
      expect(d.acoes.some((a) => a.includes('Ana'))).toBe(true);
    });

    it('quando piora em relação ao mês anterior, o resumo avisa', () => {
      const d = montar(
        1_000,
        200,
        VENDAS,
        { itens: [{ nome: 'Ana', total: 1_000 }], cupom: [] },
        { anterior: 0.5 },
      );
      expect(d.resumo).toContain('Piorou');
      expect(d.resumo).toContain(reaisTexto(450));
    });

    it('nunca despeja mais de 4 causas nem mais de 4 ações', () => {
      const d = montar(
        100,
        5_000,
        VENDAS,
        {
          itens: [],
          cupom: [
            { nome: 'Ana', total: 3_000 },
            { nome: 'Bia', total: 2_000 },
          ],
        },
        {
          motivos: [{ rotulo: 'Cliente desistiu', valor: 5_000 }],
          autorizadores: [
            { rotulo: 'Fiscal Carla', valor: 2_000 },
            { rotulo: 'Fiscal Carla', valor: 2_000 },
            { rotulo: 'Fiscal Carla', valor: 1_000 },
          ],
          valores: [3_000, 2_000, 100],
        },
      );
      expect(d.causas.length).toBeLessThanOrEqual(4);
      expect(d.acoes.length).toBeLessThanOrEqual(4);
    });
  });
});
