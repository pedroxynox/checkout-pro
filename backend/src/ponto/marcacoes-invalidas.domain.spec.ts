/**
 * Testes da análise de MARCAÇÕES INVÁLIDAS: quantas marcações faltam no dia e
 * QUAIS. O caso que motivou o módulo é o primeiro descrito abaixo — a entrada
 * esquecida, que a classificação posicional de `calcularJornadaDia` aponta como
 * "falta o encerramento".
 */
import fc from 'fast-check';
import {
  MARCACOES_ESPERADAS_DIA,
  MARGEM_ENTRADA_AUSENTE_MIN,
  SEQUENCIA_MARCACOES,
  analisarMarcacoesDoDia,
  descreverFaltantes,
  entradaFoiEsquecida,
  horaMarcacaoHHmm,
  rotuloMarcacao,
} from './marcacoes-invalidas.domain';
import { REGRAS_PADRAO } from './ponto.domain';

/** Hora de parede (Brasília) rotulada UTC, como as batidas chegam do banco. */
const H = (hhmm: string): Date => new Date(`2026-07-13T${hhmm}:00Z`);

const TURNO = '08:00';

describe('analisarMarcacoesDoDia — entrada esquecida (o caso central)', () => {
  it('com 3 batidas começando no meio do dia, aponta a ENTRADA como faltante', () => {
    // Turno às 08:00, mas a 1ª batida é 12:00: aquela é a saída para o
    // intervalo. A classificação posicional diria "falta o encerramento".
    const a = analisarMarcacoesDoDia(
      [H('12:00'), H('13:30'), H('17:20')],
      TURNO,
    );
    expect(a.entradaAusente).toBe(true);
    expect(a.quantidadeFaltante).toBe(1);
    expect(a.tiposFaltantes).toEqual(['ENTRADA']);
    expect(a.tiposPresentes).toEqual([
      'SAIDA_INTERVALO',
      'RETORNO_INTERVALO',
      'ENCERRAMENTO',
    ]);
    expect(a.confianca).toBe('ALTA');
    expect(a.observacao).toBeNull();
  });

  it('com 2 batidas e a entrada esquecida, faltam duas e pede conferência', () => {
    const a = analisarMarcacoesDoDia([H('13:30'), H('17:20')], TURNO);
    expect(a.entradaAusente).toBe(true);
    expect(a.quantidadeFaltante).toBe(2);
    expect(a.tiposFaltantes).toEqual(['ENTRADA', 'SAIDA_INTERVALO']);
    expect(a.tiposPresentes).toEqual(['RETORNO_INTERVALO', 'ENCERRAMENTO']);
    expect(a.confianca).toBe('BAIXA');
    expect(a.observacao).toContain('entrada foi esquecida');
  });

  it('atraso grave (dentro da margem) NÃO é confundido com entrada esquecida', () => {
    // 2h30 depois do turno: é atraso, não entrada faltando (margem de 3h).
    const a = analisarMarcacoesDoDia(
      [H('10:30'), H('14:00'), H('16:00')],
      TURNO,
    );
    expect(a.entradaAusente).toBe(false);
    expect(a.tiposFaltantes).toEqual(['ENCERRAMENTO']);
  });
});

describe('analisarMarcacoesDoDia — sequência ancorada no começo', () => {
  it('só a entrada registrada: faltam as três seguintes', () => {
    const a = analisarMarcacoesDoDia([H('08:02')], TURNO);
    expect(a.quantidadeFaltante).toBe(3);
    expect(a.tiposFaltantes).toEqual([
      'SAIDA_INTERVALO',
      'RETORNO_INTERVALO',
      'ENCERRAMENTO',
    ]);
    expect(a.confianca).toBe('ALTA');
  });

  it('3 batidas com intervalo válido: falta o encerramento', () => {
    const a = analisarMarcacoesDoDia(
      [H('08:00'), H('12:00'), H('13:30')],
      TURNO,
    );
    expect(a.tiposFaltantes).toEqual(['ENCERRAMENTO']);
    expect(a.tiposPresentes).toEqual([
      'ENTRADA',
      'SAIDA_INTERVALO',
      'RETORNO_INTERVALO',
    ]);
    expect(a.confianca).toBe('ALTA');
  });

  it('2 batidas cobrindo a jornada inteira: faltam as DUAS do intervalo', () => {
    // 08:00→17:20 passa de 4h50: são entrada e encerramento, e o almoço não
    // foi marcado nenhuma das duas vezes.
    const a = analisarMarcacoesDoDia([H('08:00'), H('17:20')], TURNO);
    expect(a.quantidadeFaltante).toBe(2);
    expect(a.tiposPresentes).toEqual(['ENTRADA', 'ENCERRAMENTO']);
    expect(a.tiposFaltantes).toEqual(['SAIDA_INTERVALO', 'RETORNO_INTERVALO']);
    expect(a.confianca).toBe('BAIXA');
    expect(a.observacao).toContain('jornada inteira');
  });

  it('3 batidas com vão maior que o intervalo máximo: falta o RETORNO', () => {
    // 12:00→17:20 (5h20) não é um intervalo real: a 3ª é o encerramento.
    const a = analisarMarcacoesDoDia(
      [H('08:00'), H('12:00'), H('17:20')],
      TURNO,
    );
    expect(a.tiposPresentes).toEqual([
      'ENTRADA',
      'SAIDA_INTERVALO',
      'ENCERRAMENTO',
    ]);
    expect(a.tiposFaltantes).toEqual(['RETORNO_INTERVALO']);
    expect(a.confianca).toBe('BAIXA');
    expect(a.observacao).toContain('retorno do intervalo');
  });

  it('3 batidas com intervalo abaixo do mínimo: mantém a hipótese, mas pede conferência', () => {
    const a = analisarMarcacoesDoDia(
      [H('08:00'), H('12:00'), H('12:30')],
      TURNO,
    );
    expect(a.tiposFaltantes).toEqual(['ENCERRAMENTO']);
    expect(a.confianca).toBe('BAIXA');
    expect(a.observacao).toContain('menor que o mínimo');
  });
});

