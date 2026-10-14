import {
  INTERVALO_LEMBRETE_DIAS,
  deveAvisarPonto,
  diasDeAtraso,
  diffEmDias,
  garantirPontoPendente,
  normalizarTextoEdicao,
  pontoVencido,
  situacaoPonto,
  validarProrrogacao,
} from './feedforward.domain';
import {
  PontoJaRevisadoError,
  ProrrogacaoInvalidaError,
} from './feedforward.errors';

const HOJE = new Date(Date.UTC(2026, 6, 15)); // 15/07/2026
const D = (dia: number): Date => new Date(Date.UTC(2026, 6, dia));

describe('feedforward.domain — situacaoPonto', () => {
  it('pendente com folga de prazo → EM_DIA', () => {
    expect(situacaoPonto('PENDENTE', D(20), HOJE)).toBe('EM_DIA');
  });

  it('pendente vencendo em <= 3 dias → PROXIMO', () => {
    expect(situacaoPonto('PENDENTE', D(17), HOJE)).toBe('PROXIMO');
    expect(situacaoPonto('PENDENTE', D(16), HOJE)).toBe('PROXIMO');
  });

  it('pendente com prazo hoje ou passado → VENCIDO', () => {
    expect(situacaoPonto('PENDENTE', D(15), HOJE)).toBe('VENCIDO'); // hoje
    expect(situacaoPonto('PENDENTE', D(10), HOJE)).toBe('VENCIDO'); // passado
  });

  it('já revisado reflete o status (independe do prazo)', () => {
    expect(situacaoPonto('ATINGIDO', D(10), HOJE)).toBe('ATINGIDO');
    expect(situacaoPonto('NAO_ATINGIDO', D(30), HOJE)).toBe('NAO_ATINGIDO');
  });
});

describe('feedforward.domain — pontoVencido (gatilho do aviso)', () => {
  it('pendente com prazo hoje ou antes → vencido', () => {
    expect(pontoVencido('PENDENTE', D(15), HOJE)).toBe(true);
    expect(pontoVencido('PENDENTE', D(14), HOJE)).toBe(true);
  });

  it('pendente com prazo futuro → não vencido', () => {
    expect(pontoVencido('PENDENTE', D(16), HOJE)).toBe(false);
  });

  it('já revisado nunca é vencido', () => {
    expect(pontoVencido('ATINGIDO', D(10), HOJE)).toBe(false);
    expect(pontoVencido('NAO_ATINGIDO', D(10), HOJE)).toBe(false);
  });
});

describe('feedforward.domain — diffEmDias / diasDeAtraso', () => {
  it('conta dias civis ignorando a hora do dia', () => {
    const manha = new Date(Date.UTC(2026, 6, 15, 1, 0));
    const noite = new Date(Date.UTC(2026, 6, 16, 23, 0));
    expect(diffEmDias(manha, noite)).toBe(1);
    expect(diffEmDias(noite, manha)).toBe(-1);
  });

  it('atraso é 0 no dia do prazo, positivo depois e nunca negativo', () => {
    expect(diasDeAtraso(D(15), HOJE)).toBe(0);
    expect(diasDeAtraso(D(8), HOJE)).toBe(7);
    expect(diasDeAtraso(D(20), HOJE)).toBe(0); // prazo futuro
  });

  it('atravessa a virada de mês corretamente', () => {
    const prazo = new Date(Date.UTC(2026, 5, 28)); // 28/06
    expect(diasDeAtraso(prazo, HOJE)).toBe(17);
  });
});

