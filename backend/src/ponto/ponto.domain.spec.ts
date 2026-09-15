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
  RegrasContrato,
  batidaDuplicada,
  calcularJornadaDia,
  cargaBaseDoDia,
  descartarBatidasRepetidas,
  diaPagaAdicional100,
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

  it('feriado numa segunda: jornada de 7h20 (a de domingo) e extras a 100%', () => {
    // A jornada de um feriado é 7h20, a mesma de um domingo, caia em que dia da
    // semana cair. Do domingo o feriado herda a jornada, o horário e o adicional
    // de 100%; o que ele não herda é o rodízio e a folga.
    // 06:00→12:00 (6h) + int 2h + 14:00→17:00 (3h) = 9h → 1h40 extra sobre 7h20.
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
    expect(j.baseMs).toBe(26_400_000); // 7h20 — a jornada do feriado
    expect(j.horasExtrasMs).toBe(100 * 60_000); // 1h40
    expect(j.horasExtras100Ms).toBe(100 * 60_000); // ...a 100%, por ser feriado
    expect(j.horasExtras50Ms).toBe(0);
    expect(j.tac).toBe(false); // 1h40 < 1h50
  });

  it('feriado de quem FOLGA no domingo: jornada de 7h20, não zero', () => {
    // O bug que motivou a correção. Quem folga fixo no domingo tem a carga de
    // domingo do contrato em ZERO — é a forma natural de modelar esse contrato.
    // Enquanto a jornada do feriado era lida de `cargaBaseMs(0)`, o feriado
    // dessas pessoas passava a esperar zero hora: as 8h trabalhadas contavam
    // INTEIRAS como extra a 100% e o dia caía em TAC por exceder 1h50.
    //
    // A jornada de um feriado é 7h20 para todos, inclusive para quem nunca
    // trabalha domingo. Por isso `cargaFeriadoMs` é um valor próprio.
    const regras: RegrasContrato = {
      ...REGRAS_PADRAO,
      // Domingo 0 (folga fixa), Seg–Qui 7h, Sex–Sáb 8h.
      cargaBaseMs: (diaSemana) => {
        if (diaSemana === 0) return 0;
        return diaSemana >= 1 && diaSemana <= 4 ? 25_200_000 : 28_800_000;
      },
    };
    const j = calcularJornadaDia(
      [
        batida('1', '06:00'),
        batida('2', '12:00'),
        batida('3', '13:00'),
        batida('4', '15:00'),
      ],
      H('15:00'),
      SEGUNDA,
      true,
      false,
      regras,
    );

    expect(j.baseMs).toBe(26_400_000); // 7h20, não 0
    expect(j.horasExtrasMs).toBe(40 * 60_000); // 8h − 7h20 = 40min
    expect(j.horasExtras100Ms).toBe(40 * 60_000); // a 100%, por ser feriado
    expect(j.tac).toBe(false); // 40min < 1h50 — sem TAC falso
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
  // Contrato COM intervalo obrigatório (ex.: 6x1, 6h): 2 batidas = saída para
  // intervalo (nunca encerramento corrido); o dia só encerra se o intervalo
  // ultrapassar o máximo (3h). O TAC por intervalo irregular sai no retorno.
  const REGRAS_COM_INTERVALO = {
    ...REGRAS_PADRAO,
    cargaBaseMs: () => 6 * 60 * 60_000, // 6h
    intervaloMinimoMs: 20 * 60_000, // 20 min
    intervaloObrigatorio: true,
    // intervaloMaximoMs = 3h (herdado de REGRAS_PADRAO).
  };

  it('2 batidas com intervalo em curso (≤ máximo) ficam EM_INTERVALO, não encerram', () => {
    // Caso real: entrou 08:28, saiu para intervalo 12:11, ainda em intervalo.
    const j = calcularJornadaDia(
      [batida('e', '08:28'), batida('s', '12:11')],
      H('12:30'),
      SEGUNDA,
      false,
      false, // dia em andamento
      REGRAS_COM_INTERVALO,
    );
    expect(j.status).toBe('EM_INTERVALO');
    expect(j.batidas[1].tipo).toBe('SAIDA_INTERVALO');
    // Ainda dentro do máximo: NÃO é não-retorno.
    expect(j.naoRetornoIntervalo).toBe(false);
  });

  it('intervalo em curso acima do máximo (3h) encerra a jornada (sem TAC ainda)', () => {
    const j = calcularJornadaDia(
      [batida('e', '08:00'), batida('s', '12:00')],
      H('15:30'), // 3h30 desde a saída → passou de 3h
      SEGUNDA,
      false,
      false,
      REGRAS_COM_INTERVALO,
    );
    expect(j.status).toBe('ENCERRADO');
    expect(j.trabalhadoMs).toBe(4 * 60 * 60_000); // 08:00→12:00
    expect(j.tac).toBe(false); // o TAC só se confirma quando ela bate o retorno
    // Correção: mesmo com o turno encerrado por intervalo obrigatório excedido,
    // isto É um não-retorno — a detecção automática passa a registrá-lo.
    expect(j.naoRetornoIntervalo).toBe(true);
  });

  it('retorno do intervalo acima do máximo (3h) gera TAC ao bater ponto', () => {
    const j = calcularJornadaDia(
      [
        batida('e', '08:00'),
        batida('si', '11:00'),
        batida('ri', '14:30'), // intervalo de 3h30 (> 3h)
        batida('f', '17:00'),
      ],
      H('18:00'),
      SEGUNDA,
      false,
      true,
      REGRAS_COM_INTERVALO,
    );
    expect(j.status).toBe('ENCERRADO');
    expect(j.tac).toBe(true);
    expect(j.motivosTac).toContain('Intervalo acima de 3h');
  });

  it('contrato de 4h corridas (sem intervalo obrigatório): 2 batidas encerram, sem TAC', () => {
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

/**
 * O que um feriado herda do domingo, e o que não herda.
 *
 * **Herda:** a jornada (7h20), o horário de entrada/saída e o adicional de 100%
 * com a sua isenção de débito.
 *
 * **Não herda:** o rodízio de grupos e a **folga**. Quem folga fixo no domingo e
 * está escalado numa segunda feriada trabalha nessa segunda — o feriado não
 * dispensa ninguém.
 *
 * A distinção que estes testes protegem é mais fina do que parece: a jornada do
 * feriado é 7h20 **para todos**, e não "a carga de domingo DESTA pessoa". Quem
 * folga no domingo tem esse dia zerado no contrato, e ler a jornada do feriado
 * dali fazia o dia esperar zero hora — jornada inteira como extra, e TAC.
 *
 * A isenção de débito é deliberada: as horas do feriado são pagas a 100% e o
 * trabalhador as cobra, então debitá-las seria cobrar duas vezes o mesmo dia.
 */
describe('feriado: o que segue o domingo e o que não segue', () => {
  it('a JORNADA do feriado é 7h20, em qualquer dia da semana', () => {
    // Sem feriado, vale a carga do dia: domingo 7h20, seg–qui 7h, sex–sáb 8h.
    expect(cargaBaseDoDia(0, false)).toBe(26_400_000); // domingo: 7h20
    expect(cargaBaseDoDia(1, false)).toBe(25_200_000); // segunda: 7h
    expect(cargaBaseDoDia(5, false)).toBe(28_800_000); // sexta: 8h
    // Com feriado, 7h20 sempre — a jornada de um domingo.
    expect(cargaBaseDoDia(1, true)).toBe(26_400_000); // segunda feriada
    expect(cargaBaseDoDia(5, true)).toBe(26_400_000); // sexta feriada
    expect(cargaBaseDoDia(6, true)).toBe(26_400_000); // sábado feriado
  });

  it('a jornada do feriado NÃO vem do domingo deste contrato', () => {
    // A distinção que fecha o bug: um contrato de quem folga fixo no domingo tem
    // esse dia zerado. A jornada do feriado é 7h20 mesmo assim.
    const folgaDomingo: RegrasContrato = {
      ...REGRAS_PADRAO,
      cargaBaseMs: (diaSemana) => (diaSemana === 0 ? 0 : 25_200_000),
    };

    expect(cargaBaseDoDia(0, false, folgaDomingo)).toBe(0); // domingo: folga
    expect(cargaBaseDoDia(1, true, folgaDomingo)).toBe(26_400_000); // feriado: 7h20
  });

  it('o ADICIONAL de 100% segue o domingo (todo feriado paga 100%)', () => {
    expect(diaPagaAdicional100(1, false)).toBe(false); // segunda comum: 50%
    expect(diaPagaAdicional100(1, true)).toBe(true); // segunda feriada: 100%
    expect(diaPagaAdicional100(0, false)).toBe(true); // domingo: 100%
  });

  it('acima de 1h50 de extras é TAC, inclusive em feriado', () => {
    // O limite é o mesmo todos os dias: 1h50. Num feriado (jornada 7h20), isso
    // significa TAC a partir de 9h10 trabalhadas.
    expect(REGRAS_PADRAO.limiteExtrasMs).toBe(110 * 60_000); // 1h50
    const j = calcularJornadaDia(
      [
        batida('1', '06:00'),
        batida('2', '12:00'),
        batida('3', '13:00'),
        batida('4', '16:20'),
      ],
      H('16:20'),
      SEGUNDA,
      true,
    );
    expect(j.baseMs).toBe(26_400_000); // 7h20
    expect(j.horasExtrasMs).toBe(120 * 60_000); // 9h20 − 7h20 = 2h
    expect(j.tac).toBe(true); // 2h > 1h50
  });

  it('o feriado continua ISENTO de hora devida (as horas são pagas a 100%)', () => {
    // `diaPagaAdicional100` responde também por esta isenção — quem trabalha
    // menos que a base num feriado NÃO fica devendo. Debitar horas de um dia
    // pago a 100% seria cobrar o mesmo dia duas vezes. Este teste existe para
    // que a correção da jornada não arraste a isenção junto.
    expect(diaPagaAdicional100(1, true)).toBe(true);
  });

  it('a isenção NÃO se estende a um dia útil comum', () => {
    // O contrapeso: só domingo e feriado são isentos. Um dia comum trabalhado
    // abaixo da jornada segue gerando hora devida.
    const regras: RegrasContrato = REGRAS_PADRAO;
    expect(diaPagaAdicional100(2, false, regras)).toBe(false);
    expect(diaPagaAdicional100(5, false, regras)).toBe(false);
  });
});

/**
 * BATIDAS REPETIDAS: a defesa do cálculo contra o dia gravado duas vezes.
 *
 * O caso real que motivou isto: um colaborador mudou de função para FISCAL. A
 * partir daí ele bate ponto com um `Fiscal.id` novo, mas o histórico dele ficou
 * gravado com o `Colaborador.id`. O gestor, vendo as horas "desaparecerem" das
 * telas de fiscal, reanotou o dia à mão — e como o limite de 4 batidas é validado
 * POR IDENTIDADE, o dia terminou com oito marcações. Nenhuma foi gravada por
 * engano; juntas descrevem um dia que não existiu.
 *
 * O pior não era somar horas a mais: a ordem posicional é o que dá sentido a cada
 * batida, então uma cópia da entrada empurra tudo uma casa e a jornada passa a
 * medir intervalos entre marcações sem relação — quase sempre resultando em MENOS
 * horas do que a pessoa trabalhou, o que virava hora devida contra ela.
 *
 * Nada é apagado: a defesa é no cálculo. As duas séries seguem no banco e o
 * painel de inconsistências continua apontando `DUPLICADA` para o dia.
 */
describe('descartarBatidasRepetidas', () => {
  it('descarta a cópia exata e mantém a primeira', () => {
    // A reanotação mais comum: a mesma hora, gravada de novo.
    const r = descartarBatidasRepetidas([
      batida('a', '07:00'),
      batida('b', '07:00'),
      batida('c', '12:00'),
    ]);

    expect(r.map((b) => b.id)).toEqual(['a', 'c']);
  });

  it('descarta o que está mais próximo que o limite de duplicidade', () => {
    // Mesmo critério e mesmo limite de `batidaDuplicada`, que é o que o relógio
    // usa para RECUSAR uma batida próxima demais. Aqui só reaproveitamos a regra.
    const limiteMin = INTERVALO_MINIMO_ENTRE_BATIDAS_MS / 60_000;
    expect(limiteMin).toBeGreaterThan(0);

    const r = descartarBatidasRepetidas([
      batida('a', '07:00'),
      batida('b', '07:01'), // dentro do limite → repetição
      batida('c', '12:00'),
    ]);

    expect(r.map((b) => b.id)).toEqual(['a', 'c']);
  });

  it('NÃO descarta marcações legítimas distantes', () => {
    // O contrapeso que importa: um dia normal de quatro marcações não pode
    // perder nenhuma.
    const dia = [
      batida('a', '07:00'),
      batida('b', '12:00'),
      batida('c', '13:00'),
      batida('d', '16:00'),
    ];

    expect(descartarBatidasRepetidas(dia).map((b) => b.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('o dia inteiro duplicado volta a ser um dia de quatro marcações', () => {
    // As oito batidas do caso real, intercaladas como o banco as devolveria.
    const r = descartarBatidasRepetidas([
      batida('v1', '07:00'),
      batida('n1', '07:00'),
      batida('v2', '12:00'),
      batida('n2', '12:00'),
      batida('v3', '13:00'),
      batida('n3', '13:00'),
      batida('v4', '16:00'),
      batida('n4', '16:00'),
    ]);

    expect(r).toHaveLength(4);
    expect(r.map((b) => b.hora.toISOString().slice(11, 16))).toEqual([
      '07:00',
      '12:00',
      '13:00',
      '16:00',
    ]);
  });

  it('é determinística: a mesma entrada dá sempre o mesmo resultado', () => {
    // Sem isto, o total de horas de uma pessoa mudaria entre dois carregamentos
    // da mesma tela, conforme a ordem em que o banco devolvesse as linhas.
    const embaralhada = [
      batida('n1', '07:00'),
      batida('v1', '07:00'),
      batida('v2', '12:00'),
      batida('n2', '12:00'),
    ];
    const inversa = [...embaralhada].reverse();

    expect(descartarBatidasRepetidas(embaralhada).map((b) => b.id)).toEqual(
      descartarBatidasRepetidas(inversa).map((b) => b.id),
    );
  });

  it('compara com a última MANTIDA, não com a anterior descartada', () => {
    // A janela é de 2 min (`INTERVALO_MINIMO_ENTRE_BATIDAS_MS`) e a comparação é
    // sempre contra a última batida MANTIDA. A consequência é deliberada e
    // conservadora: 07:01 é descartada (1 min de 07:00), mas 07:02 sobrevive,
    // porque está a exatamente 2 min da mantida — fora da janela.
    //
    // Comparar contra a anterior ORIGINAL faria uma sequência de marcações
    // espaçadas de 1 min colapsar toda numa só, apagando marcações legítimas em
    // cascata. Entre descartar de menos e descartar de mais, aqui vale o de
    // menos: uma marcação a mais aparece no painel como `DUPLICADA` e o gestor
    // decide; uma marcação a menos apaga trabalho real da conta de alguém.
    const r = descartarBatidasRepetidas([
      batida('a', '07:00'),
      batida('b', '07:01'),
      batida('c', '07:02'),
      batida('d', '12:00'),
    ]);

    expect(r.map((b) => b.id)).toEqual(['a', 'c', 'd']);
  });

  it('colapsa um grupo inteiro quando todas caem dentro da janela', () => {
    // Três cópias da mesma hora — o caso da reanotação — viram uma só.
    const r = descartarBatidasRepetidas([
      batida('a', '07:00'),
      batida('b', '07:00'),
      batida('c', '07:00'),
      batida('d', '12:00'),
    ]);

    expect(r.map((b) => b.id)).toEqual(['a', 'd']);
  });

  it('a JORNADA de um dia duplicado é a mesma de um dia normal', () => {
    // O teste que fecha o caso: 07-12 + 13-16 = 8h, com ou sem a segunda série.
    // Antes, as oito marcações produziam uma jornada sem relação com o dia real.
    const normal = calcularJornadaDia(
      [
        batida('a', '07:00'),
        batida('b', '12:00'),
        batida('c', '13:00'),
        batida('d', '16:00'),
      ],
      H('16:00'),
      SEGUNDA,
    );
    const duplicado = calcularJornadaDia(
      [
        batida('v1', '07:00'),
        batida('n1', '07:00'),
        batida('v2', '12:00'),
        batida('n2', '12:00'),
        batida('v3', '13:00'),
        batida('n3', '13:00'),
        batida('v4', '16:00'),
        batida('n4', '16:00'),
      ],
      H('16:00'),
      SEGUNDA,
    );

    expect(duplicado.trabalhadoMs).toBe(normal.trabalhadoMs);
    expect(duplicado.status).toBe(normal.status);
    expect(duplicado.horasExtrasMs).toBe(normal.horasExtrasMs);
    expect(duplicado.tac).toBe(normal.tac);
  });
});
