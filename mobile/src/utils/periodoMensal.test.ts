/**
 * Utilitários do período mensal ("AAAA-MM").
 *
 * O mês de referência é o mês-calendário de **Brasília** (UTC−3): à noite, o
 * relógio UTC já virou o dia (e às vezes o mês), mas para a loja ainda é o mês
 * anterior. É o que sustenta a navegação de meses nos Indicadores e nas Metas.
 */
import {
  deslocarMes,
  mesAtual,
  mesesAtras,
  rotuloMes,
  ultimoDiaDoMesISO,
} from './periodoMensal';

describe('mesAtual (fuso de Brasília)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('mantém o mês de Brasília quando o UTC já virou para o mês seguinte', () => {
    // 2026-09-01T01:30Z = 2026-08-31 22:30 em Brasília → ainda agosto.
    jest.useFakeTimers().setSystemTime(new Date('2026-09-01T01:30:00.000Z'));
    expect(mesAtual()).toBe('2026-08');
  });

  it('coincide com o mês UTC durante o horário comercial', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-15T15:00:00.000Z'));
    expect(mesAtual()).toBe('2026-08');
  });
});

describe('deslocarMes', () => {
  it('atravessa a virada de ano nos dois sentidos', () => {
    expect(deslocarMes('2026-01', -1)).toBe('2025-12');
    expect(deslocarMes('2026-12', 1)).toBe('2027-01');
  });

  it('volta 24 meses (a janela do histórico de indicadores)', () => {
    expect(deslocarMes('2026-08', -23)).toBe('2024-09');
  });
});

describe('rotuloMes', () => {
  it('escreve o mês por extenso, com maiúscula inicial', () => {
    expect(rotuloMes('2026-06')).toBe('Junho de 2026');
    expect(rotuloMes('2026-01')).toBe('Janeiro de 2026');
  });
});

describe('ultimoDiaDoMesISO', () => {
  it('resolve o último dia de meses de 30, 31 e 28 dias', () => {
    expect(ultimoDiaDoMesISO('2026-08')).toBe('2026-08-31');
    expect(ultimoDiaDoMesISO('2026-04')).toBe('2026-04-30');
    expect(ultimoDiaDoMesISO('2026-02')).toBe('2026-02-28');
  });

  it('resolve fevereiro de ano bissexto', () => {
    expect(ultimoDiaDoMesISO('2028-02')).toBe('2028-02-29');
  });
});

describe('mesesAtras', () => {
  it('mede a distância em meses, inclusive atravessando anos', () => {
    expect(mesesAtras('2026-08', '2026-08')).toBe(0);
    expect(mesesAtras('2026-07', '2026-08')).toBe(1);
    expect(mesesAtras('2024-09', '2026-08')).toBe(23);
  });

  it('é negativo para um mês no futuro (usado para bloquear a seta)', () => {
    expect(mesesAtras('2026-09', '2026-08')).toBe(-1);
  });
});
