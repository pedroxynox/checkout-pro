import * as fc from 'fast-check';
import {
  UsuarioRef,
  destinatariosAlertaChecklist,
  montarEntregas,
} from './notificacoes.domain';

/**
 * Testes de propriedade (fast-check) do serviço transversal de Notificações.
 *
 * Cada teste implementa uma única propriedade de correção do design e executa
 * no mínimo 100 iterações. As decisões puras (alvos do alerta e entrega em
 * dois canais) são exercitadas sem banco de dados.
 */

const NUM_RUNS = 100;

const usuarioArb: fc.Arbitrary<UsuarioRef> = fc
  .integer({ min: 1, max: 50 })
  .map((n) => ({ id: `u${n}` }));

describe('Notificações — testes de propriedade', () => {
  // Feature: gestao-frente-de-caixa, Property 24: Destinatários do alerta de checklist
  // Validates: Requirements 5.3.3, 5.3.4
  it('Property 24: destinatários = união(fiscais online, login gerencial), com gerencial sempre presente', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(usuarioArb, { selector: (u) => u.id, maxLength: 20 }),
        fc.array(usuarioArb, { minLength: 1, maxLength: 5 }),
        (fiscaisOnline, gerenciais) => {
          const destinatarios = destinatariosAlertaChecklist(
            fiscaisOnline,
            gerenciais,
          );
          const ids = new Set(destinatarios.map((u) => u.id));

          // O conjunto é exatamente a união dos dois conjuntos de ids.
          const idsEsperados = new Set<string>([
            ...fiscaisOnline.map((u) => u.id),
            ...gerenciais.map((u) => u.id),
          ]);
          if (ids.size !== idsEsperados.size) {
            return false;
          }
          for (const id of idsEsperados) {
            if (!ids.has(id)) {
              return false;
            }
          }

          // O login gerencial está sempre presente.
          for (const g of gerenciais) {
            if (!ids.has(g.id)) {
              return false;
            }
          }

          // Sem duplicatas.
          return ids.size === destinatarios.length;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 30: Notificação entregue pelos dois canais
  // Validates: Requirements 7.3.2
  it('Property 30: cada destinatário recebe a entrega por push e por in-app', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(usuarioArb, { selector: (u) => u.id, maxLength: 30 }),
        fc.record({
          titulo: fc.string({ maxLength: 40 }),
          mensagem: fc.string({ maxLength: 120 }),
        }),
        (destinatarios, conteudo) => {
          const entregas = montarEntregas(destinatarios, conteudo);

          // Uma entrega por destinatário.
          if (entregas.length !== destinatarios.length) {
            return false;
          }
          // Cada entrega usa os dois canais.
          for (const e of entregas) {
            if (e.canalPush !== true || e.canalInApp !== true) {
              return false;
            }
          }
          // Cobertura exata dos destinatários.
          const idsEntrega = new Set(entregas.map((e) => e.usuarioId));
          return destinatarios.every((u) => idsEntrega.has(u.id));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
