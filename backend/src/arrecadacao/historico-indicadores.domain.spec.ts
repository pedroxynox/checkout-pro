import {
  anoMesDeslocado,
  anoMesLimiteDaJanela,
  cumpriuMeta,
  evolucaoDoMes,
  fimDoAnoMes,
  inicioDoAnoMes,
  inicioDoProximoAnoMes,
  janelaDeMeses,
  MESES_HISTORICO_PADRAO,
  nivelDoMes,
  rotuloAnoMes,
  sequenciaCumprindo,
  valorComparavel,
  variacaoMensal,
} from './historico-indicadores.domain';

/**
 * Domínio puro do Histórico de Indicadores. O caso mais importante aqui é a
 * leitura da variação: em cancelamentos e devoluções **quanto menor, melhor**,
 * então cair é MELHORAR — o oposto do troco solidário e das recargas.
 */
describe('Histórico de indicadores — domínio puro', () => {
  describe('aritmética do período mensal', () => {
    it('resolve início, próximo mês e último dia de um "AAAA-MM"', () => {
      expect(inicioDoAnoMes('2026-08').toISOString()).toBe(
        '2026-08-01T00:00:00.000Z',
      );
      expect(inicioDoProximoAnoMes('2026-08').toISOString()).toBe(
        '2026-09-01T00:00:00.000Z',
      );
      expect(fimDoAnoMes('2026-08').toISOString()).toBe(
        '2026-08-31T00:00:00.000Z',
      );
      // Fevereiro de ano bissexto.
      expect(fimDoAnoMes('2028-02').toISOString()).toBe(
        '2028-02-29T00:00:00.000Z',
      );
    });

    it('desloca meses atravessando a virada de ano nos dois sentidos', () => {
      expect(anoMesDeslocado('2026-01', -1)).toBe('2025-12');
      expect(anoMesDeslocado('2026-12', 1)).toBe('2027-01');
      expect(anoMesDeslocado('2026-08', -24)).toBe('2024-08');
      expect(anoMesDeslocado('2026-08', 0)).toBe('2026-08');
    });

    it('monta a janela do mais antigo ao mais recente, terminando no mês pedido', () => {
      expect(janelaDeMeses('2026-03', 4)).toEqual([
        '2025-12',
        '2026-01',
        '2026-02',
        '2026-03',
      ]);
      const janela = janelaDeMeses('2026-08', MESES_HISTORICO_PADRAO);
      expect(janela).toHaveLength(24);
      expect(janela[0]).toBe('2024-09');
      expect(janela[23]).toBe('2026-08');
    });

    it('nunca devolve janela vazia, mesmo com quantidade inválida', () => {
      expect(janelaDeMeses('2026-08', 0)).toEqual(['2026-08']);
      expect(janelaDeMeses('2026-08', -5)).toEqual(['2026-08']);
    });

    it('o mês limite da janela é o mais antigo que PERMANECE', () => {
      // Com 24 meses e o mês atual em agosto/2026, o mais antigo conservado é
      // setembro/2024 — tudo anterior a isso pode ser apagado.
      expect(anoMesLimiteDaJanela('2026-08', 24)).toBe('2024-09');
      expect(anoMesLimiteDaJanela('2026-08', 1)).toBe('2026-08');
    });

    it('o limite ordena lexicograficamente igual à ordem cronológica', () => {
      // Garantia usada pela limpeza (compara "AAAA-MM" como texto no banco).
      expect('2024-09' < '2024-10').toBe(true);
      expect('2024-12' < '2025-01').toBe(true);
      expect(anoMesLimiteDaJanela('2026-01', 24) < '2026-01').toBe(true);
    });

    it('rotula o mês de forma curta e legível', () => {
      expect(rotuloAnoMes('2026-08')).toBe('ago/26');
      expect(rotuloAnoMes('2025-01')).toBe('jan/25');
      expect(rotuloAnoMes('2024-12')).toBe('dez/24');
    });
  });

  describe('valor comparável do mês', () => {
    it('base FIXA usa o total em reais', () => {
      expect(valorComparavel('FIXA', 2500, 900000)).toBe(2500);
    });

    it('base VENDAS usa o percentual sobre as vendas', () => {
      expect(valorComparavel('VENDAS', 900, 100000)).toBeCloseTo(0.9);
    });

    it('base VENDAS sem vendas registradas não divide por zero', () => {
      expect(valorComparavel('VENDAS', 900, 0)).toBe(0);
    });
  });

  describe('semáforo e cumprimento da meta', () => {
    it('base FIXA: atingir a meta é OK; de 75% para cima, atenção', () => {
      expect(nivelDoMes('FIXA', 2000, 2000)).toBe('OK');
      expect(nivelDoMes('FIXA', 2500, 2000)).toBe('OK');
      expect(nivelDoMes('FIXA', 1500, 2000)).toBe('ATENCAO');
      expect(nivelDoMes('FIXA', 1499, 2000)).toBe('FORA');
    });

    it('base VENDAS: dentro da meta é OK; até 1,5× a meta, atenção', () => {
      expect(nivelDoMes('VENDAS', 0.5, 0.75)).toBe('OK');
      expect(nivelDoMes('VENDAS', 0.75, 0.75)).toBe('OK');
      expect(nivelDoMes('VENDAS', 1.0, 0.75)).toBe('ATENCAO');
      expect(nivelDoMes('VENDAS', 1.2, 0.75)).toBe('FORA');
    });

    it('cumpriuMeta não tem meio-termo (serve para contar sequências)', () => {
      expect(cumpriuMeta('FIXA', 2000, 2000)).toBe(true);
      expect(cumpriuMeta('FIXA', 1999, 2000)).toBe(false);
      expect(cumpriuMeta('VENDAS', 0.75, 0.75)).toBe(true);
      expect(cumpriuMeta('VENDAS', 0.76, 0.75)).toBe(false);
    });
  });

  describe('variação de um mês para o outro', () => {
    it('calcula a variação percentual', () => {
      expect(variacaoMensal(110, 100)).toBeCloseTo(10);
      expect(variacaoMensal(90, 100)).toBeCloseTo(-10);
    });

    it('devolve null quando não há base de comparação', () => {
      expect(variacaoMensal(100, 0)).toBeNull();
      expect(variacaoMensal(100, -5)).toBeNull();
      expect(variacaoMensal(100, Number.NaN)).toBeNull();
    });
  });

  describe('evolução respeita o SENTIDO do indicador', () => {
    it('troco/recargas (maior é melhor): subir é melhora', () => {
      expect(evolucaoDoMes('MAIOR_MELHOR', 12)).toBe('MELHOROU');
      expect(evolucaoDoMes('MAIOR_MELHOR', -12)).toBe('PIOROU');
    });

    it('cancelamentos/devoluções (menor é melhor): CAIR é melhora', () => {
      expect(evolucaoDoMes('MENOR_MELHOR', -12)).toBe('MELHOROU');
      expect(evolucaoDoMes('MENOR_MELHOR', 12)).toBe('PIOROU');
    });

    it('variação pequena é ruído: fica ESTAVEL nos dois sentidos', () => {
      expect(evolucaoDoMes('MAIOR_MELHOR', 0.4)).toBe('ESTAVEL');
      expect(evolucaoDoMes('MENOR_MELHOR', -0.4)).toBe('ESTAVEL');
      expect(evolucaoDoMes('MAIOR_MELHOR', 0)).toBe('ESTAVEL');
    });

    it('sem variação não há evolução para interpretar', () => {
      expect(evolucaoDoMes('MAIOR_MELHOR', null)).toBeNull();
      expect(evolucaoDoMes('MENOR_MELHOR', null)).toBeNull();
    });
  });

  describe('sequência de meses cumprindo a meta', () => {
    const m = (cumpriuMeta: boolean, semDados = false) => ({
      cumpriuMeta,
      semDados,
    });

    it('conta do mês mais recente para trás e para no primeiro que falhou', () => {
      expect(
        sequenciaCumprindo([m(true), m(false), m(true), m(true), m(true)]),
      ).toBe(3);
    });

    it('é zero quando o mês mais recente não cumpriu', () => {
      expect(sequenciaCumprindo([m(true), m(true), m(false)])).toBe(0);
    });

    it('ignora meses sem dados (não são sucesso nem falha)', () => {
      expect(
        sequenciaCumprindo([m(true), m(false, true), m(true), m(false, true)]),
      ).toBe(2);
    });

    it('é zero para série vazia', () => {
      expect(sequenciaCumprindo([])).toBe(0);
    });
  });
});
