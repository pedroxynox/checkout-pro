import * as fc from 'fast-check';
import {
  IncidenciaRegistro,
  TransicaoPonto,
  analisarIncidencias,
  derivarHoraEsperadaRetorno,
  detectarNaoRetorno,
  timelineUnificada,
} from './incidencias.domain';

/**
 * Testes de propriedade (fast-check) das Incidências de Escala.
 *
 * Cada teste implementa uma única propriedade nomeada do design e executa no
 * mínimo 100 iterações. As decisões puras (derivação de horário, detecção de
 * não retorno, analítica e linha do tempo) são exercitadas sem banco de dados.
 */

const NUM_RUNS = 100;

// Horário "HH:mm" válido (00:00–23:59).
const horarioArb: fc.Arbitrary<string> = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(
    ([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
  );

// Data (meia-noite UTC) dentro de uma janela ampla.
const dataArb: fc.Arbitrary<Date> = fc
  .integer({ min: 0, max: 400 })
  .map((dias) => new Date(Date.UTC(2024, 0, 1) + dias * 24 * 60 * 60 * 1000));

const statusArb: fc.Arbitrary<TransicaoPonto['status']> = fc.constantFrom(
  'DISPONIVEL',
  'INTERVALO',
  'FORA_EXPEDIENTE',
);

describe('Incidências de Escala — testes de propriedade', () => {
  // Feature: incidencias-escala, Property 1: derivarHoraEsperadaRetorno é
  // monotônica, permanece num relógio válido e coincide com o cálculo manual.
  // Validates: Requirements 1
  it('Property 1: horário esperado = min(saída+intervalo, 23:59), válido e monotônico', () => {
    fc.assert(
      fc.property(
        horarioArb,
        fc.integer({ min: 0, max: 600 }),
        fc.integer({ min: 0, max: 600 }),
        (horaSaida, i1, i2) => {
          const [h, m] = horaSaida.split(':').map(Number);
          const base = h * 60 + m;

          const r1 = derivarHoraEsperadaRetorno(horaSaida, i1);
          const r2 = derivarHoraEsperadaRetorno(horaSaida, i2);

          // (1) Coincide com o cálculo manual (limitado a 23:59).
          const esperadoMin = Math.min(base + i1, 23 * 60 + 59);
          const eh = Math.floor(esperadoMin / 60);
          const em = esperadoMin % 60;
          const esperado = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
          if (r1 !== esperado) return false;

          // (2) Relógio válido (HH:mm, 00:00–23:59).
          if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r1)) return false;

          // (3) Monotônico: intervalo maior => horário >= (lexicográfico serve
          // pois ambos têm o mesmo formato HH:mm).
          if (i1 <= i2 && r1 > r2) return false;
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: incidencias-escala, Property 2: detectarNaoRetorno retorna
  // não-nulo se e somente se existe um INTERVALO sem DISPONIVEL posterior antes
  // do fim (ou do próximo FORA_EXPEDIENTE).
  // Validates: Requirements 1
  it('Property 2: detecta não retorno sse e somente se há intervalo sem retorno', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ status: statusArb, hhmm: horarioArb }), {
          minLength: 0,
          maxLength: 12,
        }),
        fc.integer({ min: 0, max: 120 }),
        (transicoes: TransicaoPonto[], intervaloMin) => {
          // Oráculo de referência: existe INTERVALO sem DISPONIVEL antes de um
          // FORA_EXPEDIENTE ou do fim do log.
          let esperaNaoNulo = false;
          for (let i = 0; i < transicoes.length; i++) {
            if (transicoes[i].status !== 'INTERVALO') continue;
            let voltou = false;
            for (let j = i + 1; j < transicoes.length; j++) {
              if (transicoes[j].status === 'DISPONIVEL') {
                voltou = true;
                break;
              }
              if (transicoes[j].status === 'FORA_EXPEDIENTE') break;
            }
            if (!voltou) {
              esperaNaoNulo = true;
              break;
            }
          }

          const resultado = detectarNaoRetorno(transicoes, intervaloMin);
          return esperaNaoNulo === (resultado !== null);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: incidencias-escala, Property 3: analisarIncidencias particiona
  // corretamente (porTipo soma total; percentual em [0,100]; porDiaSemana soma
  // total).
  // Validates: Requirements 3
  it('Property 3: analítica particiona por tipo/dia e percentual fica em [0,100]', () => {
    const incidenciaArb: fc.Arbitrary<IncidenciaRegistro> = fc.record({
      tipo: fc.constant('NAO_RETORNO_INTERVALO' as const),
      data: dataArb,
    });
    fc.assert(
      fc.property(
        fc.array(incidenciaArb, { minLength: 0, maxLength: 40 }),
        fc.integer({ min: 0, max: 120 }),
        (incidencias, diasEscalados) => {
          const a = analisarIncidencias(incidencias, diasEscalados, new Date());

          // (1) porTipo soma ao total.
          const somaTipos = Object.values(a.porTipo).reduce((s, v) => s + v, 0);
          if (somaTipos !== a.total) return false;

          // (2) porDiaSemana soma ao total.
          const somaDias = a.porDiaSemana.reduce((s, v) => s + v, 0);
          if (somaDias !== a.total) return false;

          // (3) percentual sobre escalados em [0,100].
          if (
            a.percentualSobreEscalados < 0 ||
            a.percentualSobreEscalados > 100
          ) {
            return false;
          }

          // (4) total coincide com a contagem de incidências.
          return a.total === incidencias.length;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: incidencias-escala, Property 4: timelineUnificada é totalmente
  // ordenada de forma decrescente e preserva a contagem (= faltas + incidências).
  // Validates: Requirements 4
  it('Property 4: linha do tempo unificada é decrescente e preserva a contagem', () => {
    const incidenciaArb: fc.Arbitrary<IncidenciaRegistro> = fc.record({
      tipo: fc.constant('NAO_RETORNO_INTERVALO' as const),
      data: dataArb,
    });
    fc.assert(
      fc.property(
        fc.array(fc.record({ data: dataArb }), { minLength: 0, maxLength: 30 }),
        fc.array(incidenciaArb, { minLength: 0, maxLength: 30 }),
        (ausencias, incidencias) => {
          const tl = timelineUnificada(ausencias, incidencias);

          // (1) Preserva a contagem total.
          if (tl.length !== ausencias.length + incidencias.length) {
            return false;
          }

          // (2) Ordenação decrescente por data.
          for (let i = 1; i < tl.length; i++) {
            if (tl[i - 1].data.getTime() < tl[i].data.getTime()) {
              return false;
            }
          }
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
