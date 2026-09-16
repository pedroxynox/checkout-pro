import { CentralJornadaService } from './central-jornada.service';

/**
 * A COMPENSAÇÃO DE HORAS dentro do cálculo da jornada (ADR 0021).
 *
 * Estes testes cobrem a parte mais sensível da mudança: uma compensação aprovada
 * tem de abater as horas de 50% **sem** virar falta, **sem** ser contada duas
 * vezes e **sem** tocar nas horas de 100%. Cada caso abaixo corresponde a uma
 * armadilha real do desenho:
 *
 *  - o dia inteiro compensado cairia em `FALTA_NAO_REGISTRADA` (a Central
 *    acusaria em laranja o dia que ela própria recomendou);
 *  - o dia PARCIAL já gera déficit pelo cálculo antigo, então somar a
 *    compensação em cima contaria as mesmas horas duas vezes;
 *  - quem entra mais tarde por liberação seria apontado como ATRASADO.
 *
 * "Agora" é 10/07/2026: os dias usados (fim de junho / início de julho) estão
 * completos, que é a condição para o desconto valer.
 */
const H = 3_600_000;

function dia(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function batida(id: string, iso: string, hhmm: string) {
  return {
    id,
    pessoaId: 'c1',
    colaboradorId: 'c1',
    data: dia(iso),
    hora: new Date(`${iso}T${hhmm}:00.000Z`),
  };
}

/** Uma linha de `compensacoes_horas` como o Prisma a devolveria. */
function compensacao(
  iso: string,
  minutosCompensados: number,
  minutosTrabalhados: number,
  horaInicio: string | null = null,
  horaFim: string | null = null,
) {
  return {
    colaboradorId: 'c1',
    data: dia(iso),
    minutosCompensados,
    minutosTrabalhados,
    semIntervalo: true,
    horaInicio,
    horaFim,
  };
}

describe('Central de Jornada — compensação de horas', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-10T12:00:00.000Z'));
  });
  afterAll(() => jest.useRealTimers());

  /**
   * Ana: turno 08:00–17:00 de seg a qui, folga no domingo.
   * `compensacoes` são as linhas APROVADAS que o banco devolve.
   */
  function montar(
    batidas: ReturnType<typeof batida>[],
    compensacoes: ReturnType<typeof compensacao>[] = [],
  ) {
    const prismaFake = {
      colaborador: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'c1',
            nome: 'Ana Souza',
            funcao: 'OPERADOR',
            matricula: 'ANA',
            usuarioId: null,
            folgaDiaSemana: 0,
            grupoDomingo: null,
            entradaSemana: '08:00',
            entradaFds: '08:00',
            entradaDom: null,
          },
        ]),
      },
      batidaPonto: { findMany: jest.fn().mockResolvedValue(batidas) },
      ausencia: { findMany: jest.fn().mockResolvedValue([]) },
      fiscal: { findMany: jest.fn().mockResolvedValue([]) },
      usuario: { findMany: jest.fn().mockResolvedValue([]) },
      compensacaoHoras: {
        findMany: jest.fn().mockResolvedValue(compensacoes),
      },
    };
    const feriadosFake = {
      mapaNoPeriodo: jest.fn().mockResolvedValue(new Map<number, string>()),
    };
    return new CentralJornadaService(
      prismaFake as never,
      feriadosFake as never,
    );
  }

  describe('dia inteiro compensado', () => {
    // Ter 30/06 (base 7h): 8h trabalhadas → +1h de 50%.
    const extras = [
      batida('b1', '2026-06-30', '07:00'),
      batida('b2', '2026-06-30', '12:00'),
      batida('b3', '2026-06-30', '14:00'),
      batida('b4', '2026-06-30', '17:00'),
    ];

    it('consome o saldo de 50% e NÃO conta como falta', async () => {
      // Qua 01/07 (base 7h) inteira compensada: 420min compensados, 0 trabalhados.
      const s = montar(extras, [compensacao('2026-07-01', 420, 0)]);
      const p = (await s.resumoCiclo(0)).pessoas[0];

      expect(p.extras50Ms).toBe(H); // a extra bruta segue existindo
      expect(p.compensadoMs).toBe(7 * H); // e o dia compensado consumiu 7h
      expect(p.faltas).toBe(0); // compensação não é falta
      expect(p.horasDevidasMs).toBe(0); // nem dívida
      // Saldo de 50%: 1h − 7h = −6h (ela usou mais do que tinha neste cenário).
      expect(p.saldo50Ms).toBe(-6 * H);
      expect(p.extras50AtualMs).toBe(0);
    });

    it('aparece no detalhe como COMPENSACAO, não como falta não registrada', async () => {
      const s = montar(extras, [compensacao('2026-07-01', 420, 0)]);
      const { dias } = await s.detalhePessoa('c1', 0);
      const d = dias.find((x) => x.data === dia('2026-07-01').toISOString());

      expect(d?.tipo).toBe('COMPENSACAO');
      expect(d?.compensadoMs).toBe(7 * H);
      expect(d?.devidasMs).toBe(0);
      expect(d?.trabalhadoMs).toBe(0);
    });

    it('não desconta um dia que ainda não terminou', async () => {
      // 20/07 é futuro em relação ao "agora" fixado (10/07).
      const s = montar(extras, [compensacao('2026-07-20', 420, 0)]);
      const p = (await s.resumoCiclo(0)).pessoas[0];
      expect(p.compensadoMs).toBe(0);
      expect(p.saldo50Ms).toBe(H);
    });

    it('não desconta nada num domingo (100% nunca é debitada)', async () => {
      // Dom 05/07: mesmo com uma linha aprovada, não há o que compensar.
      const s = montar(extras, [compensacao('2026-07-05', 440, 0)]);
      const p = (await s.resumoCiclo(0)).pessoas[0];
      expect(p.compensadoMs).toBe(0);
      expect(p.extras100Ms).toBe(0);
      expect(p.saldo50Ms).toBe(H);
    });
  });

  describe('dia parcial compensado', () => {
    // Ter 30/06: 8h → +1h de 50%. Qua 01/07: trabalha 2h das 7h de carga.
    const batidas = [
      batida('b1', '2026-06-30', '07:00'),
      batida('b2', '2026-06-30', '12:00'),
      batida('b3', '2026-06-30', '14:00'),
      batida('b4', '2026-06-30', '17:00'),
      batida('p1', '2026-07-01', '08:00'),
      batida('p2', '2026-07-01', '10:00'),
    ];

    it('o déficit é RECLASSIFICADO como compensação, não somado', async () => {
      // 5h compensadas (300min) + 2h trabalhadas (120min) = 7h de carga.
      const s = montar(batidas, [
        compensacao('2026-07-01', 300, 120, '08:00', '10:00'),
      ]);
      const p = (await s.resumoCiclo(0)).pessoas[0];

      // O déficit do dia é 5h. Ele virou compensação, NÃO hora devida — e a
      // soma total das duas continua sendo 5h (nada contado duas vezes).
      expect(p.compensadoMs).toBe(5 * H);
      expect(p.horasDevidasMs).toBe(0);
      expect(p.compensadoMs + p.horasDevidasMs).toBe(5 * H);
      // Saldo de 50%: 1h − 5h = −4h.
      expect(p.saldo50Ms).toBe(-4 * H);
    });

    it('o que passa do combinado continua sendo hora devida', async () => {
      // Aprovadas só 2h de compensação, mas o déficit real do dia é 5h:
      // 2h viram compensação e as outras 3h seguem como dívida.
      const s = montar(batidas, [
        compensacao('2026-07-01', 120, 300, '08:00', '13:00'),
      ]);
      const p = (await s.resumoCiclo(0)).pessoas[0];

      expect(p.compensadoMs).toBe(2 * H);
      expect(p.horasDevidasMs).toBe(3 * H);
    });

    it('o dia sai como COMPENSACAO com as horas trabalhadas visíveis', async () => {
      const s = montar(batidas, [
        compensacao('2026-07-01', 300, 120, '08:00', '10:00'),
      ]);
      const { dias } = await s.detalhePessoa('c1', 0);
      const d = dias.find((x) => x.data === dia('2026-07-01').toISOString());

      expect(d?.tipo).toBe('COMPENSACAO');
      expect(d?.trabalhadoMs).toBe(2 * H);
      expect(d?.compensadoMs).toBe(5 * H);
      expect(d?.devidasMs).toBe(0);
    });

    it('quem entra mais tarde por liberação NÃO é apontado como atrasado', async () => {
      // Turno começa 08:00; a liberação move a entrada para 14:00 e ela cumpre.
      const comEntradaTardia = [
        batida('b1', '2026-06-30', '07:00'),
        batida('b2', '2026-06-30', '12:00'),
        batida('b3', '2026-06-30', '14:00'),
        batida('b4', '2026-06-30', '17:00'),
        batida('t1', '2026-07-01', '14:00'),
        batida('t2', '2026-07-01', '16:00'),
      ];
      const s = montar(comEntradaTardia, [
        compensacao('2026-07-01', 300, 120, '14:00', '16:00'),
      ]);
      const p = (await s.resumoCiclo(0)).pessoas[0];
      expect(p.atrasos).toBe(0);

      const { dias } = await s.detalhePessoa('c1', 0);
      const d = dias.find((x) => x.data === dia('2026-07-01').toISOString());
      expect(d?.entradaPrevista).toBe('14:00');
      expect(d?.atrasoMinutos).toBeUndefined();
    });

    it('sem a liberação, a mesma entrada tardia SERIA atraso', async () => {
      const comEntradaTardia = [
        batida('t1', '2026-07-01', '14:00'),
        batida('t2', '2026-07-01', '16:00'),
      ];
      const s = montar(comEntradaTardia, []);
      const p = (await s.resumoCiclo(0)).pessoas[0];
      expect(p.atrasos).toBe(1);
    });
  });

  describe('sem compensação nenhuma', () => {
    it('o cálculo é byte por byte o de antes', async () => {
      const batidas = [
        batida('b1', '2026-06-30', '07:00'),
        batida('b2', '2026-06-30', '12:00'),
        batida('b3', '2026-06-30', '14:00'),
        batida('b4', '2026-06-30', '17:00'),
      ];
      const p = (await montar(batidas, []).resumoCiclo(0)).pessoas[0];
      expect(p.compensadoMs).toBe(0);
      expect(p.extras50Ms).toBe(H);
      expect(p.saldo50Ms).toBe(H);
      expect(p.extras50AtualMs).toBe(H);
      expect(p.horasDevidasAtualMs).toBe(0);
    });
  });

  describe('invariantes', () => {
    it('o saldo 50% segue sendo a versão com sinal dos dois chips', async () => {
      const batidas = [
        batida('b1', '2026-06-30', '07:00'),
        batida('b2', '2026-06-30', '12:00'),
        batida('b3', '2026-06-30', '14:00'),
        batida('b4', '2026-06-30', '18:00'), // +2h de 50%
        batida('p1', '2026-07-01', '08:00'),
        batida('p2', '2026-07-01', '13:00'), // 5h de 7h → déficit 2h
      ];
      const s = montar(batidas, [
        compensacao('2026-07-01', 120, 300, '08:00', '13:00'),
      ]);
      const p = (await s.resumoCiclo(0)).pessoas[0];

      expect(p.compensadoMs).toBe(2 * H);
      expect(p.saldo50Ms).toBe(0); // 2h de extra − 2h compensadas
      expect(p.saldo50Ms).toBe(p.extras50AtualMs - p.horasDevidasAtualMs);
    });

    it('a compensação nunca toca nas horas de 100%', async () => {
      const batidas = [
        // Dom 05/07: 8h20 contra base 7h20 → +1h de 100%.
        batida('c1', '2026-07-05', '06:00'),
        batida('c2', '2026-07-05', '12:00'),
        batida('c3', '2026-07-05', '14:00'),
        batida('c4', '2026-07-05', '16:20'),
      ];
      const s = montar(batidas, [compensacao('2026-07-01', 420, 0)]);
      const p = (await s.resumoCiclo(0)).pessoas[0];

      expect(p.extras100Ms).toBe(H); // intacta
      expect(p.compensadoMs).toBe(7 * H);
      // O saldo geral desce pela compensação, mas as 100% seguem somando.
      expect(p.saldoMs).toBe(H - 7 * H);
    });
  });
});
