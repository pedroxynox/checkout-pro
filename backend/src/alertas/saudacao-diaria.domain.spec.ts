import {
  montarSaudacaoDiaria,
  saudacaoPeriodo,
} from './saudacao-diaria.domain';

/**
 * Testes da lógica pura da saudação diária: a saudação certa por hora e a
 * mensagem conforme o resultado de ontem (subiu, caiu, sem comparação, sem
 * dado).
 */
describe('saudacao-diaria.domain', () => {
  it('saudacaoPeriodo muda por faixa de hora', () => {
    expect(saudacaoPeriodo(6)).toBe('Bom dia');
    expect(saudacaoPeriodo(11)).toBe('Bom dia');
    expect(saudacaoPeriodo(12)).toBe('Boa tarde');
    expect(saudacaoPeriodo(17)).toBe('Boa tarde');
    expect(saudacaoPeriodo(18)).toBe('Boa noite');
    expect(saudacaoPeriodo(22)).toBe('Boa noite');
  });

  it('personaliza o título com o primeiro nome e a saudação da hora', () => {
    const { titulo } = montarSaudacaoDiaria({
      primeiroNome: 'Ana',
      hora: 7,
      vendaOntem: 1000,
      variacaoOntem: 10,
    });
    expect(titulo.startsWith('Bom dia, Ana!')).toBe(true);
  });

  it('vendas em alta → mensagem de manter o ritmo', () => {
    const { mensagem } = montarSaudacaoDiaria({
      primeiroNome: 'Bia',
      hora: 7,
      vendaOntem: 12345.6,
      variacaoOntem: 8,
    });
    expect(mensagem).toContain('+8% vs. a semana passada');
    expect(mensagem).toContain('manter o ritmo');
  });

  it('vendas em queda → mensagem de buscar mais', () => {
    const { mensagem } = montarSaudacaoDiaria({
      primeiroNome: 'Cid',
      hora: 13,
      vendaOntem: 8000,
      variacaoOntem: -15,
    });
    expect(mensagem).toContain('-15% vs. a semana passada');
    expect(mensagem).toContain('buscar mais');
  });

  it('sem comparação (semana passada sem venda) → elogia sem porcentagem', () => {
    const { mensagem } = montarSaudacaoDiaria({
      primeiroNome: 'Duda',
      hora: 8,
      vendaOntem: 5000,
      variacaoOntem: null,
    });
    expect(mensagem).not.toContain('%');
    expect(mensagem).toContain('Ontem a loja vendeu');
  });

  it('sem dado de ontem → mensagem motivadora genérica', () => {
    const { mensagem } = montarSaudacaoDiaria({
      primeiroNome: 'Edu',
      hora: 7,
      vendaOntem: 0,
      variacaoOntem: null,
    });
    expect(mensagem).toContain('ótimo dia');
  });
});
