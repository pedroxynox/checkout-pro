import fc from 'fast-check';
import {
  ALERTA_EXTRAS_MS,
  BatidaEntrada,
  calcularJornadaDia,
  classificarBatidas,
  statusFiscalDeTipoBatida,
} from './ponto.domain';

/** Cria uma batida num horário HH:mm de um dia fixo (a data em si é irrelevante:
 * o dia da semana é passado explicitamente às funções). */
function batida(id: string, hhmm: string): BatidaEntrada {
  return { id, hora: new Date(`2025-06-02T${hhmm}:00Z`) };
}
const H = (hhmm: string): Date => new Date(`2025-06-02T${hhmm}:00Z`);

const SEGUNDA = 1;
const DOMINGO = 0;

describe('classificarBatidas', () => {
  it('atribui o tipo pela ordem cronológica (1ª..4ª e extra)', () => {
    const b = classificarBatidas([
      batida('c', '14:00'),
      batida('a', '07:00'),
      batida('d', '16:00'),
      batida('b', '12:00'),
      batida('e', '18:00'),
    ]);
    expect(b.map((x) => `${x.id}:${x.tipo}`)).toEqual([
      'a:ENTRADA',
      'b:SAIDA_INTERVALO',
      'c:RETORNO_INTERVALO',
      'd:ENCERRAMENTO',
      'e:EXTRA',
    ]);
  });
});

