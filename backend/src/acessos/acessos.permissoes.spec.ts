import {
  FUNCIONALIDADES_FISCAL,
  FUNCIONALIDADES_GERENTE,
  FUNCIONALIDADES_IMPORTADOR,
  FUNCIONALIDADES_SUPERVISOR,
  TODAS_FUNCIONALIDADES,
  decidirAutorizacao,
} from './acessos.domain';

/**
 * Testes-guarda das permissões. Garantem duas invariantes importantes da
 * "fonte única de verdade":
 *
 *  1. O perfil GERENTE_DESENVOLVEDOR enxerga **absolutamente tudo** — toda
 *     funcionalidade do catálogo, sem exceção.
 *  2. Toda funcionalidade liberada a qualquer perfil existe no catálogo
 *     `TODAS_FUNCIONALIDADES` (evita "permissão fantasma" digitada errado).
 */
describe('Permissões (fonte única de verdade)', () => {
  const catalogo = new Set<string>(TODAS_FUNCIONALIDADES);

  it('GERENTE_DESENVOLVEDOR enxerga absolutamente todas as funcionalidades', () => {
    for (const func of TODAS_FUNCIONALIDADES) {
      expect(decidirAutorizacao('GERENTE_DESENVOLVEDOR', func)).toBe(true);
    }
  });

  it('GERENTE_DESENVOLVEDOR continua autorizado mesmo para funcionalidade futura/desconhecida', () => {
    // Reforça que o acesso do desenvolvedor não depende de lista: qualquer
    // funcionalidade nova é liberada automaticamente.
    expect(decidirAutorizacao('GERENTE_DESENVOLVEDOR', 'FUNCIONALIDADE_NOVA')).toBe(
      true,
    );
  });

  it('todas as funcionalidades dos perfis existem no catálogo', () => {
    const listas = [
      FUNCIONALIDADES_FISCAL,
      FUNCIONALIDADES_SUPERVISOR,
      FUNCIONALIDADES_IMPORTADOR,
      FUNCIONALIDADES_GERENTE,
    ];
    for (const lista of listas) {
      for (const func of lista) {
        expect(catalogo.has(func)).toBe(true);
      }
    }
  });
});
