import {
  ALERTA_ATRASO_MIN,
  FALTA_AUTOMATICA_MIN,
  estadoSemBatida,
  hhmmParaMinutos,
  minutosAposEntrada,
} from './deteccao-automatica.domain';

/**
 * "Agora" de Brasília rotulado como UTC (mesma convenção de `agoraNaBrasilia`):
 * os componentes UTC representam a hora de parede local.
 */
function agora(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 6, 20, h, m, 0));
}

describe('deteccao-automatica.domain', () => {
  describe('hhmmParaMinutos', () => {
    it('converte horários válidos', () => {
      expect(hhmmParaMinutos('00:00')).toBe(0);
      expect(hhmmParaMinutos('08:30')).toBe(510);
      expect(hhmmParaMinutos('23:59')).toBe(1439);
    });

    it('rejeita entradas inválidas', () => {
      expect(hhmmParaMinutos(null)).toBeNull();
      expect(hhmmParaMinutos('')).toBeNull();
      expect(hhmmParaMinutos('24:00')).toBeNull();
      expect(hhmmParaMinutos('9h')).toBeNull();
    });
  });

  describe('minutosAposEntrada', () => {
    it('conta os minutos desde a entrada prevista', () => {
      expect(minutosAposEntrada('08:00', agora('08:00'))).toBe(0);
      expect(minutosAposEntrada('08:00', agora('09:00'))).toBe(60);
      expect(minutosAposEntrada('08:00', agora('10:30'))).toBe(150);
    });

    it('é negativo antes da hora e nulo sem entrada', () => {
      expect(minutosAposEntrada('08:00', agora('07:30'))).toBe(-30);
      expect(minutosAposEntrada(null, agora('09:00'))).toBeNull();
    });
  });

  describe('estadoSemBatida', () => {
    it('aguarda antes de 1h', () => {
      expect(estadoSemBatida(0)).toBe('AGUARDANDO');
      expect(estadoSemBatida(ALERTA_ATRASO_MIN - 1)).toBe('AGUARDANDO');
      expect(estadoSemBatida(-30)).toBe('AGUARDANDO');
    });

    it('alerta visual a partir de 1h e antes de 2h', () => {
      expect(estadoSemBatida(ALERTA_ATRASO_MIN)).toBe('ALERTA');
      expect(estadoSemBatida(FALTA_AUTOMATICA_MIN - 1)).toBe('ALERTA');
    });

    it('vira falta a partir de 2h', () => {
      expect(estadoSemBatida(FALTA_AUTOMATICA_MIN)).toBe('FALTA');
      expect(estadoSemBatida(FALTA_AUTOMATICA_MIN + 60)).toBe('FALTA');
    });

    it('nunca marca falta sem entrada prevista (null)', () => {
      expect(estadoSemBatida(null)).toBe('AGUARDANDO');
    });
  });
});
