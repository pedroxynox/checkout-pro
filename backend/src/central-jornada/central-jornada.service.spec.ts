import { CentralJornadaService } from './central-jornada.service';

/**
 * Teste do resumo do ciclo (26→25) da Central de Jornada, cobrindo: dia normal,
 * hora extra 50%, domingo 100%, déficit (dia trabalhado abaixo da carga), falta
 * marcada como débito, atestado e o saldo. "Agora" é fixado em 10/07/2026 para
 * que os dias de teste (fim de junho / início de julho) fiquem completos.
 */
const H7 = 25_200_000; // 7h
const H8 = 28_800_000; // 8h
const UMA_HORA = 3_600_000;

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

describe('CentralJornadaService.resumoCiclo', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-10T12:00:00.000Z'));
  });
  afterAll(() => jest.useRealTimers());

  function montar() {
    const batidas = [
      // A) Seg 29/06: 7h exatas (07-12 + 14-16) → sem extra, sem déficit.
      batida('a1', '2026-06-29', '07:00'),
      batida('a2', '2026-06-29', '12:00'),
      batida('a3', '2026-06-29', '14:00'),
      batida('a4', '2026-06-29', '16:00'),
      // B) Ter 30/06: 8h (07-12 + 14-17) → +1h extra 50%.
      batida('b1', '2026-06-30', '07:00'),
      batida('b2', '2026-06-30', '12:00'),
      batida('b3', '2026-06-30', '14:00'),
      batida('b4', '2026-06-30', '17:00'),
      // C) Dom 05/07: 8h20 (06-12 + 14-16:20), base 7h20 → +1h extra 100%.
      batida('c1', '2026-07-05', '06:00'),
      batida('c2', '2026-07-05', '12:00'),
      batida('c3', '2026-07-05', '14:00'),
      batida('c4', '2026-07-05', '16:20'),
      // D) Qua 01/07: 5h (08-12 + 13-14) → déficit de 2h (base 7h).
      batida('d1', '2026-07-01', '08:00'),
      batida('d2', '2026-07-01', '12:00'),
      batida('d3', '2026-07-01', '13:00'),
      batida('d4', '2026-07-01', '14:00'),
    ];
    const ausencias = [
      // E) Qui 02/07: falta marcada como DÉBITO → deve 7h.
      {
        id: 'e1',
        pessoaId: 'c1',
        colaboradorId: 'c1',
        data: dia('2026-07-02'),
        debitoHoras: true,
        motivoJustificativa: null,
      },
      // F) Sex 03/07: ATESTADO → 8h de atestado (pagas, não é débito).
      {
        id: 'f1',
        pessoaId: 'c1',
        colaboradorId: 'c1',
        data: dia('2026-07-03'),
        debitoHoras: false,
        motivoJustificativa: 'ATESTADO_MEDICO',
      },
    ];
    const prismaFake = {
      colaborador: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'c1', nome: 'Ana Souza', funcao: 'OPERADOR' },
          ]),
      },
      batidaPonto: { findMany: jest.fn().mockResolvedValue(batidas) },
      ausencia: { findMany: jest.fn().mockResolvedValue(ausencias) },
    };
    const feriadosFake = {
      mapaNoPeriodo: jest.fn().mockResolvedValue(new Map<number, string>()),
    };
    return new CentralJornadaService(
      prismaFake as never,
      feriadosFake as never,
    );
  }

  it('agrega extras 50/100, déficit, débito, atestado, faltas e saldo', async () => {
    const service = montar();
    const r = await service.resumoCiclo(0);

    expect(r.periodo.rotulo).toBe('26/06 – 25/07');
    expect(r.pessoas).toHaveLength(1);
    const p = r.pessoas[0];

    expect(p.cargaTrabalhadaMs).toBe(H7 + H8 + 30_000_000 + 18_000_000); // 7+8+8h20+5
    expect(p.extras50Ms).toBe(UMA_HORA); // dia B
    expect(p.extras100Ms).toBe(UMA_HORA); // domingo C
    expect(p.horasDevidasMs).toBe(2 * UMA_HORA + H7); // déficit 2h + débito 7h
    expect(p.horasAtestadoMs).toBe(H8); // atestado 8h (sexta)
    expect(p.faltas).toBe(2);
    expect(p.diasTac).toBe(0);
    expect(p.saldoMs).toBe(2 * UMA_HORA - (2 * UMA_HORA + H7)); // extras − devidas
  });
});
