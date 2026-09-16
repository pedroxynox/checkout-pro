import {
  ORIGENS_FORA_DO_INDICADOR,
  SENTIDO_SACOLAS,
  avaliarMes,
  avisoDeEntregas,
  compararComAnterior,
  desvioDaMeta,
  emFardos,
  estadoDoIndicador,
  reaisPorSacola,
  textoDoMes,
  vendaPorSacola,
} from './sacolas.domain';

/**
 * Domínio puro do indicador SACOLAS (ADR 0022).
 *
 * O foco é o que pode dar errado em silêncio: um mês sem entrega virar "R$ 0,00"
 * (que se leria como catástrofe), o semáforo julgar ao contrário, e o número
 * aparecer sem a distância até a meta.
 */
const META = 28; // R$ 28,00 de venda por sacola (o piso)

describe('vendaPorSacola', () => {
  it('exemplo do dono do projeto: 200 fardos e R$ 3 milhões → R$ 15,00', () => {
    expect(vendaPorSacola(3_000_000, 200_000)).toBe(15);
  });

  it('arredonda em 2 casas (é um valor em R$)', () => {
    expect(vendaPorSacola(1000, 3)).toBe(333.33);
  });

  it('mês sem entrada devolve null, nunca zero', () => {
    // Zero seria indistinguível de um mês péssimo — e é essa a distinção que
    // o gestor precisa fazer.
    expect(vendaPorSacola(3_000_000, 0)).toBeNull();
  });

  it('mês sem venda registrada devolve null', () => {
    expect(vendaPorSacola(0, 200_000)).toBeNull();
  });

  it('não estoura com valores inválidos', () => {
    expect(vendaPorSacola(Number.NaN, 200_000)).toBeNull();
    expect(vendaPorSacola(3_000_000, Number.NaN)).toBeNull();
    expect(vendaPorSacola(3_000_000, -5)).toBeNull();
  });
});

describe('estadoDoIndicador', () => {
  it('distingue os três casos', () => {
    expect(estadoDoIndicador(3_000_000, 200_000)).toBe('OK');
    expect(estadoDoIndicador(3_000_000, 0)).toBe('SEM_ENTRADA');
    expect(estadoDoIndicador(0, 200_000)).toBe('SEM_VENDA');
  });

  it('sem entrada vence sem venda (não há denominador)', () => {
    expect(estadoDoIndicador(0, 0)).toBe('SEM_ENTRADA');
  });
});

describe('emFardos', () => {
  it('converte pelo fator do cadastro', () => {
    expect(emFardos(200_000, 1000)).toBe(200);
    expect(emFardos(1500, 1000)).toBe(2); // arredonda
  });

  it('fator inválido não estoura', () => {
    expect(emFardos(200_000, 0)).toBe(0);
    expect(emFardos(200_000, -1)).toBe(0);
  });
});

describe('desvioDaMeta', () => {
  it('acima do piso: desvio positivo', () => {
    expect(desvioDaMeta(34, META)).toEqual({
      absoluto: 6,
      percentual: 21.43,
      noPiso: true,
    });
  });

  it('abaixo do piso: desvio negativo', () => {
    expect(desvioDaMeta(22, META)).toEqual({
      absoluto: -6,
      percentual: -21.43,
      noPiso: false,
    });
  });

  it('exatamente no piso conta como no piso', () => {
    expect(desvioDaMeta(28, META)?.noPiso).toBe(true);
    expect(desvioDaMeta(28, META)?.absoluto).toBe(0);
  });

  it('sem valor ou sem meta não há desvio', () => {
    expect(desvioDaMeta(null, META)).toBeNull();
    expect(desvioDaMeta(30, 0)).toBeNull();
  });
});