describe('analisarMarcacoesDoDia — sem turno cadastrado', () => {
  it('não afirma nada sobre a entrada e marca confiança baixa', () => {
    const a = analisarMarcacoesDoDia(
      [H('08:00'), H('12:00'), H('13:30')],
      null,
    );
    expect(a.entradaAusente).toBeNull();
    expect(a.confianca).toBe('BAIXA');
    expect(a.observacao).toContain('Sem turno cadastrado');
    // Sem referência, resta a hipótese posicional (ancorada no começo).
    expect(a.tiposFaltantes).toEqual(['ENCERRAMENTO']);
  });

  it('sem turno, as durações ainda ajustam a hipótese (vão longo → falta o retorno)', () => {
    // 13:30→17:20 passa do intervalo máximo: a 3ª batida é o encerramento.
    // Sem turno não se pode dizer se a entrada existe, mas a duração fala.
    const a = analisarMarcacoesDoDia(
      [H('12:00'), H('13:30'), H('17:20')],
      null,
    );
    expect(a.entradaAusente).toBeNull();
    expect(a.tiposFaltantes).toEqual(['RETORNO_INTERVALO']);
    expect(a.confianca).toBe('BAIXA');
    expect(a.observacao).toContain('Sem turno cadastrado');
    expect(a.observacao).toContain('retorno do intervalo');
  });

  it('turno em formato inválido é tratado como ausente', () => {
    const a = analisarMarcacoesDoDia([H('12:00')], '99:99');
    expect(a.entradaAusente).toBeNull();
    expect(a.confianca).toBe('BAIXA');
  });
});

describe('analisarMarcacoesDoDia — bordas', () => {
  it('dia sem nenhuma marcação: faltam as quatro, sem ambiguidade', () => {
    const a = analisarMarcacoesDoDia([], TURNO);
    expect(a.registradas).toBe(0);
    expect(a.quantidadeFaltante).toBe(MARCACOES_ESPERADAS_DIA);
    expect(a.tiposFaltantes).toEqual([...SEQUENCIA_MARCACOES]);
    expect(a.confianca).toBe('ALTA');
  });

  it('dia com as quatro marcações: nada falta', () => {
    const a = analisarMarcacoesDoDia(
      [H('08:00'), H('12:00'), H('13:30'), H('17:20')],
      TURNO,
    );
    expect(a.quantidadeFaltante).toBe(0);
    expect(a.tiposFaltantes).toEqual([]);
    expect(a.confianca).toBe('ALTA');
  });

  it('batidas EXTRA (5ª em diante) não geram faltantes', () => {
    const a = analisarMarcacoesDoDia(
      [H('08:00'), H('12:00'), H('13:30'), H('17:20'), H('18:00')],
      TURNO,
    );
    expect(a.registradas).toBe(5);
    expect(a.quantidadeFaltante).toBe(0);
  });

  it('a ordem de entrada das horas não altera o resultado', () => {
    const desordenado = analisarMarcacoesDoDia(
      [H('17:20'), H('08:00'), H('12:00')],
      TURNO,
    );
    const ordenado = analisarMarcacoesDoDia(
      [H('08:00'), H('12:00'), H('17:20')],
      TURNO,
    );
    expect(desordenado).toEqual(ordenado);
  });
});

describe('entradaFoiEsquecida', () => {
  it('exatamente na margem ainda NÃO é entrada esquecida', () => {
    // Turno 08:00 + 180 min = 11:00 → não excede a margem.
    expect(entradaFoiEsquecida(H('11:00'), TURNO)).toBe(false);
    expect(entradaFoiEsquecida(H('11:01'), TURNO)).toBe(true);
  });

  it('chegar antes do turno nunca é entrada esquecida', () => {
    expect(entradaFoiEsquecida(H('07:40'), TURNO)).toBe(false);
  });

  it('sem turno devolve null (não dá para afirmar)', () => {
    expect(entradaFoiEsquecida(H('12:00'), null)).toBeNull();
  });
});

