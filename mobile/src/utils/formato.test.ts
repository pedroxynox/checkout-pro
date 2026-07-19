/**
 * Testes do cálculo de "hoje" no fuso de Brasília (UTC−3).
 *
 * Garante que, mesmo quando o relógio do sistema (UTC) já passou da meia-noite,
 * o dia-calendário continue sendo o de Brasília — evitando que, à noite, o app
 * mostre/registre o dia seguinte.
 */
import { diaSemanaHoje, formatarCronometro, hojeISO } from './formato';


import { mascaraMilhar, parseNumeroBR } from './formato';

describe('hojeISO / diaSemanaHoje (fuso de Brasília)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('mantém o dia de Brasília após a meia-noite UTC (noite em Brasília)', () => {
    // 2026-06-20T01:30Z = 2026-06-19 22:30 em Brasília → ainda sexta-feira, 19.
    jest.useFakeTimers().setSystemTime(new Date('2026-06-20T01:30:00.000Z'));
    expect(hojeISO()).toBe('2026-06-19');
    expect(diaSemanaHoje()).toBe(5); // sexta-feira
  });

  it('coincide com o dia UTC durante o horário comercial', () => {
    // 2026-06-19T12:00Z = 2026-06-19 09:00 em Brasília.
    jest.useFakeTimers().setSystemTime(new Date('2026-06-19T12:00:00.000Z'));
    expect(hojeISO()).toBe('2026-06-19');
    expect(diaSemanaHoje()).toBe(5);
  });

  it('vira o dia exatamente à meia-noite de Brasília (03:00 UTC)', () => {
    // 2026-06-20T03:00Z = 2026-06-20 00:00 em Brasília → sábado, 20.
    jest.useFakeTimers().setSystemTime(new Date('2026-06-20T03:00:00.000Z'));
    expect(hojeISO()).toBe('2026-06-20');
    expect(diaSemanaHoje()).toBe(6); // sábado
  });
});

describe('mascaraMilhar (separador de milhar pt-BR)', () => {
  it('agrupa milhares conforme a grandeza', () => {
    expect(mascaraMilhar('1000')).toBe('1.000');
    expect(mascaraMilhar('1000000')).toBe('1.000.000');
    expect(mascaraMilhar('999')).toBe('999');
    expect(mascaraMilhar('12345')).toBe('12.345');
  });

  it('aceita vírgula decimal (até 2 casas) e mantém o zero', () => {
    expect(mascaraMilhar('1234,5')).toBe('1.234,5');
    expect(mascaraMilhar('1234,567')).toBe('1.234,56');
    expect(mascaraMilhar('0,75')).toBe('0,75');
  });

  it('descarta caracteres inválidos e zeros à esquerda', () => {
    expect(mascaraMilhar('R$ 1.000abc')).toBe('1.000');
    expect(mascaraMilhar('007')).toBe('7');
    expect(mascaraMilhar('')).toBe('');
  });

  it('parseNumeroBR desfaz a máscara', () => {
    expect(parseNumeroBR('1.000')).toBe(1000);
    expect(parseNumeroBR('1.234,5')).toBe(1234.5);
    expect(parseNumeroBR('0,75')).toBe(0.75);
    expect(parseNumeroBR('')).toBe(0);
  });
});


describe('formatarCronometro', () => {
  it('mostra M:SS abaixo de 1h', () => {
    expect(formatarCronometro(0)).toBe('0:00');
    expect(formatarCronometro(65 * 1000)).toBe('1:05');
    expect(formatarCronometro((59 * 60 + 59) * 1000)).toBe('59:59');
  });

  it('mostra H:MM:SS a partir de 1h', () => {
    expect(formatarCronometro(3600 * 1000)).toBe('1:00:00');
    expect(formatarCronometro((3 * 3600 + 5 * 60 + 9) * 1000)).toBe('3:05:09');
  });

  it('nunca é negativo', () => {
    expect(formatarCronometro(-5000)).toBe('0:00');
  });
});
