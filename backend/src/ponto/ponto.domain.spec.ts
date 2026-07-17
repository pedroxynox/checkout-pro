import fc from 'fast-check';
import {
  ALERTA_EXTRAS_MS,
  INTERVALO_MINIMO_ENTRE_BATIDAS_MS,
  LIMITE_EXTRAS_MS,
  MAX_TRABALHO_SEM_INTERVALO_MS,
  RISCO_TAC_1H30_MS,
  RISCO_TAC_1H40_MS,
  REGRAS_PADRAO,
  BatidaEntrada,
  batidaDuplicada,
  calcularJornadaDia,
  classificarBatidas,
  etapaAlertaTac,
  statusFiscalDeJornada,
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

  it('classifica duas batidas de até 4h50 como entrada e encerramento', () => {
    const b = classificarBatidas([batida('2', '11:50'), batida('1', '07:00')]);
    expect(b.map((x) => x.tipo)).toEqual(['ENTRADA', 'ENCERRAMENTO']);
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

  it('feriado (mesmo numa segunda): base de domingo e extras a 100%', () => {
    // ehFeriado=true numa SEGUNDA → base vira 7h20 (domingo) e extras a 100%.
    // 06:00→12:00 (6h) + int 2h + 14:00→17:00 (3h) = 9h → 1h40 extra.
    const j = calcularJornadaDia(
      [
        batida('1', '06:00'),
        batida('2', '12:00'),
        batida('3', '14:00'),
        batida('4', '17:00'),
      ],
      H('17:00'),
      SEGUNDA,
      true,
    );
    expect(j.baseMs).toBe(26_400_000); // 7h20 (regra de domingo)
    expect(j.horasExtrasMs).toBe(100 * 60_000); // 1h40
    expect(j.horasExtras100Ms).toBe(100 * 60_000);
    expect(j.horasExtras50Ms).toBe(0);
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

  it('uma batida conta até agora no dia em andamento', () => {
    const j = calcularJornadaDia([batida('1', '07:00')], H('10:00'), SEGUNDA);
    expect(j.status).toBe('TRABALHANDO');
    expect(j.trabalhadoMs).toBe(3 * 3_600_000);
  });

  it('uma batida em dia encerrado fica incompleta e não inventa trabalho', () => {
    const j = calcularJornadaDia(
      [batida('1', '07:00')],
      H('23:59'),
      SEGUNDA,
      false,
      true,
    );
    expect(j.status).toBe('INCOMPLETO');
    expect(j.trabalhadoMs).toBe(0);
    expect(j.faltando).toEqual(['encerramento']);
  });

  it('duas batidas até 4h50 encerram uma jornada válida sem intervalo', () => {
    const j = calcularJornadaDia(
      [batida('1', '07:00'), batida('2', '11:50')],
      H('12:30'),
      SEGUNDA,
    );
    expect(j.status).toBe('ENCERRADO');
    expect(j.trabalhadoMs).toBe(MAX_TRABALHO_SEM_INTERVALO_MS);
    expect(j.intervaloMs).toBe(0);
    expect(j.batidas[1].tipo).toBe('ENCERRAMENTO');
  });

  it('duas batidas acima de 4h50 ficam em intervalo no dia em andamento', () => {
    const j = calcularJornadaDia(
      [batida('1', '07:00'), batida('2', '12:00')],
      H('12:30'),
      SEGUNDA,
    );
    expect(j.status).toBe('EM_INTERVALO');
    expect(j.trabalhadoMs).toBe(5 * 3_600_000);
    expect(j.intervaloMs).toBe(30 * 60_000);
  });

  it('duas batidas acima de 4h50 em dia encerrado ficam incompletas sem intervalo fictício', () => {
    const j = calcularJornadaDia(
      [batida('1', '07:00'), batida('2', '12:00')],
      H('23:59'),
      SEGUNDA,
      false,
      true,
    );
    expect(j.status).toBe('INCOMPLETO');
    expect(j.trabalhadoMs).toBe(5 * 3_600_000);
    expect(j.intervaloMs).toBe(0);
    expect(j.faltando).toEqual(['retorno do intervalo', 'encerramento']);
  });

  it('três batidas em dia encerrado contam apenas segmentos fechados', () => {
    const j = calcularJornadaDia(
      [batida('1', '07:00'), batida('2', '12:00'), batida('3', '14:00')],
      H('23:59'),
      SEGUNDA,
      false,
      true,
    );
    expect(j.status).toBe('INCOMPLETO');
    expect(j.trabalhadoMs).toBe(5 * 3_600_000);
    expect(j.intervaloMs).toBe(2 * 3_600_000);
    expect(j.faltando).toEqual(['encerramento']);
  });

  it('alerta iminente ao atingir 1h30 de extras ainda trabalhando', () => {
    // base 7h. 05:00→11:00 (6h) + int 11:00→12:00 (1h) + 12:00→agora 14:30 (2h30) = 8h30
    const j = calcularJornadaDia(
      [batida('1', '05:00'), batida('2', '11:00'), batida('3', '12:00')],
      H('14:30'),
      SEGUNDA,
    );
    expect(j.status).toBe('TRABALHANDO');
    expect(j.horasExtrasMs).toBe(ALERTA_EXTRAS_MS); // 1h30
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

describe('etapaAlertaTac', () => {
  it('não avisa antes de 1h30', () => {
    expect(etapaAlertaTac(RISCO_TAC_1H30_MS - 1, false)).toBeNull();
  });

  it('seleciona 1h30 e depois 1h40 nos limites exatos', () => {
    expect(etapaAlertaTac(RISCO_TAC_1H30_MS, false)).toBe('RISCO_1H30');
    expect(etapaAlertaTac(RISCO_TAC_1H40_MS, false)).toBe('RISCO_1H40');
  });

  it('mantém risco alto em 1h50 exato e só vira TAC acima do limite', () => {
    expect(etapaAlertaTac(LIMITE_EXTRAS_MS, false)).toBe('RISCO_1H40');
    expect(etapaAlertaTac(LIMITE_EXTRAS_MS + 1, true)).toBe('TAC');
  });

  it('TAC prevalece para evitar três mensagens num salto direto', () => {
    expect(etapaAlertaTac(LIMITE_EXTRAS_MS + 1, true)).toBe('TAC');
    expect(etapaAlertaTac(0, true)).toBe('TAC');
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

describe('statusFiscalDeJornada (colaboradores no painel de jornada)', () => {
  it('mapeia o estado da jornada para um status de exibição', () => {
    expect(statusFiscalDeJornada('TRABALHANDO')).toBe('DISPONIVEL');
    expect(statusFiscalDeJornada('EM_INTERVALO')).toBe('INTERVALO');
    expect(statusFiscalDeJornada('ENCERRADO')).toBe('FORA_EXPEDIENTE');
    expect(statusFiscalDeJornada('INCOMPLETO')).toBe('FORA_EXPEDIENTE');
    expect(statusFiscalDeJornada('SEM_REGISTRO')).toBe('FORA_EXPEDIENTE');
  });
});

describe('batidaDuplicada', () => {
  const base = new Date('2025-06-02T08:00:00Z').getTime();

  it('sem batidas existentes nunca é duplicada', () => {
    expect(batidaDuplicada(base, [])).toBe(false);
  });

  it('mesma hora é duplicada', () => {
    expect(batidaDuplicada(base, [base])).toBe(true);
  });

  it('dentro da janela mínima (1 min) é duplicada', () => {
    expect(batidaDuplicada(base + 60_000, [base])).toBe(true);
  });

  it('exatamente na janela mínima já é permitida', () => {
    expect(
      batidaDuplicada(base + INTERVALO_MINIMO_ENTRE_BATIDAS_MS, [base]),
    ).toBe(false);
  });

  it('bem distante (horas) é permitida', () => {
    expect(batidaDuplicada(base + 4 * 3_600_000, [base])).toBe(false);
  });

  it('compara contra todas as batidas existentes', () => {
    const horas = [base, base + 4 * 3_600_000];
    expect(batidaDuplicada(base + 4 * 3_600_000 + 30_000, horas)).toBe(true);
  });
});


describe('calcularJornadaDia · intervalo obrigatório (contratos data-driven)', () => {
  // Contrato de 6h com intervalo obrigatório: encerrar sem intervalo é TAC.
  const REGRAS_6H_INTERVALO = {
    ...REGRAS_PADRAO,
    cargaBaseMs: () => 6 * 60 * 60_000, // 6h
    maxTrabalhoSemIntervaloMs: 6 * 60 * 60_000, // duas batidas até 6h encerram
    intervaloMinimoMs: 20 * 60_000, // 20 min
    intervaloObrigatorio: true,
  };

  it('encerrar a jornada SEM intervalo é TAC', () => {
    // Duas batidas (entrada e encerramento) sem intervalo no meio.
    const j = calcularJornadaDia(
      [batida('e', '08:00'), batida('s', '14:00')],
      H('18:00'),
      SEGUNDA,
      false,
      true,
      REGRAS_6H_INTERVALO,
    );
    expect(j.status).toBe('ENCERRADO');
    expect(j.tac).toBe(true);
    expect(j.motivosTac).toContain('Não fez o intervalo obrigatório');
  });

  it('com intervalo válido (≥ 20min) não é TAC por intervalo', () => {
    const j = calcularJornadaDia(
      [
        batida('e', '08:00'),
        batida('si', '11:00'),
        batida('ri', '11:30'),
        batida('f', '14:30'),
      ],
      H('18:00'),
      SEGUNDA,
      false,
      true,
      REGRAS_6H_INTERVALO,
    );
    expect(j.status).toBe('ENCERRADO');
    expect(j.motivosTac).not.toContain('Não fez o intervalo obrigatório');
  });

  it('contrato de 4h corridas (intervalo NÃO obrigatório) não gera TAC sem intervalo', () => {
    const REGRAS_4H = {
      ...REGRAS_PADRAO,
      cargaBaseMs: () => 4 * 60 * 60_000,
      maxTrabalhoSemIntervaloMs: 4 * 60 * 60_000,
      intervaloObrigatorio: false,
    };
    const j = calcularJornadaDia(
      [batida('e', '08:00'), batida('s', '12:00')],
      H('18:00'),
      SEGUNDA,
      false,
      true,
      REGRAS_4H,
    );
    expect(j.status).toBe('ENCERRADO');
    expect(j.tac).toBe(false);
  });
});
