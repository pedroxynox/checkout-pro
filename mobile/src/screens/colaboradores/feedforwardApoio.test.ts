/**
 * Testes do apoio da seção Feedforward: cálculo do prazo de um rascunho de
 * ponto ("em X dias/semanas/meses" ou data exata) e o rascunho padrão.
 */
import { PontoRascunho, calcularPrazoISO, pontoVazio } from './feedforwardApoio';

const HOJE = '2026-10-14';

function rascunho(over: Partial<PontoRascunho> = {}): PontoRascunho {
  return { ...pontoVazio(HOJE), ...over };
}

describe('feedforwardApoio — pontoVazio', () => {
  it('padrão é "em 30 dias", com data exata em hoje', () => {
    expect(pontoVazio(HOJE)).toEqual({
      descricao: '',
      modo: 'EM_X',
      dataISO: HOJE,
      quantidade: '30',
      unidade: 'dias',
    });
  });
});

describe('feedforwardApoio — calcularPrazoISO', () => {
  it('em X dias / semanas / meses a partir de hoje', () => {
    expect(calcularPrazoISO(rascunho(), HOJE)).toBe('2026-11-13');
    expect(calcularPrazoISO(rascunho({ quantidade: '2', unidade: 'semanas' }), HOJE)).toBe(
      '2026-10-28',
    );
    expect(calcularPrazoISO(rascunho({ quantidade: '3', unidade: 'meses' }), HOJE)).toBe(
      '2027-01-14',
    );
  });

  it('quantidade vazia, zero ou inválida vira 1', () => {
    expect(calcularPrazoISO(rascunho({ quantidade: '' }), HOJE)).toBe('2026-10-15');
    expect(calcularPrazoISO(rascunho({ quantidade: '0' }), HOJE)).toBe('2026-10-15');
    expect(calcularPrazoISO(rascunho({ quantidade: 'abc' }), HOJE)).toBe('2026-10-15');
  });

  it('modo data exata devolve a data escolhida', () => {
    expect(
      calcularPrazoISO(rascunho({ modo: 'DATA', dataISO: '2026-12-25' }), HOJE),
    ).toBe('2026-12-25');
  });

  it('atravessa a virada do ano', () => {
    expect(
      calcularPrazoISO(rascunho({ quantidade: '20', unidade: 'dias' }), '2026-12-20'),
    ).toBe('2027-01-09');
  });
});