describe('feedforward.domain — deveAvisarPonto (cadência dos avisos)', () => {
  it('o intervalo de lembrete é de 7 dias', () => {
    expect(INTERVALO_LEMBRETE_DIAS).toBe(7);
  });

  it('avisa no dia em que o prazo vence', () => {
    expect(deveAvisarPonto('PENDENTE', D(15), HOJE)).toBe(true);
  });

  it('não avisa antes do prazo', () => {
    expect(deveAvisarPonto('PENDENTE', D(16), HOJE)).toBe(false);
    expect(deveAvisarPonto('PENDENTE', D(30), HOJE)).toBe(false);
  });

  it('não repete nos dias 1 a 6 de atraso', () => {
    for (let atraso = 1; atraso <= 6; atraso++) {
      expect(deveAvisarPonto('PENDENTE', D(15 - atraso), HOJE)).toBe(false);
    }
  });

  it('lembra a cada 7 dias de atraso (7, 14, 21…)', () => {
    expect(deveAvisarPonto('PENDENTE', D(8), HOJE)).toBe(true); // 7
    expect(deveAvisarPonto('PENDENTE', D(1), HOJE)).toBe(true); // 14
    expect(
      deveAvisarPonto('PENDENTE', new Date(Date.UTC(2026, 5, 24)), HOJE),
    ).toBe(true); // 21
    expect(deveAvisarPonto('PENDENTE', D(7), HOJE)).toBe(false); // 8
  });

  it('ponto já revisado nunca gera aviso', () => {
    expect(deveAvisarPonto('ATINGIDO', D(15), HOJE)).toBe(false);
    expect(deveAvisarPonto('NAO_ATINGIDO', D(8), HOJE)).toBe(false);
  });

  it('propriedade: em 60 dias seguidos, avisa só no prazo e a cada 7 dias', () => {
    const prazo = D(1);
    const diasComAviso: number[] = [];
    for (let i = -5; i < 60; i++) {
      const hoje = new Date(Date.UTC(2026, 6, 1 + i));
      if (deveAvisarPonto('PENDENTE', prazo, hoje)) diasComAviso.push(i);
    }
    expect(diasComAviso).toEqual([0, 7, 14, 21, 28, 35, 42, 49, 56]);
  });
});

describe('feedforward.domain — garantirPontoPendente', () => {
  it('aceita ponto pendente', () => {
    expect(() => garantirPontoPendente('PENDENTE')).not.toThrow();
  });

  it('recusa ponto já revisado com PontoJaRevisadoError (409)', () => {
    for (const s of ['ATINGIDO', 'NAO_ATINGIDO'] as const) {
      let erro: unknown;
      try {
        garantirPontoPendente(s);
      } catch (e) {
        erro = e;
      }
      expect(erro).toBeInstanceOf(PontoJaRevisadoError);
      expect((erro as PontoJaRevisadoError).statusHttp).toBe(409);
    }
  });
});

describe('feedforward.domain — validarProrrogacao', () => {
  it('aceita um novo prazo posterior ao atual e futuro', () => {
    expect(() =>
      validarProrrogacao('PENDENTE', D(10), D(25), HOJE),
    ).not.toThrow();
    // prazo ainda no futuro, estendido
    expect(() =>
      validarProrrogacao('PENDENTE', D(20), D(21), HOJE),
    ).not.toThrow();
  });

  it('recusa ponto já revisado', () => {
    expect(() => validarProrrogacao('ATINGIDO', D(10), D(25), HOJE)).toThrow(
      PontoJaRevisadoError,
    );
  });

  it('recusa novo prazo igual ou anterior ao atual', () => {
    expect(() => validarProrrogacao('PENDENTE', D(20), D(20), HOJE)).toThrow(
      ProrrogacaoInvalidaError,
    );
    expect(() => validarProrrogacao('PENDENTE', D(20), D(18), HOJE)).toThrow(
      /posterior ao prazo atual \(20\/07\/2026\)/,
    );
  });

  it('recusa novo prazo hoje ou no passado', () => {
    expect(() => validarProrrogacao('PENDENTE', D(1), D(15), HOJE)).toThrow(
      /data futura/,
    );
    expect(() => validarProrrogacao('PENDENTE', D(1), D(10), HOJE)).toThrow(
      ProrrogacaoInvalidaError,
    );
  });

  it('recusa data inválida', () => {
    expect(() =>
      validarProrrogacao('PENDENTE', D(1), new Date('x'), HOJE),
    ).toThrow(/prazo válido/);
  });

  it('ProrrogacaoInvalidaError responde 400', () => {
    expect(new ProrrogacaoInvalidaError('x').statusHttp).toBe(400);
  });
});

describe('feedforward.domain — normalizarTextoEdicao', () => {
  it('undefined = não mexer; null/vazio = limpar; texto = sem espaços', () => {
    expect(normalizarTextoEdicao(undefined)).toBeUndefined();
    expect(normalizarTextoEdicao(null)).toBeNull();
    expect(normalizarTextoEdicao('   ')).toBeNull();
    expect(normalizarTextoEdicao('  Bom atendimento ')).toBe('Bom atendimento');
  });
});