describe('avaliarMes — o semáforo', () => {
  it('no piso ou acima é OK, e passar da meta NUNCA é alerta', () => {
    expect(avaliarMes(3_000_000, 100_000, META).nivel).toBe('OK'); // R$ 30
    expect(avaliarMes(9_000_000, 100_000, META).nivel).toBe('OK'); // R$ 90
    expect(avaliarMes(2_800_000, 100_000, META).nivel).toBe('OK'); // R$ 28
  });

  /**
   * A REGRESSÃO que motivou trocar `base` por `sentido` em `nivelDoMes`: com a
   * regra antiga, R$ 22,00 por sacola sairia VERDE — o mês de maior desperdício
   * seria premiado.
   */
  it('abaixo do piso é o lado ruim (não o contrário)', () => {
    expect(avaliarMes(2_200_000, 100_000, META).nivel).toBe('ATENCAO'); // R$ 22
    expect(avaliarMes(1_500_000, 100_000, META).nivel).toBe('FORA'); // R$ 15
    expect(avaliarMes(2_200_000, 100_000, META).cumpriu).toBe(false);
  });

  it('sem entrada não tem semáforo (não se acusa a loja de algo que não houve)', () => {
    const a = avaliarMes(3_000_000, 0, META);
    expect(a.valor).toBeNull();
    expect(a.nivel).toBeNull();
    expect(a.cumpriu).toBeNull();
    expect(a.desvio).toBeNull();
    expect(a.estado).toBe('SEM_ENTRADA');
  });

  it('meta zerada não gera semáforo', () => {
    expect(avaliarMes(3_000_000, 100_000, 0).nivel).toBeNull();
  });

  it('o sentido é sempre MAIOR_MELHOR', () => {
    expect(SENTIDO_SACOLAS).toBe('MAIOR_MELHOR');
  });
});

describe('compararComAnterior', () => {
  it('subir é MELHOROU (maior é melhor)', () => {
    const c = compararComAnterior(33, 30);
    expect(c.variacao).toBeCloseTo(10);
    expect(c.evolucao).toBe('MELHOROU');
  });

  it('cair é PIOROU', () => {
    expect(compararComAnterior(27, 30).evolucao).toBe('PIOROU');
  });

  it('variação pequena é ESTAVEL', () => {
    expect(compararComAnterior(30.1, 30).evolucao).toBe('ESTAVEL');
  });

  it('sem mês anterior não inventa comparação', () => {
    expect(compararComAnterior(30, null)).toEqual({
      valorAnterior: null,
      variacao: null,
      evolucao: null,
    });
  });
});

describe('avisoDeEntregas', () => {
  it('2 entregas é o normal: nada a dizer', () => {
    expect(avisoDeEntregas(2)).toBeNull();
  });

  it('1 entrega avisa que o indicador infla', () => {
    expect(avisoDeEntregas(1)).toContain('mais alto');
  });

  it('3 ou mais avisa que a queda pode não ser desperdício', () => {
    expect(avisoDeEntregas(3)).toContain('não necessariamente por desperdício');
    expect(avisoDeEntregas(4)).toContain('4 entregas');
  });

  it('nenhuma entrega não gera aviso (o estado já diz isso)', () => {
    expect(avisoDeEntregas(0)).toBeNull();
  });
});

describe('textoDoMes', () => {
  it('mês normal traz o valor, os fardos e a distância até a meta', () => {
    const a = avaliarMes(3_000_000, 100_000, META); // R$ 30,00
    const t = textoDoMes(a, 100_000, 100);
    expect(t).toContain('R$ 30,00 de venda por sacola');
    expect(t).toContain('100 fardos');
    expect(t).toContain('R$ 2,00 acima da meta');
  });

  it('abaixo da meta diz "abaixo", com a distância', () => {
    const a = avaliarMes(2_200_000, 100_000, META); // R$ 22,00
    expect(textoDoMes(a, 100_000, 100)).toContain('R$ 6,00 abaixo da meta');
  });

  it('mês sem entrega explica, em vez de mostrar zero', () => {
    const a = avaliarMes(3_000_000, 0, META);
    expect(textoDoMes(a, 0, 0)).toContain('Nenhuma sacola entrou');
  });

  it('mês sem venda aponta os arquivos que faltam', () => {
    const a = avaliarMes(0, 200_000, META);
    expect(textoDoMes(a, 200_000, 200)).toContain('arquivos de venda');
  });
});

describe('reaisPorSacola', () => {
  it('formata em pt-BR com duas casas', () => {
    expect(reaisPorSacola(15)).toBe('R$ 15,00');
    expect(reaisPorSacola(28.5)).toBe('R$ 28,50');
  });
});

describe('ORIGENS_FORA_DO_INDICADOR', () => {
  it('exclui o estoque inicial, que não foi uma compra', () => {
    expect(ORIGENS_FORA_DO_INDICADOR).toContain('ESTOQUE_INICIAL');
  });

  it('não exclui as entradas reais', () => {
    for (const origem of ['ENTRADA', 'REQUISICAO', 'PEDIDO_RECORRENTE']) {
      expect(ORIGENS_FORA_DO_INDICADOR).not.toContain(origem);
    }
  });
});
