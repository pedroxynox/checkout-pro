/**
 * Testes do cálculo de "hoje" no fuso de Brasília (UTC−3).
 *
 * Garante que, mesmo quando o relógio do sistema (UTC) já passou da meia-noite,
 * o dia-calendário continue sendo o de Brasília — evitando que, à noite, o app
 * mostre/registre o dia seguinte.
 */
import { diaSemanaHoje, hojeISO } from './formato';

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
