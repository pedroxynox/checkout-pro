import * as fc from 'fast-check';
import {
  calcularScore,
  clamp,
  contarDiasEscalados,
  metaIndividualDerivada,
  notaAssiduidade,
  notaContribuicao,
  notaDisciplina,
  type EntradaScore,
} from './perfil-colaborador.domain';

/**
 * Testes de propriedade (fast-check) da feature **score-perfil-abrangente**.
 *
 * Cada teste implementa uma única propriedade de correção do design e executa
 * no mínimo 100 iterações sobre as funções **puras e determinísticas** do
 * domínio do Score de Saúde. Ao final há testes de exemplo/borda concretos.
 *
 * Constantes de calibração espelhadas do domínio (privadas ao módulo), usadas
 * apenas como referência independente nos testes:
 *   NEUTRA = 50, FATOR_CANCELAMENTO = 50, PENAL_POR_INCIDENCIA = 20.
 */
const NUM_RUNS = 200;
const NEUTRA_REF = 50;
const FATOR_CANCELAMENTO_REF = 50;
const PENAL_POR_INCIDENCIA_REF = 20;

// ---------------------------------------------------------------------------
// Arbitrários auxiliares
// ---------------------------------------------------------------------------

const naoNegativo = (max = 1_000_000): fc.Arbitrary<number> =>
  fc.double({ min: 0, max, noNaN: true, noDefaultInfinity: true });

const positivo = (max = 1_000_000): fc.Arbitrary<number> =>
  fc.double({
    min: Number.MIN_VALUE,
    max,
    noNaN: true,
    noDefaultInfinity: true,
  });

/** Meta individual do período: número positivo OU null (indefinida). */
const metaArb: fc.Arbitrary<number | null> = fc.option(positivo(), {
  nil: null,
});

const contribuicaoArb: fc.Arbitrary<EntradaScore['contribuicao']> = fc.record({
  aporteReal: naoNegativo(),
  metaIndividualPeriodo: metaArb,
});

const disciplinaArb: fc.Arbitrary<EntradaScore['disciplina']> = fc.record({
  cancelamentos: naoNegativo(10_000),
  linhaBaseCancelamentos: naoNegativo(10_000),
  incidenciasDisciplinares: fc.integer({ min: 0, max: 30 }),
});

const atividadeArb: fc.Arbitrary<EntradaScore['atividade']> = fc.record({
  valor: naoNegativo(10_000),
  media: naoNegativo(10_000),
});

const entradaScoreArb: fc.Arbitrary<EntradaScore> = fc.record({
  taxaFaltas: naoNegativo(200),
  contribuicao: fc.option(contribuicaoArb, { nil: undefined }),
  disciplina: fc.option(disciplinaArb, { nil: undefined }),
  atividade: fc.option(atividadeArb, { nil: undefined }),
});

const emFaixa = (n: number): boolean =>
  Number.isFinite(n) && n >= 0 && n <= 100;

