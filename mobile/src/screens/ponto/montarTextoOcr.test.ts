import { montarTextoDeLinhas, textoPelaGeometria } from './montarTextoOcr';

describe('montar texto do OCR pela geometria', () => {
  it('agrupa por faixa (mesma altura) e ordena da esquerda p/ direita', () => {
    const linhas = [
      { texto: '13:18', x: 200, y: 100, altura: 20 },
      { texto: 'HORA:', x: 100, y: 102, altura: 20 },
      { texto: 'NOME: ANA', x: 100, y: 50, altura: 20 },
    ];
    // Faixa de cima primeiro; dentro da faixa, rótulo (x menor) antes do valor.
    expect(montarTextoDeLinhas(linhas)).toBe('NOME: ANA\nHORA: 13:18');
  });

  it('lê os blocos/linhas do ML Kit (frame left/top)', () => {
    const resultado = {
      blocks: [
        {
          lines: [
            { text: 'HORA:', frame: { left: 10, top: 100, width: 30, height: 20 } },
            { text: '07:56', frame: { left: 60, top: 101, width: 40, height: 20 } },
          ],
        },
      ],
    };
    expect(textoPelaGeometria(resultado)).toBe('HORA: 07:56');
  });

  it('devolve null quando não há geometria', () => {
    expect(textoPelaGeometria({ blocks: [] })).toBeNull();
    expect(textoPelaGeometria({})).toBeNull();
  });
});