describe('textos do relatório', () => {
  it('rotuloMarcacao cobre as quatro marcações', () => {
    expect(SEQUENCIA_MARCACOES.map(rotuloMarcacao)).toEqual([
      'entrada',
      'saída para o intervalo',
      'retorno do intervalo',
      'encerramento',
    ]);
  });

  it('descreverFaltantes usa singular, plural e "e" antes do último', () => {
    expect(descreverFaltantes([])).toBe('');
    expect(descreverFaltantes(['ENTRADA'])).toBe('Falta registrar: entrada');
    expect(descreverFaltantes(['ENTRADA', 'ENCERRAMENTO'])).toBe(
      'Faltam registrar: entrada e encerramento',
    );
    expect(
      descreverFaltantes([
        'SAIDA_INTERVALO',
        'RETORNO_INTERVALO',
        'ENCERRAMENTO',
      ]),
    ).toBe(
      'Faltam registrar: saída para o intervalo, retorno do intervalo e encerramento',
    );
  });

  it('horaMarcacaoHHmm formata a hora de parede com dois dígitos', () => {
    expect(horaMarcacaoHHmm(H('08:05'))).toBe('08:05');
    expect(horaMarcacaoHHmm(H('17:20'))).toBe('17:20');
    expect(horaMarcacaoHHmm(H('00:00'))).toBe('00:00');
  });
});

describe('propriedades invariantes', () => {
  /** Gera de 0 a 6 horas do mesmo dia, em minutos desde a meia-noite. */
  const horasDoDia = fc
    .array(fc.integer({ min: 0, max: 24 * 60 - 1 }), {
      minLength: 0,
      maxLength: 6,
    })
    .map((mins) =>
      mins.map(
        (m) =>
          new Date(
            `2026-07-13T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(
              m % 60,
            ).padStart(2, '0')}:00Z`,
          ),
      ),
    );

  const turnoOuNulo = fc.option(
    fc
      .integer({ min: 0, max: 23 })
      .map((h) => `${String(h).padStart(2, '0')}:00`),
    { nil: null },
  );

  it('presentes + faltantes sempre cobrem as 4 marcações, sem repetir', () => {
    fc.assert(
      fc.property(horasDoDia, turnoOuNulo, (horas, turno) => {
        const a = analisarMarcacoesDoDia(horas, turno, REGRAS_PADRAO);
        const todas = [...a.tiposPresentes, ...a.tiposFaltantes];
        // Sem duplicatas.
        if (new Set(todas).size !== todas.length) return false;
        // Quando faltam marcações, presentes+faltantes = as 4 canônicas.
        if (a.quantidadeFaltante > 0) {
          return (
            new Set(todas).size === MARCACOES_ESPERADAS_DIA &&
            SEQUENCIA_MARCACOES.every((t) => todas.includes(t))
          );
        }
        return a.tiposFaltantes.length === 0;
      }),
    );
  });

  it('a contagem de faltantes bate com a lista de faltantes', () => {
    fc.assert(
      fc.property(horasDoDia, turnoOuNulo, (horas, turno) => {
        const a = analisarMarcacoesDoDia(horas, turno, REGRAS_PADRAO);
        return (
          a.tiposFaltantes.length === a.quantidadeFaltante &&
          a.quantidadeFaltante ===
            Math.max(0, MARCACOES_ESPERADAS_DIA - a.registradas) &&
          a.registradas === horas.length
        );
      }),
    );
  });

  it('a lista de faltantes segue a ordem cronológica do dia', () => {
    fc.assert(
      fc.property(horasDoDia, turnoOuNulo, (horas, turno) => {
        const a = analisarMarcacoesDoDia(horas, turno, REGRAS_PADRAO);
        const posicoes = a.tiposFaltantes.map((t) =>
          SEQUENCIA_MARCACOES.indexOf(t),
        );
        return posicoes.every((p, i) => i === 0 || posicoes[i - 1] < p);
      }),
    );
  });

  it('sempre que a entrada é apontada como faltante, o turno confirma o desvio', () => {
    fc.assert(
      fc.property(horasDoDia, turnoOuNulo, (horas, turno) => {
        const a = analisarMarcacoesDoDia(horas, turno, REGRAS_PADRAO);
        if (!a.tiposFaltantes.includes('ENTRADA')) return true;
        // Sem batidas, faltam todas — nada a confirmar.
        if (a.registradas === 0) return true;
        return (
          a.entradaAusente === true &&
          entradaFoiEsquecida(
            [...horas].sort((x, y) => x.getTime() - y.getTime())[0],
            turno,
            MARGEM_ENTRADA_AUSENTE_MIN,
          ) === true
        );
      }),
    );
  });
});