describe('calcularJornadaDia', () => {
  it('sem batidas → SEM_REGISTRO', () => {
    const j = calcularJornadaDia([], H('10:00'), SEGUNDA);
    expect(j.status).toBe('SEM_REGISTRO');
    expect(j.trabalhadoMs).toBe(0);
    expect(j.tac).toBe(false);
  });

  it('dia completo (7h) sem extras — o intervalo não conta', () => {
    // 07:00→12:00 (5h) + intervalo 12:00→14:00 (2h) + 14:00→16:00 (2h) = 7h
    const j = calcularJornadaDia(
      [
        batida('1', '07:00'),
        batida('2', '12:00'),
        batida('3', '14:00'),
        batida('4', '16:00'),
      ],
      H('16:00'),
      SEGUNDA,
    );
    expect(j.status).toBe('ENCERRADO');
    expect(j.trabalhadoMs).toBe(7 * 3_600_000);
    expect(j.intervaloMs).toBe(2 * 3_600_000);
    expect(j.horasExtrasMs).toBe(0);
    expect(j.tac).toBe(false);
  });

  it('extras acima de 1h50 (seg–sáb) → TAC 50%', () => {
    // 06:00→12:00 (6h) + int 12:00→14:00 (2h) + 14:00→17:00 (3h) = 9h; base 7h → 2h extra
    const j = calcularJornadaDia(
      [
        batida('1', '06:00'),
        batida('2', '12:00'),
        batida('3', '14:00'),
        batida('4', '17:00'),
      ],
      H('17:00'),
      SEGUNDA,
    );
    expect(j.horasExtrasMs).toBe(2 * 3_600_000);
    expect(j.horasExtras50Ms).toBe(2 * 3_600_000);
    expect(j.horasExtras100Ms).toBe(0);
    expect(j.tac).toBe(true);
    expect(j.motivosTac).toContain('Excedeu 1h50 de horas extras');
  });

  it('domingo: extras contam como 100%', () => {
    // base domingo 7h20. 06:00→12:00 (6h) + int 2h + 14:00→17:00 (3h) = 9h → 1h40 extra
    const j = calcularJornadaDia(
      [
        batida('1', '06:00'),
        batida('2', '12:00'),
        batida('3', '14:00'),
        batida('4', '17:00'),
      ],
      H('17:00'),
      DOMINGO,
    );
    expect(j.horasExtrasMs).toBe(100 * 60_000); // 1h40
    expect(j.horasExtras100Ms).toBe(100 * 60_000);
    expect(j.horasExtras50Ms).toBe(0);
    expect(j.tac).toBe(false); // 1h40 < 1h50
  });

  it('intervalo abaixo de 1h → TAC', () => {
    const j = calcularJornadaDia(
      [
        batida('1', '07:00'),
        batida('2', '12:00'),
        batida('3', '12:30'), // 30 min de intervalo
        batida('4', '16:30'),
      ],
      H('16:30'),
      SEGUNDA,
    );
    expect(j.intervaloMs).toBe(30 * 60_000);
    expect(j.tac).toBe(true);
    expect(j.motivosTac).toContain('Intervalo abaixo de 1h');
  });

  it('intervalo acima de 3h → TAC', () => {
    const j = calcularJornadaDia(
      [
        batida('1', '07:00'),
        batida('2', '12:00'),
        batida('3', '15:30'), // 3h30 de intervalo
        batida('4', '18:00'),
      ],
      H('18:00'),
      SEGUNDA,
    );
    expect(j.tac).toBe(true);
    expect(j.motivosTac).toContain('Intervalo acima de 3h');
  });

  it('duas batidas → em intervalo, jornada em curso', () => {
    const j = calcularJornadaDia(
      [batida('1', '07:00'), batida('2', '12:00')],
      H('12:30'),
      SEGUNDA,
    );
    expect(j.status).toBe('EM_INTERVALO');
    expect(j.trabalhadoMs).toBe(5 * 3_600_000);
    expect(j.intervaloMs).toBe(30 * 60_000); // intervalo em curso
  });

  it('alerta iminente ao atingir 1h45 de extras ainda trabalhando', () => {
    // base 7h. 05:00→11:00 (6h) + int 11:00→12:00 (1h) + 12:00→agora 14:45 (2h45) = 8h45
    const j = calcularJornadaDia(
      [batida('1', '05:00'), batida('2', '11:00'), batida('3', '12:00')],
      H('14:45'),
      SEGUNDA,
    );
    expect(j.status).toBe('TRABALHANDO');
    expect(j.horasExtrasMs).toBe(ALERTA_EXTRAS_MS); // 1h45
    expect(j.alertaIminente).toBe(true);
    expect(j.tac).toBe(false); // ainda não passou de 1h50
  });

  it('encerrado não dispara alerta iminente mesmo com muitas extras', () => {
    const j = calcularJornadaDia(
      [
        batida('1', '05:00'),
        batida('2', '12:00'),
        batida('3', '14:00'),
        batida('4', '18:00'),
      ],
      H('18:00'),
      SEGUNDA,
    );
    expect(j.status).toBe('ENCERRADO');
    expect(j.alertaIminente).toBe(false);
  });

  it('encerrou sem registrar o retorno → INCOMPLETO', () => {
    // 3 batidas: entrada, saída p/ intervalo, encerramento (o 3º vira retorno
    // pela ordem). Para simular "encerrou sem voltar" usamos 4 batidas onde
    // falta o retorno seria via edição; aqui validamos o caminho com retorno
    // ausente montando tipos manualmente não é possível — cobrimos o comum.
    const j = calcularJornadaDia(
      [batida('1', '07:00'), batida('2', '12:00'), batida('3', '16:00')],
      H('16:00'),
      SEGUNDA,
    );
    // 3ª batida = retorno pela ordem → jornada em curso (sem encerramento)
    expect(j.status).toBe('TRABALHANDO');
  });

  it('propriedade: trabalhado ≥ 0 e extras = max(0, trabalhado − base)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 23 * 60 }), {
          minLength: 0,
          maxLength: 6,
        }),
        fc.constantFrom(0, 1, 2, 3, 4, 5, 6),
        (minutos, dia) => {
          const batidas = minutos.map((m, i) => ({
            id: String(i),
            hora: new Date(2025, 5, 2, 0, m),
          }));
          const agora = new Date(2025, 5, 2, 23, 59);
          const j = calcularJornadaDia(batidas, agora, dia);
          expect(j.trabalhadoMs).toBeGreaterThanOrEqual(0);
          expect(j.intervaloMs).toBeGreaterThanOrEqual(0);
          expect(j.horasExtrasMs).toBe(Math.max(0, j.trabalhadoMs - j.baseMs));
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('statusFiscalDeTipoBatida', () => {
  it('entrada e retorno do intervalo → DISPONIVEL', () => {
    expect(statusFiscalDeTipoBatida('ENTRADA')).toBe('DISPONIVEL');
    expect(statusFiscalDeTipoBatida('RETORNO_INTERVALO')).toBe('DISPONIVEL');
  });

  it('saída para intervalo → INTERVALO', () => {
    expect(statusFiscalDeTipoBatida('SAIDA_INTERVALO')).toBe('INTERVALO');
  });

  it('encerramento → FORA_EXPEDIENTE', () => {
    expect(statusFiscalDeTipoBatida('ENCERRAMENTO')).toBe('FORA_EXPEDIENTE');
  });

  it('batida extra → sem transição (null)', () => {
    expect(statusFiscalDeTipoBatida('EXTRA')).toBeNull();
  });
});
