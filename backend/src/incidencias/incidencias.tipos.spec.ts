import {
  META_TIPO_INCIDENCIA,
  TIPOS_DISCIPLINARES,
  TIPOS_INCIDENCIA,
  rotuloTipoIncidencia,
} from './incidencias.domain';

/**
 * Testes dos metadados dos tipos de incidência (ADR 0010). Garantem que o
 * catálogo genérico por `tipo` fica coeso: todo tipo tem metadados, os
 * disciplinares derivam do mapa e o não-retorno é o único auto-detectável.
 */
describe('Tipos de incidência (metadados)', () => {
  it('todo tipo conhecido tem metadados com rótulo não vazio', () => {
    for (const tipo of TIPOS_INCIDENCIA) {
      const meta = META_TIPO_INCIDENCIA[tipo];
      expect(meta).toBeDefined();
      expect(typeof meta.rotulo).toBe('string');
      expect(meta.rotulo.length).toBeGreaterThan(0);
      expect(rotuloTipoIncidencia(tipo)).toBe(meta.rotulo);
    }
  });

  it('inclui os novos tipos (atraso, saída antecipada, retorno tardio, advertência)', () => {
    expect(TIPOS_INCIDENCIA).toEqual(
      expect.arrayContaining([
        'NAO_RETORNO_INTERVALO',
        'ATRASO',
        'SAIDA_ANTECIPADA',
        'RETORNO_TARDIO',
        'ADVERTENCIA',
      ]),
    );
  });

  it('TIPOS_DISCIPLINARES deriva exatamente dos tipos que penalizam disciplina', () => {
    const esperado = TIPOS_INCIDENCIA.filter(
      (t) => META_TIPO_INCIDENCIA[t].penalizaDisciplina,
    );
    expect([...TIPOS_DISCIPLINARES]).toEqual(esperado);
    // Hoje todos os tipos são disciplinares.
    expect(TIPOS_DISCIPLINARES.length).toBe(TIPOS_INCIDENCIA.length);
  });

  it('apenas o não-retorno do intervalo é auto-detectável do ponto', () => {
    const autoDetectaveis = TIPOS_INCIDENCIA.filter(
      (t) => META_TIPO_INCIDENCIA[t].autoDetectavel,
    );
    expect(autoDetectaveis).toEqual(['NAO_RETORNO_INTERVALO']);
  });

  it('a advertência não usa horários (os demais usam)', () => {
    expect(META_TIPO_INCIDENCIA.ADVERTENCIA.usaHorarios).toBe(false);
    expect(META_TIPO_INCIDENCIA.NAO_RETORNO_INTERVALO.usaHorarios).toBe(true);
    expect(META_TIPO_INCIDENCIA.ATRASO.usaHorarios).toBe(true);
  });
});
