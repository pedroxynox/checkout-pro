import { agruparAtestados } from './central-jornada.service';

/**
 * O contador de atestados é de **documentos**, não de dias: um atestado de 3 dias
 * conta 1. Estes testes fixam as duas origens (com e sem documento cadastrado) e
 * o limite conhecido do agrupamento por dias consecutivos.
 */
const UMA_HORA = 3_600_000;
const SETE_HORAS = 7 * UMA_HORA;

/** Um dia de atestado (o ISO da meia-noite UTC, como a Central usa). */
function dia(iso: string, atestadoId: string | null = null, baseMs = SETE_HORAS) {
  return { data: `${iso}T00:00:00.000Z`, atestadoId, baseMs };
}

describe('agruparAtestados — com documento cadastrado', () => {
  it('um atestado de 3 dias conta como UM atestado', () => {
    const grupos = agruparAtestados([
      dia('2026-07-06', 'at-1'),
      dia('2026-07-07', 'at-1'),
      dia('2026-07-08', 'at-1'),
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toMatchObject({
      atestadoId: 'at-1',
      dias: 3,
      horasAbonadasMs: 3 * SETE_HORAS,
    });
    expect(grupos[0].inicio.slice(0, 10)).toBe('2026-07-06');
    expect(grupos[0].fim.slice(0, 10)).toBe('2026-07-08');
  });

  it('dois atestados (3 dias + 2 dias) contam DOIS — o caso pedido', () => {
    const grupos = agruparAtestados([
      dia('2026-07-06', 'at-1'),
      dia('2026-07-07', 'at-1'),
      dia('2026-07-08', 'at-1'),
      dia('2026-07-20', 'at-2'),
      dia('2026-07-21', 'at-2'),
    ]);

    // 5 dias, 2 atestados.
    expect(grupos).toHaveLength(2);
    expect(grupos.map((g) => g.dias)).toEqual([2, 3]); // mais recente primeiro
    expect(grupos.reduce((s, g) => s + g.dias, 0)).toBe(5);
  });

  it('agrupa pelo documento mesmo com dias NÃO consecutivos', () => {
    // O documento é a verdade: se ele cobre dias salteados, segue sendo um só.
    const grupos = agruparAtestados([
      dia('2026-07-06', 'at-1'),
      dia('2026-07-09', 'at-1'),
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].dias).toBe(2);
  });

  it('a ordem de entrada não altera o resultado', () => {
    const desordenado = agruparAtestados([
      dia('2026-07-08', 'at-1'),
      dia('2026-07-06', 'at-1'),
      dia('2026-07-07', 'at-1'),
    ]);

    expect(desordenado).toHaveLength(1);
    expect(desordenado[0].inicio.slice(0, 10)).toBe('2026-07-06');
    expect(desordenado[0].fim.slice(0, 10)).toBe('2026-07-08');
  });

  it('soma as horas abonadas de cada dia (as bases podem diferir)', () => {
    // Sáb tem base de 8h e seg de 7h no 6x1: o atestado abona o que cada dia vale.
    const grupos = agruparAtestados([
      dia('2026-07-11', 'at-1', 8 * UMA_HORA),
      dia('2026-07-13', 'at-1', 7 * UMA_HORA),
    ]);

    expect(grupos[0].horasAbonadasMs).toBe(15 * UMA_HORA);
  });
});

describe('agruparAtestados — sem documento (dias abonados um a um)', () => {
  it('dias consecutivos contam como UM atestado', () => {
    const grupos = agruparAtestados([
      dia('2026-07-06'),
      dia('2026-07-07'),
      dia('2026-07-08'),
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toMatchObject({ atestadoId: null, dias: 3 });
  });

  it('blocos separados por um intervalo contam separado', () => {
    const grupos = agruparAtestados([
      dia('2026-07-06'),
      dia('2026-07-07'),
      // 09 não é o dia seguinte a 07 → começa outro bloco.
      dia('2026-07-09'),
    ]);

    expect(grupos).toHaveLength(2);
    expect(grupos.map((g) => g.dias)).toEqual([1, 2]); // mais recente primeiro
  });

  it('não mistura os dias sem documento com os de um documento', () => {
    const grupos = agruparAtestados([
      dia('2026-07-06', 'at-1'),
      dia('2026-07-07'), // dia seguinte, mas sem documento
    ]);

    expect(grupos).toHaveLength(2);
    expect(grupos.map((g) => g.atestadoId)).toEqual([null, 'at-1']);
  });

  it('atravessar a virada do mês não quebra o bloco', () => {
    const grupos = agruparAtestados([dia('2026-07-31'), dia('2026-08-01')]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].dias).toBe(2);
  });
});

describe('agruparAtestados — bordas', () => {
  it('sem dias, não há atestados', () => {
    expect(agruparAtestados([])).toEqual([]);
  });

  it('devolve do mais recente para o mais antigo', () => {
    const grupos = agruparAtestados([
      dia('2026-07-02', 'at-antigo'),
      dia('2026-07-20', 'at-novo'),
    ]);

    expect(grupos.map((g) => g.atestadoId)).toEqual(['at-novo', 'at-antigo']);
  });

  it('o total de dias agrupados é sempre igual ao de dias recebidos', () => {
    const dias = [
      dia('2026-07-06', 'at-1'),
      dia('2026-07-07', 'at-1'),
      dia('2026-07-10'),
      dia('2026-07-11'),
      dia('2026-07-15', 'at-2'),
    ];

    const grupos = agruparAtestados(dias);

    // Agrupar não pode perder nem inventar dias.
    expect(grupos.reduce((s, g) => s + g.dias, 0)).toBe(dias.length);
    expect(grupos).toHaveLength(3);
  });
});
