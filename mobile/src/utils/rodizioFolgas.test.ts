/**
 * Edição do rodízio de folgas na tela: 2 dias por semana, nunca o sábado, e o
 * que falta antes de salvar (spec `jornada-5x2`, Fase 3).
 */
import {
  PADRAO_5X2,
  alternarFolga,
  comSemanas,
  pendenciasDoRodizio,
  textoFolgas,
} from './rodizioFolgas';

describe('rodízio de folgas (edição)', () => {
  it('a tabela da decisão 5 está pronta para salvar a partir de 23/11/2026', () => {
    expect(pendenciasDoRodizio('2026-11-23', PADRAO_5X2)).toEqual([]);
    expect(textoFolgas(PADRAO_5X2.G1[0])).toBe('qui + sex');
    expect(textoFolgas(PADRAO_5X2.G3[0])).toBe('seg + dom');
  });

  it('marca e desmarca, sem passar de 2 dias e sem o sábado', () => {
    const copia = comSemanas(PADRAO_5X2, 3);
    const semQui = alternarFolga(copia, 'G1', 0, 4);
    expect(semQui.G1[0]).toEqual([5]);
    expect(PADRAO_5X2.G1[0]).toEqual([4, 5]); // o original não muda
    const seg = alternarFolga(semQui, 'G1', 0, 1);
    expect(seg.G1[0]).toEqual([5, 1]);
    expect(alternarFolga(seg, 'G1', 0, 2)).toBe(seg); // terceiro dia
    expect(alternarFolga(semQui, 'G1', 0, 6)).toBe(semQui); // sábado
  });

  it('mudar o número de semanas corta ou cria semanas vazias', () => {
    const duas = comSemanas(PADRAO_5X2, 2);
    expect(duas.G2).toEqual([
      [2, 3],
      [1, 0],
    ]);
    const quatro = comSemanas(PADRAO_5X2, 4);
    expect(quatro.G3[3]).toEqual([]);
    expect(pendenciasDoRodizio('2026-11-23', quatro)).toEqual([
      'G1, semana 4: marque 2 dias.',
      'G2, semana 4: marque 2 dias.',
      'G3, semana 4: marque 2 dias.',
    ]);
  });

  it('a data de início precisa ser uma segunda-feira', () => {
    expect(pendenciasDoRodizio(null, PADRAO_5X2)).toEqual([
      'Informe a data de início (dd/mm/aaaa).',
    ]);
    expect(pendenciasDoRodizio('2026-11-22', PADRAO_5X2)).toEqual([
      'A data de início precisa ser uma segunda-feira.',
    ]);
  });
});
