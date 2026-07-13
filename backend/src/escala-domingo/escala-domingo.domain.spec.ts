import {
  ehDomingo,
  ehGrupoValido,
  grupoFolgaNoDomingo,
  proximoDomingo,
  proximosDomingos,
  trabalhaNoDomingo,
} from './escala-domingo.domain';

// Domingos de referência (todos são domingo em UTC).
const DOM1 = new Date('2026-07-05T00:00:00.000Z'); // domingo
const DOM2 = new Date('2026-07-12T00:00:00.000Z');
const DOM3 = new Date('2026-07-19T00:00:00.000Z');
const DOM4 = new Date('2026-07-26T00:00:00.000Z');

describe('rodízio de domingo', () => {
  it('reconhece domingo e grupos válidos', () => {
    expect(ehDomingo(DOM1)).toBe(true);
    expect(ehDomingo(new Date('2026-07-06T00:00:00.000Z'))).toBe(false); // segunda
    expect(ehGrupoValido('G1')).toBe(true);
    expect(ehGrupoValido('G4')).toBe(false);
    expect(ehGrupoValido(null)).toBe(false);
  });

  it('roda G1→G2→G3 a cada domingo a partir da âncora', () => {
    // Âncora: no DOM1 folga G1.
    expect(grupoFolgaNoDomingo(DOM1, DOM1, 'G1')).toBe('G1');
    expect(grupoFolgaNoDomingo(DOM2, DOM1, 'G1')).toBe('G2');
    expect(grupoFolgaNoDomingo(DOM3, DOM1, 'G1')).toBe('G3');
    expect(grupoFolgaNoDomingo(DOM4, DOM1, 'G1')).toBe('G1'); // volta
  });

  it('funciona com âncora em outro grupo e para trás', () => {
    // Âncora: no DOM3 folga G2.
    expect(grupoFolgaNoDomingo(DOM3, DOM3, 'G2')).toBe('G2');
    expect(grupoFolgaNoDomingo(DOM4, DOM3, 'G2')).toBe('G3');
    // Domingo anterior à âncora.
    expect(grupoFolgaNoDomingo(DOM2, DOM3, 'G2')).toBe('G1');
    expect(grupoFolgaNoDomingo(DOM1, DOM3, 'G2')).toBe('G3');
  });

  it('trabalha no domingo quando o grupo NÃO é o que folga', () => {
    // DOM1 folga G1 → G2 e G3 trabalham; G1 folga.
    expect(trabalhaNoDomingo('G1', DOM1, DOM1, 'G1')).toBe(false);
    expect(trabalhaNoDomingo('G2', DOM1, DOM1, 'G1')).toBe(true);
    expect(trabalhaNoDomingo('G3', DOM1, DOM1, 'G1')).toBe(true);
  });

  it('sem grupo (fora do rodízio) nunca trabalha aos domingos', () => {
    expect(trabalhaNoDomingo(null, DOM2, DOM1, 'G1')).toBe(false);
    expect(trabalhaNoDomingo(undefined, DOM2, DOM1, 'G1')).toBe(false);
    expect(trabalhaNoDomingo('', DOM2, DOM1, 'G1')).toBe(false);
  });

  it('cada grupo folga 1 domingo e trabalha 2 num ciclo de 3', () => {
    const domingos = [DOM1, DOM2, DOM3];
    for (const g of ['G1', 'G2', 'G3'] as const) {
      const folgas = domingos.filter(
        (d) => !trabalhaNoDomingo(g, d, DOM1, 'G1'),
      ).length;
      expect(folgas).toBe(1);
    }
  });

  it('calcula o próximo domingo e a sequência', () => {
    // Uma quarta-feira → próximo domingo.
    const qua = new Date('2026-07-08T00:00:00.000Z');
    expect(proximoDomingo(qua).toISOString().slice(0, 10)).toBe('2026-07-12');
    // Se já é domingo, retorna o próprio dia.
    expect(proximoDomingo(DOM1).toISOString().slice(0, 10)).toBe('2026-07-05');

    const seq = proximosDomingos(DOM1, 3).map((d) =>
      d.toISOString().slice(0, 10),
    );
    expect(seq).toEqual(['2026-07-05', '2026-07-12', '2026-07-19']);
  });
});
