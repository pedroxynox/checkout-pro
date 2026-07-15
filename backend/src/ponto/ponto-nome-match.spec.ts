import {
  distanciaLevenshtein,
  scoreNome,
  similaridadePalavra,
} from './ponto-nome-match';

describe('comparação de nomes do leitor de ponto', () => {
  it('distância de edição básica', () => {
    expect(distanciaLevenshtein('casa', 'casa')).toBe(0);
    expect(distanciaLevenshtein('casa', 'caso')).toBe(1);
    expect(distanciaLevenshtein('', 'abc')).toBe(3);
    expect(distanciaLevenshtein('abc', '')).toBe(3);
  });

  it('similaridade entre palavras (0 a 1)', () => {
    expect(similaridadePalavra('REYES', 'REYES')).toBe(1);
    expect(similaridadePalavra('REYES', 'REYEZ')).toBeCloseTo(0.8, 5);
  });

  it('score 1 para nomes iguais', () => {
    expect(scoreNome('ANA SOUZA SILVA', 'ANA SOUZA SILVA')).toBe(1);
  });

  it('tolera um erro de letra do OCR no nome', () => {
    // "REYEZ" lido no lugar de "REYES" ainda casa forte.
    const s = scoreNome(
      'BETZABETH ELISA CASTELLANO REYEZ',
      'BETZABETH ELISA CASTELLANO REYES',
    );
    expect(s).toBeGreaterThan(0.8);
  });

  it('não casa por pedaço curto (evita falso positivo)', () => {
    // "ANA" não deve casar forte com "MARIANA COSTA".
    expect(scoreNome('ANA', 'MARIANA COSTA')).toBeLessThan(0.5);
  });

  it('nome certo pontua bem mais que um nome diferente', () => {
    const alvo = 'RAQUEL SILVA DE OLIVEIRA BENETON';
    const certo = scoreNome(alvo, 'RAQUEL SILVA DE OLIVEIRA BENETON');
    const outro = scoreNome(alvo, 'MARCOS PEREIRA SANTOS');
    expect(certo).toBe(1);
    expect(outro).toBeLessThan(0.4);
    expect(certo).toBeGreaterThan(outro);
  });
});
