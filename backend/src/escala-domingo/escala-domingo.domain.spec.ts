import {
  GrupoDomingo,
  ehDomingo,
  ehGrupoValido,
  grupoFolgaNoDomingo,
  ordemValida,
  proximoDomingo,
  proximosDomingos,
  trabalhaNoDomingo,
} from './escala-domingo.domain';

// Domingos de referência (todos são domingo em UTC).
const DOM1 = new Date('2026-07-19T00:00:00.000Z'); // domingo
const DOM2 = new Date('2026-07-26T00:00:00.000Z');
const DOM3 = new Date('2026-08-02T00:00:00.000Z');
const DOM4 = new Date('2026-08-09T00:00:00.000Z');

// Ordem real do usuário: 19/07 folga S1, 26/07 folga S3, 02/08 folga S2.
const ORDEM: GrupoDomingo[] = ['G1', 'G3', 'G2'];

describe('rodízio de domingo', () => {
  it('reconhece domingo e grupos válidos', () => {
    expect(ehDomingo(DOM1)).toBe(true);
    expect(ehDomingo(new Date('2026-07-20T00:00:00.000Z'))).toBe(false); // segunda
    expect(ehGrupoValido('G1')).toBe(true);
    expect(ehGrupoValido('G4')).toBe(false);
    expect(ehGrupoValido(null)).toBe(false);
  });

  it('valida a ordem do ciclo (permutação dos 3 grupos)', () => {
    expect(ordemValida(['G1', 'G3', 'G2'])).toBe(true);
    expect(ordemValida(['G1', 'G2', 'G3'])).toBe(true);
    expect(ordemValida(['G1', 'G1', 'G2'])).toBe(false); // repetido
    expect(ordemValida(['G1', 'G2'])).toBe(false); // faltando
    expect(ordemValida(null)).toBe(false);
  });

  it('segue exatamente a ordem informada e repete a cada 3 domingos', () => {
    expect(grupoFolgaNoDomingo(DOM1, DOM1, ORDEM)).toBe('G1');
    expect(grupoFolgaNoDomingo(DOM2, DOM1, ORDEM)).toBe('G3');
    expect(grupoFolgaNoDomingo(DOM3, DOM1, ORDEM)).toBe('G2');
    expect(grupoFolgaNoDomingo(DOM4, DOM1, ORDEM)).toBe('G1'); // repete o ciclo
  });

  it('funciona para domingos anteriores à referência', () => {
    // Domingo antes de DOM1 (12/07) deve ser o 3º do ciclo anterior → G2.
    const anterior = new Date('2026-07-12T00:00:00.000Z');
    expect(grupoFolgaNoDomingo(anterior, DOM1, ORDEM)).toBe('G2');
  });

  it('trabalha no domingo quando o grupo NÃO é o que folga', () => {
    // DOM2 folga G3 → G1 e G2 trabalham; G3 folga.
    expect(trabalhaNoDomingo('G3', DOM2, DOM1, ORDEM)).toBe(false);
    expect(trabalhaNoDomingo('G1', DOM2, DOM1, ORDEM)).toBe(true);
    expect(trabalhaNoDomingo('G2', DOM2, DOM1, ORDEM)).toBe(true);
  });

  it('sem grupo (fora do rodízio) nunca trabalha aos domingos', () => {
    expect(trabalhaNoDomingo(null, DOM2, DOM1, ORDEM)).toBe(false);
    expect(trabalhaNoDomingo(undefined, DOM2, DOM1, ORDEM)).toBe(false);
    expect(trabalhaNoDomingo('', DOM2, DOM1, ORDEM)).toBe(false);
  });

  it('cada grupo folga 1 domingo e trabalha 2 num ciclo de 3', () => {
    const domingos = [DOM1, DOM2, DOM3];
    for (const g of ['G1', 'G2', 'G3'] as const) {
      const folgas = domingos.filter(
        (d) => !trabalhaNoDomingo(g, d, DOM1, ORDEM),
      ).length;
      expect(folgas).toBe(1);
    }
  });

  it('calcula o próximo domingo e a sequência', () => {
    const qua = new Date('2026-07-22T00:00:00.000Z'); // quarta
    expect(proximoDomingo(qua).toISOString().slice(0, 10)).toBe('2026-07-26');
    expect(proximoDomingo(DOM1).toISOString().slice(0, 10)).toBe('2026-07-19');

    const seq = proximosDomingos(DOM1, 3).map((d) =>
      d.toISOString().slice(0, 10),
    );
    expect(seq).toEqual(['2026-07-19', '2026-07-26', '2026-08-02']);
  });
});
