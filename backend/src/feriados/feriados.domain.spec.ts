import {
  domingoDePascoa,
  ehFeriadoNacional,
  feriadosNacionais,
} from './feriados.domain';

/**
 * Testes dos feriados nacionais. As datas de Páscoa são conhecidas e servem de
 * âncora para verificar o Computus e a Sexta-feira Santa.
 */
describe('feriados nacionais do Brasil', () => {
  it('calcula o Domingo de Páscoa corretamente (anos conhecidos)', () => {
    expect(domingoDePascoa(2024).toISOString().slice(0, 10)).toBe('2024-03-31');
    expect(domingoDePascoa(2025).toISOString().slice(0, 10)).toBe('2025-04-20');
    expect(domingoDePascoa(2026).toISOString().slice(0, 10)).toBe('2026-04-05');
  });

  it('Sexta-feira Santa é 2 dias antes da Páscoa', () => {
    const sexta = feriadosNacionais(2026).find(
      (f) => f.nome === 'Sexta-feira Santa',
    );
    expect(sexta?.data.toISOString().slice(0, 10)).toBe('2026-04-03');
  });

  it('inclui os feriados fixos, incluindo Consciência Negra (20/11)', () => {
    const nomes = feriadosNacionais(2026).map((f) => f.nome);
    expect(nomes).toContain('Confraternização Universal');
    expect(nomes).toContain('Natal');
    expect(nomes).toContain('Consciência Negra');
    // 10 feriados: 9 fixos + Sexta-feira Santa.
    expect(feriadosNacionais(2026)).toHaveLength(10);
  });

  it('ehFeriadoNacional reconhece Natal e nega um dia comum', () => {
    expect(ehFeriadoNacional(new Date(Date.UTC(2026, 11, 25)))).toBe(true);
    expect(ehFeriadoNacional(new Date(Date.UTC(2026, 11, 26)))).toBe(false);
  });
});
