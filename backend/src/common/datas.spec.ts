import {
  chaveDiaUTC,
  ciclosDoIntervalo,
  contarDiasCorridos,
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

/** Atalho: dia civil (00:00 UTC) a partir de "aaaa-mm-dd". */
const dia = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

describe('contarDiasCorridos', () => {
  it('conta os dois extremos', () => {
    expect(contarDiasCorridos(dia('2026-07-14'), dia('2026-07-14'))).toBe(1);
    expect(contarDiasCorridos(dia('2026-07-14'), dia('2026-07-19'))).toBe(6);
  });

  it('conta domingo, feriado e folga como qualquer outro dia', () => {
    // Semana do Ano Novo: o sistema grava um dia de ausência para cada um.
    expect(contarDiasCorridos(dia('2026-01-01'), dia('2026-01-07'))).toBe(7);
  });

  it('atravessa mês, ano e o dia extra do bissexto', () => {
    expect(contarDiasCorridos(dia('2026-12-30'), dia('2027-01-02'))).toBe(4);
    expect(contarDiasCorridos(dia('2028-02-27'), dia('2028-03-01'))).toBe(4);
  });

  it('devolve 0 quando o período está invertido', () => {
    expect(contarDiasCorridos(dia('2026-07-19'), dia('2026-07-14'))).toBe(0);
  });

  it('ignora a hora gravada (compara em dia civil)', () => {
    expect(
      contarDiasCorridos(
        new Date('2026-07-14T23:30:00.000Z'),
        new Date('2026-07-15T01:00:00.000Z'),
      ),
    ).toBe(2);
  });
});

describe('ciclosDoIntervalo (períodos que atravessam o corte 26→25)', () => {
  it('um período dentro de um único ciclo devolve um ciclo com todos os dias', () => {
    const ciclos = ciclosDoIntervalo(dia('2026-07-01'), dia('2026-07-05'));
    expect(ciclos).toHaveLength(1);
    expect(ciclos[0].rotulo).toBe('26/06 – 25/07');
    expect(ciclos[0].dias).toBe(5);
    expect(ciclos[0].inicio.toISOString()).toBe('2026-06-26T00:00:00.000Z');
  });

  it('reparte os dias entre os dois ciclos quando cruza o dia 26', () => {
    // 24/07 a 28/07: 24 e 25 no ciclo de junho; 26, 27 e 28 no de julho.
    const ciclos = ciclosDoIntervalo(dia('2026-07-24'), dia('2026-07-28'));
    expect(ciclos.map((c) => [c.rotulo, c.dias])).toEqual([
      ['26/06 – 25/07', 2],
      ['26/07 – 25/08', 3],
    ]);
    // A soma dos dias por ciclo é a duração total do período.
    expect(ciclos.reduce((s, c) => s + c.dias, 0)).toBe(
      contarDiasCorridos(dia('2026-07-24'), dia('2026-07-28')),
    );
  });

  it('um período longo pode tocar três ciclos', () => {
    const ciclos = ciclosDoIntervalo(dia('2026-07-20'), dia('2026-09-10'));
    expect(ciclos.map((c) => c.rotulo)).toEqual([
      '26/06 – 25/07',
      '26/07 – 25/08',
      '26/08 – 25/09',
    ]);
    expect(ciclos.reduce((s, c) => s + c.dias, 0)).toBe(53);
  });

  it('o dia 25 e o dia 26 ficam em ciclos diferentes', () => {
    expect(
      ciclosDoIntervalo(dia('2026-07-25'), dia('2026-07-25')),
    ).toHaveLength(1);
    const cruzando = ciclosDoIntervalo(dia('2026-07-25'), dia('2026-07-26'));
    expect(cruzando).toHaveLength(2);
    expect(cruzando.map((c) => c.dias)).toEqual([1, 1]);
  });

  it('atravessa a virada de ano', () => {
    const ciclos = ciclosDoIntervalo(dia('2026-12-20'), dia('2027-01-05'));
    expect(ciclos.map((c) => c.rotulo)).toEqual([
      '26/11 – 25/12',
      '26/12 – 25/01',
    ]);
    expect(ciclos[0].dias).toBe(6); // 20 a 25/12
    expect(ciclos[1].dias).toBe(11); // 26/12 a 05/01
  });

  it('devolve lista vazia para intervalo invertido', () => {
    expect(ciclosDoIntervalo(dia('2026-07-28'), dia('2026-07-24'))).toEqual([]);
  });
});
