import {
  chaveDiaUTC,
  diaEncerradoEmBrasilia,
  fimDoDiaBrasiliaEmUtc,
  maiorSequenciaDias,
  periodoFolha,
  periodoFolhaDeslocado,
  rotuloPeriodoFolha,
} from './datas';

/**
 * Testes do ciclo de folha 26→25. As datas do sistema são meia-noite UTC.
 */
describe('periodoFolha (ciclo 26→25)', () => {
  it('dia 26 abre um novo ciclo (26 do mês → 26 do mês seguinte, exclusivo)', () => {
    const p = periodoFolha(new Date(Date.UTC(2026, 5, 26))); // 26/06/2026
    expect(p.inicio.toISOString()).toBe('2026-06-26T00:00:00.000Z');
    expect(p.fimExclusivo.toISOString()).toBe('2026-07-26T00:00:00.000Z');
  });

  it('dia 25 ainda pertence ao ciclo que começou no dia 26 do mês anterior', () => {
    const p = periodoFolha(new Date(Date.UTC(2026, 6, 25))); // 25/07/2026
    expect(p.inicio.toISOString()).toBe('2026-06-26T00:00:00.000Z');
    expect(p.fimExclusivo.toISOString()).toBe('2026-07-26T00:00:00.000Z');
  });

  it('dia 10 pertence ao ciclo aberto no dia 26 do mês anterior', () => {
    const p = periodoFolha(new Date(Date.UTC(2026, 6, 10))); // 10/07/2026
    expect(p.inicio.toISOString()).toBe('2026-06-26T00:00:00.000Z');
    expect(p.fimExclusivo.toISOString()).toBe('2026-07-26T00:00:00.000Z');
  });

  it('vira o ano corretamente (janeiro pertence ao ciclo de 26/12)', () => {
    const p = periodoFolha(new Date(Date.UTC(2026, 0, 5))); // 05/01/2026
    expect(p.inicio.toISOString()).toBe('2025-12-26T00:00:00.000Z');
    expect(p.fimExclusivo.toISOString()).toBe('2026-01-26T00:00:00.000Z');
  });

  it('deslocamento negativo retorna o ciclo anterior', () => {
    // ciclo base de 10/07/2026 é 26/06→26/07; o anterior é 26/05→26/06.
    const p = periodoFolhaDeslocado(new Date(Date.UTC(2026, 6, 10)), -1);
    expect(p.inicio.toISOString()).toBe('2026-05-26T00:00:00.000Z');
    expect(p.fimExclusivo.toISOString()).toBe('2026-06-26T00:00:00.000Z');
  });

  it('rótulo do ciclo mostra o intervalo 26 → 25', () => {
    const p = periodoFolha(new Date(Date.UTC(2026, 5, 26)));
    expect(rotuloPeriodoFolha(p)).toBe('26/06 – 25/07');
  });
});

describe('fechamento do dia em Brasília', () => {
  const dia = new Date('2026-07-16T00:00:00.000Z');

  it('não encerra o dia entre 21h e meia-noite locais', () => {
    const agoraBrasilia = new Date('2026-07-16T23:30:00.000Z');
    expect(diaEncerradoEmBrasilia(dia, agoraBrasilia)).toBe(false);
  });

  it('encerra somente na virada civil e converte o fim para 03h UTC real', () => {
    const meiaNoiteBrasilia = new Date('2026-07-17T00:00:00.000Z');
    expect(diaEncerradoEmBrasilia(dia, meiaNoiteBrasilia)).toBe(true);
    expect(fimDoDiaBrasiliaEmUtc(dia).toISOString()).toBe(
      '2026-07-17T03:00:00.000Z',
    );
  });
});

/**
 * Helpers partilhados pela analítica de faltas e não-retornos (antes duplicados
 * nos domínios de operadores e incidências).
 */
describe('chaveDiaUTC', () => {
  it('ignora a hora e devolve a meia-noite UTC do dia', () => {
    const manha = new Date('2026-07-20T09:30:00.000Z');
    const noite = new Date('2026-07-20T23:59:59.000Z');
    expect(chaveDiaUTC(manha)).toBe(Date.UTC(2026, 6, 20));
    expect(chaveDiaUTC(manha)).toBe(chaveDiaUTC(noite));
  });
});

describe('maiorSequenciaDias', () => {
  const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  it('devolve 0 para lista vazia', () => {
    expect(maiorSequenciaDias([])).toBe(0);
  });

  it('devolve 1 quando não há dias colados', () => {
    expect(maiorSequenciaDias([dia('2026-07-01'), dia('2026-07-05')])).toBe(1);
  });

  it('mede a maior sequência de dias civis consecutivos', () => {
    const datas = [
      dia('2026-07-01'),
      dia('2026-07-02'),
      dia('2026-07-03'),
      dia('2026-07-10'),
      dia('2026-07-11'),
    ];
    expect(maiorSequenciaDias(datas)).toBe(3);
  });

  it('deduplica múltiplas ocorrências no mesmo dia (contam como um)', () => {
    const datas = [
      new Date('2026-07-01T08:00:00.000Z'),
      new Date('2026-07-01T20:00:00.000Z'),
      dia('2026-07-02'),
    ];
    expect(maiorSequenciaDias(datas)).toBe(2);
  });

  it('independe da ordem de entrada', () => {
    const datas = [dia('2026-07-03'), dia('2026-07-01'), dia('2026-07-02')];
    expect(maiorSequenciaDias(datas)).toBe(3);
  });
});
