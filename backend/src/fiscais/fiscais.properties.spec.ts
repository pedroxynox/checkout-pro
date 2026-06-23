import * as fc from 'fast-check';
import {
  RegistroPonto,
  STATUS_FISCAIS,
  StatusFiscal,
  calcularJornada,
  mensagemTransicao,
  statusAtual,
  statusValido,
} from './fiscais.domain';
import { EscalaEntry, resolverEscalaEfetiva } from './escala.domain';

/**
 * Testes de propriedade (fast-check) do Modulo_Fiscais (controle de jornada) e
 * da escala. Cada teste roda ao menos 100 iterações sobre as decisões puras
 * (status atual, mensagem de transição, cálculo de jornada e escala efetiva),
 * sem banco de dados.
 */

const NUM_RUNS = 100;

const statusArb: fc.Arbitrary<StatusFiscal> = fc.constantFrom(
  ...STATUS_FISCAIS,
);

const dataArb: fc.Arbitrary<Date> = fc
  .integer({ min: 0, max: 1_000_000 })
  .map((ms) => new Date(Date.UTC(2024, 0, 1) + ms * 1000));

describe('Fiscais e Escala — testes de propriedade', () => {
  // Property 17: status atual reflete a última transição (maior instante).
  it('Property 17: status atual = última transição e pertence ao conjunto válido', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ status: statusArb, em: dataArb }), {
          minLength: 1,
          maxLength: 30,
        }),
        (registros: RegistroPonto[]) => {
          const atual = statusAtual(registros);
          if (atual === null || !statusValido(atual)) {
            return false;
          }
          const maxEm = Math.max(...registros.map((r) => r.em.getTime()));
          let esperado: StatusFiscal | null = null;
          for (const r of registros) {
            if (r.em.getTime() === maxEm) {
              esperado = r.status;
            }
          }
          return atual === esperado;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 18: há mensagem para os gestores em toda mudança; nenhuma quando
  // o status não muda.
  it('Property 18: mensagem de transição existe na mudança e é nula sem mudança', () => {
    fc.assert(
      fc.property(
        fc.option(statusArb, { nil: null }),
        statusArb,
        fc.string(),
        (anterior: StatusFiscal | null, novo: StatusFiscal, nome: string) => {
          const msg = mensagemTransicao(nome, anterior, novo);
          if (anterior === novo) {
            return msg === null;
          }
          return typeof msg === 'string' && msg.length > 0;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 19: carga horária = tempo trabalhando (sem intervalo); tempos >= 0.
  // Ver a definição de `Jornada.cargaHorariaMs` no domínio: a carga horária é o
  // tempo somado em DISPONIVEL, sem contar o intervalo.
  it('Property 19: carga horária = tempo trabalhando (sem intervalo), e tempos não-negativos', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ status: statusArb, em: dataArb }), {
          minLength: 0,
          maxLength: 30,
        }),
        dataArb,
        (registros: RegistroPonto[], agora: Date) => {
          const j = calcularJornada(registros, agora);
          return (
            j.tempoTrabalhandoMs >= 0 &&
            j.tempoIntervaloMs >= 0 &&
            j.cargaHorariaMs === j.tempoTrabalhandoMs
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 20: Horário especial prevalece sobre a regra geral (Req 4.3.5).
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
            return efetiva === especial;
          }
          if (especial && especial.folga) {
            return efetiva === 'FOLGA';
          }
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
