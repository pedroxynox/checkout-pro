import * as fc from 'fast-check';
import {
  AlteracaoStatus,
  STATUS_FISCAIS,
  StatusFiscal,
  podeCheckIn,
  realizarCheckIn,
  realizarCheckOut,
  statusValido,
  ultimoStatus,
} from './fiscais.domain';
import { EscalaEntry, resolverEscalaEfetiva } from './escala.domain';

/**
 * Testes de propriedade (fast-check) do Modulo_Fiscais e da escala.
 *
 * Cada teste implementa uma única propriedade de correção do design e executa
 * no mínimo 100 iterações. As decisões puras (status, check-in/out, escala
 * efetiva) são exercitadas sem banco de dados.
 */

const NUM_RUNS = 100;

const statusArb: fc.Arbitrary<StatusFiscal> = fc.constantFrom(
  ...STATUS_FISCAIS,
);

const dataArb: fc.Arbitrary<Date> = fc
  .integer({ min: 0, max: 1_000_000 })
  .map((ms) => new Date(Date.UTC(2024, 0, 1) + ms * 1000));

describe('Fiscais e Escala — testes de propriedade', () => {
  // Feature: gestao-frente-de-caixa, Property 17: Status do fiscal reflete a última alteração
  // Validates: Requirements 4.1.1, 4.1.2
  it('Property 17: status exibido = última alteração definida e pertence ao conjunto válido', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ status: statusArb, em: dataArb }), {
          minLength: 1,
          maxLength: 30,
        }),
        (alteracoes: AlteracaoStatus[]) => {
          const exibido = ultimoStatus(alteracoes);
          if (exibido === null) {
            return false;
          }
          // Pertence ao conjunto válido.
          if (!statusValido(exibido)) {
            return false;
          }
          // É o status da alteração de maior instante (empate -> última na ordem).
          const maxEm = Math.max(...alteracoes.map((a) => a.em.getTime()));
          // Última alteração (na ordem) cujo instante é o máximo.
          let esperado: StatusFiscal | null = null;
          for (const a of alteracoes) {
            if (a.em.getTime() === maxEm) {
              esperado = a.status;
            }
          }
          return exibido === esperado;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 18: Transições de check-in e check-out
  // Validates: Requirements 4.2.1, 4.2.2
  it('Property 18: check-in deixa status DISPONIVEL e sessão ativa; check-out marca saída', () => {
    fc.assert(
      fc.property(dataArb, dataArb, (entrada, saida) => {
        const sessao = realizarCheckIn(entrada);
        const checkInOk =
          sessao.ativa === true &&
          sessao.status === 'DISPONIVEL' &&
          sessao.checkIn.getTime() === entrada.getTime() &&
          sessao.checkOut === null;

        const fechada = realizarCheckOut(sessao, saida);
        const checkOutOk =
          fechada.ativa === false &&
          fechada.checkOut !== null &&
          fechada.checkOut.getTime() === saida.getTime() &&
          // A sessão original não é mutada.
          sessao.ativa === true &&
          sessao.checkOut === null;

        return checkInOk && checkOutOk;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 19: Check-in duplicado é rejeitado
  // Validates: Requirements 4.2.3
  it('Property 19: com sessão ativa, novo check-in é rejeitado e a sessão ativa permanece inalterada', () => {
    fc.assert(
      fc.property(dataArb, (entrada) => {
        const sessao = realizarCheckIn(entrada);
        // Há sessão ativa -> não pode realizar novo check-in.
        const permitido = podeCheckIn(sessao);
        return (
          permitido === false &&
          sessao.ativa === true &&
          sessao.checkIn.getTime() === entrada.getTime()
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 20: Horário especial prevalece sobre a regra geral
  // Validates: Requirements 4.3.5
  it('Property 20: existindo horário especial no dia, a escala efetiva é o especial; senão, a regra geral (ou folga)', () => {
    const horarioArb = fc.constantFrom(
      '06:00',
      '08:00',
      '10:30',
      '13:00',
      '14:00',
    );
    const entryArb = (especial: boolean): fc.Arbitrary<EscalaEntry> =>
      fc.record({
        funcionarioId: fc.constant('func-1'),
        diaSemana: fc.integer({ min: 0, max: 6 }),
        entrada: horarioArb,
        saida: horarioArb,
        intervaloMin: fc.integer({ min: 0, max: 120 }),
        folga: fc.constant(false),
        especial: fc.constant(especial),
      });

    fc.assert(
      fc.property(
        fc.option(entryArb(false), { nil: null }),
        fc.option(entryArb(true), { nil: null }),
        (geral, especial) => {
          const efetiva = resolverEscalaEfetiva(geral, especial);
          if (especial && !especial.folga) {
            // Especial (não folga) prevalece.
            return efetiva === especial;
          }
          if (especial && especial.folga) {
            return efetiva === 'FOLGA';
          }
          // Sem especial: aplica a regra geral (ou folga).
          if (geral && !geral.folga) {
            return efetiva === geral;
          }
          return efetiva === 'FOLGA';
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
