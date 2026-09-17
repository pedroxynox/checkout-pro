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
import { dataDeReferencia, turnoDoDia } from './turno-fiscal';

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

  it('dia encerrado não estende o último estado aberto até meia-noite', () => {
    const inicio = new Date('2025-06-02T07:00:00.000Z');
    const fimDoDia = new Date('2025-06-03T00:00:00.000Z');
    const jornada = calcularJornada(
      [{ status: 'DISPONIVEL', em: inicio }],
      fimDoDia,
      true,
    );

    expect(jornada.tempoTrabalhandoMs).toBe(0);
    expect(jornada.tempoIntervaloMs).toBe(0);
  });

  /**
   * Property 20: o turno cobrado sai SEMPRE da ficha.
   *
   * Esta propriedade substitui duas anteriores, e a troca resume a ADR 0026. A
   * primeira afirmava que uma exceção de horário vencia a regra geral (etapa 1
   * apagou as exceções). A segunda afirmava que a correção "nunca devolve uma
   * hora mais cedo do que a escala cobrava antes" — o viés conservador que
   * permitiu trocar a fonte sem criar faltas de surpresa, e que a etapa 2
   * remove de propósito, porque era ele que mantinha invisível o atraso de quem
   * tinha a cópia semanal mais tardia que a ficha.
   *
   * O que garantimos agora é mais forte e mais simples: o horário devolvido é
   * um dos horários **da própria ficha**, ou nada. Nenhuma terceira fonte pode
   * se infiltrar na hora que o sistema cobra de uma pessoa.
   */
  it('Property 20: o turno de um dia é sempre um horário da própria ficha (ou nenhum)', () => {
    const horarioArb = fc.constantFrom(
      '06:00',
      '08:00',
      '10:30',
      '13:00',
      '14:00',
    );
    const fichaArb = fc.record({
      folgaDiaSemana: fc.option(fc.integer({ min: 0, max: 6 }), { nil: null }),
      grupoDomingo: fc.constantFrom(null, 'G1', 'G2', 'G3'),
      entradaSemana: fc.option(horarioArb, { nil: null }),
      saidaSemana: fc.option(horarioArb, { nil: null }),
      entradaFds: fc.option(horarioArb, { nil: null }),
      saidaFds: fc.option(horarioArb, { nil: null }),
      entradaDom: fc.option(horarioArb, { nil: null }),
      saidaDom: fc.option(horarioArb, { nil: null }),
    });

    fc.assert(
      fc.property(
        fichaArb,
        fc.integer({ min: 0, max: 6 }),
        fc.boolean(),
        (ficha, diaSemana, ehFeriado) => {
          const turno = turnoDoDia(
            ficha,
            dataDeReferencia(diaSemana),
            { data: dataDeReferencia(0), ordem: ['G1', 'G2', 'G3'] },
            ehFeriado,
          );
          const daFicha = [
            ficha.entradaSemana,
            ficha.entradaFds,
            ficha.entradaDom,
            null,
          ];
          return daFicha.includes(turno.entrada);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
