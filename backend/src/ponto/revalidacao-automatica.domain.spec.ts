/**
 * Regras puras da AUTO-CURA: quando uma ocorrência que o sistema lançou deixa de
 * ser verdade. O ponto destes testes é fixar as ASSIMETRIAS entre falta e não
 * retorno, que são a parte fácil de errar.
 */
import {
  FatosDoDia,
  descreverMotivo,
  ehFaltaAutomaticaPendente,
  motivoParaRemoverFalta,
  motivoParaRemoverNaoRetorno,
} from './revalidacao-automatica.domain';

/** Dia sem nenhum fato: a ocorrência continua válida. */
const NADA: FatosDoDia = {
  temBatida: false,
  intervaloFechado: false,
  temAtestado: false,
  temAusenciaAPrazo: false,
  deFerias: false,
  ehFolga: false,
};

describe('motivoParaRemoverFalta', () => {
  it('sem nenhum fato novo, a falta continua válida', () => {
    expect(motivoParaRemoverFalta(NADA)).toBeNull();
  });

  it('qualquer batida no dia derruba a falta', () => {
    expect(motivoParaRemoverFalta({ ...NADA, temBatida: true })).toBe(
      'BATIDA_REGISTRADA',
    );
  });

  it('atestado, ausência a prazo e férias derrubam a falta', () => {
    expect(motivoParaRemoverFalta({ ...NADA, temAtestado: true })).toBe(
      'ATESTADO',
    );
    expect(motivoParaRemoverFalta({ ...NADA, temAusenciaAPrazo: true })).toBe(
      'AUSENCIA_A_PRAZO',
    );
    expect(motivoParaRemoverFalta({ ...NADA, deFerias: true })).toBe('FERIAS');
  });

  it('a batida prevalece como motivo quando há mais de um', () => {
    // Não muda a decisão (remover), só o motivo registrado no log.
    expect(
      motivoParaRemoverFalta({ ...NADA, temBatida: true, deFerias: true }),
    ).toBe('BATIDA_REGISTRADA');
  });

  it('fechar o intervalo NÃO é motivo para remover uma falta', () => {
    // "Fechou o intervalo" é assunto do não retorno; para a falta o que importa
    // é ter batido ponto (e se fechou o intervalo, bateu — daí temBatida).
    expect(
      motivoParaRemoverFalta({ ...NADA, intervaloFechado: true }),
    ).toBeNull();
  });

  it('dia de FOLGA derruba a falta', () => {
    // Sem isto a falta lançada em dia de descanso ficava para sempre: a auto-cura
    // esperava uma batida que num dia de folga nunca chega.
    expect(motivoParaRemoverFalta({ ...NADA, ehFolga: true })).toBe('FOLGA');
  });
});

describe('motivoParaRemoverNaoRetorno', () => {
  it('sem nenhum fato novo, o não retorno continua válido', () => {
    expect(motivoParaRemoverNaoRetorno(NADA)).toBeNull();
  });

  it('ter batidas NÃO derruba o não retorno (é o seu pressuposto)', () => {
    // O não retorno pressupõe entrada + saída para o intervalo: existir batida é
    // justamente a condição dele, não a sua negação. Esta é a assimetria com a
    // falta e o erro mais fácil de cometer aqui.
    expect(
      motivoParaRemoverNaoRetorno({ ...NADA, temBatida: true }),
    ).toBeNull();
  });

  it('fechar o intervalo derruba o não retorno', () => {
    expect(
      motivoParaRemoverNaoRetorno({ ...NADA, intervaloFechado: true }),
    ).toBe('INTERVALO_FECHADO');
  });

  it('atestado, ausência a prazo e férias também o derrubam', () => {
    expect(motivoParaRemoverNaoRetorno({ ...NADA, temAtestado: true })).toBe(
      'ATESTADO',
    );
    expect(
      motivoParaRemoverNaoRetorno({ ...NADA, temAusenciaAPrazo: true }),
    ).toBe('AUSENCIA_A_PRAZO');
    expect(motivoParaRemoverNaoRetorno({ ...NADA, deFerias: true })).toBe(
      'FERIAS',
    );
  });

  it('FOLGA não derruba o não retorno (a pessoa trabalhou naquele dia)', () => {
    // Assimetria proposital com a falta: se há batidas de entrada e de saída
    // para o intervalo, o fato aconteceu — mesmo sendo a folga dela. Apagá-lo
    // seria perder informação real; já a falta afirma uma expectativa que não
    // existia.
    expect(motivoParaRemoverNaoRetorno({ ...NADA, ehFolga: true })).toBeNull();
  });
});

describe('ehFaltaAutomaticaPendente', () => {
  it('é a falta que nasceu automática e não foi convertida', () => {
    expect(
      ehFaltaAutomaticaPendente({
        automatica: true,
        atestadoId: null,
        aPrazo: false,
      }),
    ).toBe(true);
  });

  it('falta MANUAL nunca é tocada pela auto-cura', () => {
    expect(
      ehFaltaAutomaticaPendente({
        automatica: false,
        atestadoId: null,
        aPrazo: false,
      }),
    ).toBe(false);
  });

  it('dia JÁ CONVERTIDO em atestado não é tocado, mesmo nascendo automático', () => {
    // Quando um atestado converte uma falta, a linha é reaproveitada e segue com
    // `automatica = true` (é o histórico). Se a auto-cura olhasse só essa marca,
    // apagaria um dia de atestado legítimo e o atestado ficaria com um buraco.
    expect(
      ehFaltaAutomaticaPendente({
        automatica: true,
        atestadoId: 'at-1',
        aPrazo: true,
      }),
    ).toBe(false);
  });

  it('dia de ausência a prazo (sem atestado) também não é tocado', () => {
    expect(
      ehFaltaAutomaticaPendente({
        automatica: true,
        atestadoId: null,
        aPrazo: true,
      }),
    ).toBe(false);
  });
});

describe('descreverMotivo', () => {
  it('descreve todos os motivos em português', () => {
    expect(descreverMotivo('BATIDA_REGISTRADA')).toBe('bateu ponto no dia');
    expect(descreverMotivo('INTERVALO_FECHADO')).toBe('fechou o intervalo');
    expect(descreverMotivo('ATESTADO')).toBe('dia coberto por atestado');
    expect(descreverMotivo('AUSENCIA_A_PRAZO')).toBe(
      'dia coberto por ausência a prazo',
    );
    expect(descreverMotivo('FERIAS')).toBe('de férias no dia');
    expect(descreverMotivo('FOLGA')).toBe('dia de folga da pessoa');
  });
});
