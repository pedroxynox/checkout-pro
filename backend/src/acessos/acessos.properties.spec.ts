import * as fc from 'fast-check';
import {
  CredencialUsuario,
  FUNCIONALIDADES_FISCAL,
  FUNCIONALIDADES_GERENTE,
  Perfil,
  decidirAutenticacao,
  decidirAutorizacao,
  loginDisponivelEntre,
  loginsSaoUnicos,
} from './acessos.domain';

/**
 * Testes de propriedade (fast-check) do Modulo_Acessos.
 *
 * Cada teste implementa uma única propriedade de correção do design e executa
 * no mínimo 100 iterações. As decisões puras (autenticação, autorização e
 * unicidade de login) são exercitadas sem banco de dados.
 */

const NUM_RUNS = 100;

const perfilArb: fc.Arbitrary<Perfil> = fc.constantFrom(
  'GERENTE',
  'ADMINISTRADOR',
  'FISCAL',
);

// Gera um conjunto de usuários com logins necessariamente únicos.
const usuariosArb: fc.Arbitrary<CredencialUsuario[]> = fc
  .uniqueArray(
    fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.trim() !== ''),
    { minLength: 0, maxLength: 8 },
  )
  .chain((logins) =>
    fc.tuple(
      ...logins.map((login) =>
        fc.record({
          login: fc.constant(login),
          senha: fc.string({ minLength: 1, maxLength: 12 }),
          perfil: perfilArb,
        }),
      ),
    ),
  );

// Universo de funcionalidades incluindo as operacionais (fiscal) e algumas
// restritas ao gerente, para exercitar ambos os ramos da autorização.
const funcionalidadeArb: fc.Arbitrary<string> = fc.constantFrom(
  ...FUNCIONALIDADES_FISCAL,
  'OPERADORES_CRUD',
  'AUSENCIAS_GERENCIAR',
  'ACESSOS_GERENCIAR',
  'ESCALA_CADASTRAR',
  'METAS_CONFIGURAR',
  'FUNCIONALIDADE_DESCONHECIDA',
);

describe('Modulo_Acessos — testes de propriedade', () => {
  // Feature: gestao-frente-de-caixa, Property 28: Autenticação concede ou nega conforme credenciais
  // Validates: Requirements 7.1.2, 7.1.3
  it('Property 28: concede com o perfil associado se e somente se as credenciais correspondem a um usuário cadastrado', () => {
    fc.assert(
      fc.property(
        usuariosArb,
        // sorteia entre uma credencial existente (deve conceder) ou arbitrária
        fc.boolean(),
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.nat(),
        (usuarios, usarExistente, loginRand, senhaRand, idx) => {
          let login = loginRand;
          let senha = senhaRand;
          if (usarExistente && usuarios.length > 0) {
            const alvo = usuarios[idx % usuarios.length];
            login = alvo.login;
            senha = alvo.senha;
          }

          const esperadoMatch = usuarios.find(
            (u) => u.login === login && u.senha === senha,
          );
          const resultado = decidirAutenticacao(usuarios, login, senha);

          if (esperadoMatch) {
            return (
              resultado.concedido === true &&
              resultado.perfil === esperadoMatch.perfil
            );
          }
          return resultado.concedido === false;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 29: Autorização por perfil
  // Validates: Requirements 7.2.2, 7.2.3, 7.2.4
  it('Property 29: desenvolvedor sempre autorizado; gerente conforme seu conjunto; fiscal sse operacional', () => {
    const operacionais = new Set<string>(FUNCIONALIDADES_FISCAL);
    const deGerente = new Set<string>(FUNCIONALIDADES_GERENTE);
    fc.assert(
      fc.property(perfilArb, funcionalidadeArb, (perfil, funcionalidade) => {
        const autorizado = decidirAutorizacao(perfil, funcionalidade);
        if (perfil === 'ADMINISTRADOR') {
          return autorizado === true;
        }
        if (perfil === 'GERENTE') {
          return autorizado === deGerente.has(funcionalidade);
        }
        return autorizado === operacionais.has(funcionalidade);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 31: Unicidade e exclusividade de login
  // Validates: Requirements 7.1.4, 7.1.6
  it('Property 31: logins são únicos e cada usuário autentica apenas com o seu próprio login', () => {
    fc.assert(
      fc.property(usuariosArb, (usuarios) => {
        const logins = usuarios.map((u) => u.login);

        // Unicidade: nenhum login compartilhado entre usuários distintos.
        if (!loginsSaoUnicos(logins)) {
          return false;
        }

        // Exclusividade: cada usuário autentica com o seu próprio login e
        // recebe o seu próprio perfil.
        for (const u of usuarios) {
          const r = decidirAutenticacao(usuarios, u.login, u.senha);
          if (!(r.concedido === true && r.perfil === u.perfil)) {
            return false;
          }
          // O login já está em uso, logo não está disponível.
          if (loginDisponivelEntre(logins, u.login) !== false) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