describe('score-perfil-abrangente — testes de propriedade do domínio', () => {
  // Feature: score-perfil-abrangente, Property 1: Derivação da meta individual
  // Validates: Requirements 2.1, 2.2
  it('Property 1: meta individual derivada é exata, finita e estritamente positiva com insumos positivos', () => {
    fc.assert(
      fc.property(
        // Meta global mensal em faixa monetária realista (evita denormais que
        // sofreriam underflow para 0 na multiplicação — artefato de ponto
        // flutuante, não um insumo de domínio válido).
        fc.double({
          min: 0.01,
          max: 1_000_000,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 60 }),
        fc.integer({ min: 1, max: 31 }),
        (
          metaGlobalMensal,
          nOperadoresAtivos,
          diasEscaladosPeriodo,
          diasUteisMes,
        ) => {
          const r = metaIndividualDerivada({
            metaGlobalMensal,
            nOperadoresAtivos,
            diasEscaladosPeriodo,
            diasUteisMes,
          });
          const esperado =
            (metaGlobalMensal / nOperadoresAtivos) *
            (diasEscaladosPeriodo / diasUteisMes);
          return (
            r === esperado && Number.isFinite(r as number) && (r as number) > 0
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: score-perfil-abrangente, Property 2: Meta indefinida evita divisão por zero (sub-nota neutra)
  // Validates: Requirements 2.3
  it('Property 2: insumo não-positivo → meta null e contribuição neutra determinística (nunca NaN/Infinity)', () => {
    fc.assert(
      fc.property(
        fc.double({
          min: -1000,
          max: 1000,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        fc.double({
          min: -1000,
          max: 1000,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        fc.double({
          min: -1000,
          max: 1000,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        fc.double({
          min: -1000,
          max: 1000,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        naoNegativo(),
        (
          metaGlobalMensal,
          nOperadoresAtivos,
          diasEscaladosPeriodo,
          diasUteisMes,
          aporteReal,
        ) => {
          // Só nos interessam os casos com pelo menos um insumo não-positivo.
          fc.pre(
            metaGlobalMensal <= 0 ||
              nOperadoresAtivos <= 0 ||
              diasEscaladosPeriodo <= 0 ||
              diasUteisMes <= 0,
          );
          const meta = metaIndividualDerivada({
            metaGlobalMensal,
            nOperadoresAtivos,
            diasEscaladosPeriodo,
            diasUteisMes,
          });
          const nota = notaContribuicao(aporteReal, meta);
          return meta === null && nota === NEUTRA_REF && emFaixa(nota);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: score-perfil-abrangente, Property 3: Contagem de dias escalados
  // Validates: Requirements 2.5
  it('Property 3: conta exatamente os dias do intervalo cujo dia-da-semana difere da folga', () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date(Date.UTC(2020, 0, 1)),
          max: new Date(Date.UTC(2030, 11, 31)),
        }),
        fc.integer({ min: 0, max: 120 }),
        fc.integer({ min: 0, max: 6 }),
        (inicio, duracaoDias, folga) => {
          const fim = new Date(
            Date.UTC(
              inicio.getUTCFullYear(),
              inicio.getUTCMonth(),
              inicio.getUTCDate() + duracaoDias,
            ),
          );
          // Referência independente: percorre dia a dia contando dow != folga.
          let esperado = 0;
          let totalDias = 0;
          const d = new Date(
            Date.UTC(
              inicio.getUTCFullYear(),
              inicio.getUTCMonth(),
              inicio.getUTCDate(),
            ),
          );
          const fimDia = Date.UTC(
            fim.getUTCFullYear(),
            fim.getUTCMonth(),
            fim.getUTCDate(),
          );
          while (d.getTime() <= fimDia) {
            totalDias += 1;
            if (d.getUTCDay() !== folga) esperado += 1;
            d.setUTCDate(d.getUTCDate() + 1);
          }
          const obtido = contarDiasEscalados(folga, inicio, fim);
          // Exatidão e a invariância escalados <= total.
          return obtido === esperado && obtido >= 0 && obtido <= totalDias;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: score-perfil-abrangente, Property 4: Correção da sub-nota de Contribuição
  // Validates: Requirements 3.1, 3.2, 3.3
  it('Property 4: contribuição = clamp((aporte/meta)*100) em [0,100], e 100 quando aporte >= meta', () => {
    fc.assert(
      fc.property(naoNegativo(), positivo(), (aporteReal, meta) => {
        const nota = notaContribuicao(aporteReal, meta);
        const esperado = clamp((aporteReal / meta) * 100, 0, 100);
        const ok = nota === esperado && emFaixa(nota);
        if (aporteReal >= meta) return ok && nota === 100;
        return ok;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: score-perfil-abrangente, Property 5: Monotonicidade da Contribuição no aporte
  // Validates: Requirements 3.4
  it('Property 5: contribuição é monótona não-decrescente no aporte (meta fixa)', () => {
    fc.assert(
      fc.property(naoNegativo(), naoNegativo(), positivo(), (a, b, meta) => {
        const aporte1 = Math.min(a, b);
        const aporte2 = Math.max(a, b);
        return (
          notaContribuicao(aporte1, meta) <= notaContribuicao(aporte2, meta)
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: score-perfil-abrangente, Property 6: Correção da sub-nota de Disciplina
  // Validates: Requirements 4.1, 4.5, 4.6
  it('Property 6: disciplina em [0,100], proporcional ao desvio, e 100 quando <= linha de base e sem não-retornos', () => {
    fc.assert(
      fc.property(
        naoNegativo(10_000),
        naoNegativo(10_000),
        fc.integer({ min: 0, max: 30 }),
        (cancelamentos, linhaBaseCancelamentos, incidenciasDisciplinares) => {
          const nota = notaDisciplina({
            cancelamentos,
            linhaBaseCancelamentos,
            incidenciasDisciplinares,
          });
          const notaCancelRef =
            linhaBaseCancelamentos > 0
              ? clamp(
                  100 -
                    ((cancelamentos - linhaBaseCancelamentos) /
                      linhaBaseCancelamentos) *
                      FATOR_CANCELAMENTO_REF,
                )
              : cancelamentos > 0
                ? clamp(100 - FATOR_CANCELAMENTO_REF)
                : 100;
          const esperado = clamp(
            notaCancelRef - incidenciasDisciplinares * PENAL_POR_INCIDENCIA_REF,
            0,
            100,
          );
          const ok = nota === esperado && emFaixa(nota);
          if (
            cancelamentos <= linhaBaseCancelamentos &&
            incidenciasDisciplinares === 0
          ) {
            return ok && nota === 100;
          }
          return ok;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: score-perfil-abrangente, Property 7: Disciplina decresce com não-retornos
  // Validates: Requirements 4.3, 4.4, 7.2
  it('Property 7: disciplina é monótona não-crescente no número de não-retornos', () => {
    fc.assert(
      fc.property(
        naoNegativo(10_000),
        naoNegativo(10_000),
        fc.integer({ min: 0, max: 30 }),
        fc.integer({ min: 0, max: 30 }),
        (cancelamentos, linhaBaseCancelamentos, nr1, nr2) => {
          const menos = Math.min(nr1, nr2);
          const mais = Math.max(nr1, nr2);
          const notaMenos = notaDisciplina({
            cancelamentos,
            linhaBaseCancelamentos,
            incidenciasDisciplinares: menos,
          });
          const notaMais = notaDisciplina({
            cancelamentos,
            linhaBaseCancelamentos,
            incidenciasDisciplinares: mais,
          });
          return notaMais <= notaMenos;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: score-perfil-abrangente, Property 8: Correção e monotonicidade da Assiduidade
  // Validates: Requirements 5.1, 5.2, 5.3
  it('Property 8: assiduidade em [0,100] e monótona não-crescente na taxa de faltas', () => {
    fc.assert(
      fc.property(naoNegativo(200), naoNegativo(200), (t1, t2) => {
        const notaT1 = notaAssiduidade(t1);
        const notaT2 = notaAssiduidade(t2);
        const corretaT1 = notaT1 === clamp(100 - t1 * 3, 0, 100);
        const menor = Math.min(t1, t2);
        const maior = Math.max(t1, t2);
        const mono = notaAssiduidade(maior) <= notaAssiduidade(menor);
        return emFaixa(notaT1) && emFaixa(notaT2) && corretaT1 && mono;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: score-perfil-abrangente, Property 9: Nota final é combinação convexa em [0,100]
  // Validates: Requirements 6.1, 6.2
  it('Property 9: score.valor em [0,100] e igual ao arredondamento da média ponderada normalizada', () => {
    fc.assert(
      fc.property(entradaScoreArb, (e) => {
        const s = calcularScore(e);
        const somaPesos = s.componentes.reduce((acc, c) => acc + c.peso, 0);
        const esperado = Math.round(
          s.componentes.reduce((acc, c) => acc + c.valor * c.peso, 0) /
            somaPesos,
        );
        const valores = s.componentes.map((c) => c.valor);
        const min = Math.min(...valores);
        const max = Math.max(...valores);
        return (
          emFaixa(s.valor) &&
          s.valor === esperado &&
          somaPesos > 0 &&
          s.valor >= min &&
          s.valor <= max
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: score-perfil-abrangente, Property 10: Partição do semáforo
  // Validates: Requirements 6.3, 6.4, 6.5
  it('Property 10: nível é BOM (>=80), ATENCAO ([60,80)) ou CRITICO (<60) — partição total e exclusiva', () => {
    fc.assert(
      fc.property(entradaScoreArb, (e) => {
        const s = calcularScore(e);
        if (s.valor >= 80) return s.nivel === 'BOM';
        if (s.valor >= 60) return s.nivel === 'ATENCAO';
        return s.nivel === 'CRITICO';
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: score-perfil-abrangente, Property 11: Monotonicidade global da nota
  // Validates: Requirements 6.6
  it('Property 11: melhorar um componente (menor taxa de faltas) nunca reduz o score final', () => {
    fc.assert(
      fc.property(
        entradaScoreArb,
        naoNegativo(200),
        naoNegativo(200),
        (base, tA, tB) => {
          const taxaMaior = Math.max(tA, tB);
          const taxaMenor = Math.min(tA, tB);
          const pior = calcularScore({ ...base, taxaFaltas: taxaMaior });
          const melhor = calcularScore({ ...base, taxaFaltas: taxaMenor });
          return melhor.valor >= pior.valor;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: score-perfil-abrangente, Property 12: Componentes bem-formados e presentes conforme os dados
  // Validates: Requirements 7.1, 7.3
  it('Property 12: componentes bem-formados; assiduidade sempre; contribuição/disciplina sse insumos fornecidos', () => {
    fc.assert(
      fc.property(entradaScoreArb, (e) => {
        const s = calcularScore(e);
        for (const c of s.componentes) {
          if (
            c.chave.length === 0 ||
            c.rotulo.length === 0 ||
            !emFaixa(c.valor) ||
            !(c.peso > 0)
          ) {
            return false;
          }
        }
        const chaves = new Set(s.componentes.map((c) => c.chave));
        const assiduidadeSempre = chaves.has('assiduidade');
        const contribOk =
          chaves.has('contribuicao') === Boolean(e.contribuicao);
        const discOk = chaves.has('disciplina') === Boolean(e.disciplina);
        return assiduidadeSempre && contribOk && discOk;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: score-perfil-abrangente, Property 13: Determinismo
  // Validates: Requirements 8.1
  it('Property 13: duas chamadas consecutivas produzem resultados profundamente iguais', () => {
    fc.assert(
      fc.property(entradaScoreArb, (e) => {
        const a = calcularScore(e);
        const b = calcularScore(e);
        return JSON.stringify(a) === JSON.stringify(b);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('score-perfil-abrangente — testes de exemplo/borda', () => {
  // Validates: Requirements 2.3
  it('contribuição é neutra (50) quando a meta individual é indefinida', () => {
    expect(notaContribuicao(1234, null)).toBe(50);
    const s = calcularScore({
      taxaFaltas: 0,
      contribuicao: { aporteReal: 1234, metaIndividualPeriodo: null },
    });
    const contrib = s.componentes.find((c) => c.chave === 'contribuicao');
    expect(contrib?.valor).toBe(50);
  });

  // Validates: Requirements 4.6
  it('disciplina é 100 sem cancelamentos e sem não-retornos', () => {
    expect(
      notaDisciplina({
        cancelamentos: 0,
        linhaBaseCancelamentos: 0,
        incidenciasDisciplinares: 0,
      }),
    ).toBe(100);
    // Também 100 quando abaixo da linha de base e sem não-retornos.
    expect(
      notaDisciplina({
        cancelamentos: 3,
        linhaBaseCancelamentos: 10,
        incidenciasDisciplinares: 0,
      }),
    ).toBe(100);
  });

  // Validates: Requirements 4.3, 4.4
  it('cada não-retorno subtrai 20 pontos da disciplina (limitado a 0)', () => {
    const base = { cancelamentos: 0, linhaBaseCancelamentos: 0 };
    expect(notaDisciplina({ ...base, incidenciasDisciplinares: 1 })).toBe(80);
    expect(notaDisciplina({ ...base, incidenciasDisciplinares: 2 })).toBe(60);
    expect(notaDisciplina({ ...base, incidenciasDisciplinares: 10 })).toBe(0);
  });

  // Validates: Requirements 6.3, 6.4, 6.5
  it('semáforo nos limiares: 100→BOM, 80→BOM, 60→ATENCAO, <60→CRITICO', () => {
    expect(calcularScore({ taxaFaltas: 0 }).nivel).toBe('BOM'); // valor 100
    // notaAssiduidade = 100 - 3*taxa: taxa=20/3 → 80 (limiar BOM inclusive).
    const s80 = calcularScore({ taxaFaltas: 20 / 3 });
    expect(s80.valor).toBe(80);
    expect(s80.nivel).toBe('BOM');
    // taxa=40/3 → 60 (limiar ATENCAO inclusive).
    const s60 = calcularScore({ taxaFaltas: 40 / 3 });
    expect(s60.valor).toBe(60);
    expect(s60.nivel).toBe('ATENCAO');
    // taxa=41/3 → 59 (CRITICO).
    const s59 = calcularScore({ taxaFaltas: 41 / 3 });
    expect(s59.valor).toBe(59);
    expect(s59.nivel).toBe('CRITICO');
  });
});
