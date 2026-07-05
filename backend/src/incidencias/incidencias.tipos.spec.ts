import {
  META_TIPO_INCIDENCIA,
  TIPOS_DISCIPLINARES,
  TIPOS_INCIDENCIA,
  TIPOS_PERFIL,
  rotuloTipoIncidencia,
} from './incidencias.domain';

/**
 * Testes dos metadados dos tipos de incidência (ADR 0010/0011). Garantem que o
 * catálogo genérico por `tipo` fica coeso: todo tipo tem metadados, os
 * disciplinares derivam do mapa, o não-retorno é o único auto-detectável e os
 * tipos do perfil (advertência/suspensão) derivam do local de registro.
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

  it('inclui os tipos conhecidos (incl. advertência e suspensão)', () => {
    expect(TIPOS_INCIDENCIA).toEqual(
      expect.arrayContaining([
        'NAO_RETORNO_INTERVALO',
        'ATRASO',
        'SAIDA_ANTECIPADA',
        'RETORNO_TARDIO',
        'ADVERTENCIA',
        'SUSPENSAO',
      ]),
    );
  });

  it('TIPOS_PERFIL são exatamente os lançados no perfil (advertência, suspensão)', () => {
    expect([...TIPOS_PERFIL]).toEqual(['ADVERTENCIA', 'SUSPENSAO']);
    for (const t of TIPOS_PERFIL) {
      expect(META_TIPO_INCIDENCIA[t].registro).toBe('PERFIL');
    }
  });

  it('o não-retorno é registrado na Escala; atraso/saída/retorno tardio são legado', () => {
    expect(META_TIPO_INCIDENCIA.NAO_RETORNO_INTERVALO.registro).toBe('ESCALA');
    expect(META_TIPO_INCIDENCIA.ATRASO.registro).toBeNull();
    expect(META_TIPO_INCIDENCIA.SAIDA_ANTECIPADA.registro).toBeNull();
    expect(META_TIPO_INCIDENCIA.RETORNO_TARDIO.registro).toBeNull();
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

  it('advertência, suspensão e não-retorno não usam horários', () => {
    expect(META_TIPO_INCIDENCIA.ADVERTENCIA.usaHorarios).toBe(false);
    expect(META_TIPO_INCIDENCIA.SUSPENSAO.usaHorarios).toBe(false);
    expect(META_TIPO_INCIDENCIA.NAO_RETORNO_INTERVALO.usaHorarios).toBe(false);
  });
});
