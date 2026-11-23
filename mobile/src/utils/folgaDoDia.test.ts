import {
  gruposFolgaDoDia,
  gruposQueTrabalham,
  rotuloFolga,
} from './folgaDoDia';

describe('folga do dia (aba Escalas)', () => {
  it('usa os grupos do dia; com backend antigo, só o domingo', () => {
    expect(
      gruposFolgaDoDia({ gruposFolga: ['G2'], grupoFolgaDomingo: null }),
    ).toEqual(['G2']);
    expect(
      gruposFolgaDoDia({ gruposFolga: [], grupoFolgaDomingo: 'G1' }),
    ).toEqual([]);
    expect(gruposFolgaDoDia({ grupoFolgaDomingo: 'G3' })).toEqual(['G3']);
    expect(gruposFolgaDoDia({ grupoFolgaDomingo: null })).toEqual([]);
    expect(gruposFolgaDoDia(null)).toEqual([]);
  });

  it('diz quem trabalha', () => {
    expect(gruposQueTrabalham(['G1'])).toBe('G2 e G3');
    expect(gruposQueTrabalham([])).toBe('G1 e G2 e G3');
  });

  it('rótulo da folga: grupo, fixa ou a do 6x1', () => {
    expect(rotuloFolga({ motivoFolga: 'GRUPO', grupoFolga: 'G1' })).toBe(
      'Folga · G1',
    );
    expect(rotuloFolga({ motivoFolga: 'FOLGA_FIXA', grupoFolga: null })).toBe(
      'Folga fixa',
    );
    expect(rotuloFolga({ motivoFolga: null, grupoFolga: null })).toBe('Folga');
    expect(rotuloFolga({})).toBe('Folga');
  });
});
