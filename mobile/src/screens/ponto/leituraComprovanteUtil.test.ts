import { horaLida, leituraCompleta } from './leituraComprovanteUtil';

describe('leituraCompleta (gatilho do leitor ao vivo)', () => {
  it('aceita quando há hora + marcador do comprovante', () => {
    expect(
      leituraCompleta('COMPROVANTE DE REGISTRO DE PONTO\nNOME:ANA\nHORA:07:56'),
    ).toBe(true);
    expect(leituraCompleta('FUNCIONARIO ANA SOUZA 07:56')).toBe(true);
  });

  it('aceita hora com letras trocadas pelo OCR (S->5, O->0)', () => {
    expect(leituraCompleta('NOME:ANA DATA:13/07/2026 HORA:1S:34')).toBe(true);
    expect(leituraCompleta('TRABALHADOR HORA:O7:56')).toBe(true);
  });

  it('rejeita leitura parcial (sem hora ou sem marcador)', () => {
    expect(leituraCompleta('COMPROVANTE DE REGISTRO DE PONTO')).toBe(false); // sem hora
    expect(leituraCompleta('07:56')).toBe(false); // sem marcador
    expect(leituraCompleta('')).toBe(false);
    expect(leituraCompleta('texto ilegível %%%')).toBe(false);
  });
});

describe('horaLida (extração da hora para a votação)', () => {
  it('extrai a hora, tolerante ao OCR', () => {
    expect(horaLida('HORA:13:18')).toBe('13:18');
    expect(horaLida('HORA:1S:34')).toBe('15:34'); // S→5
    expect(horaLida('HORA 0756')).toBe('07:56'); // sem separador
    expect(horaLida('bateu 7h05')).toBe('07:05');
    expect(horaLida('sem hora')).toBeNull();
  });
});
