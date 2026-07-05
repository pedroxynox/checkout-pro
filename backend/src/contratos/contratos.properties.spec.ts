import * as fc from 'fast-check';
import {
  ANTECEDENCIA_ALERTA_DIAS,
  DIAS_MARCO_45,
  DIAS_MARCO_90,
  DecisaoRegistro,
  EstadoContrato,
  EtiquetaContrato,
  MarcoContrato,
  ResultadoDecisao,
  adicionarDias,
  avaliarAlerta,
  classificarUrgencia,
  derivarResumoContrato,
  diffEmDias,
  podeDecidirMarco,
  resumirCarteira,
} from './contratos.domain';

/**
 * Testes de propriedade (fast-check) dos Contratos de experiência.
 *
 * Cada propriedade nomeada roda no mínimo 100 iterações e exercita a derivação
 * pura do ciclo de vida do contrato (estado, marcos, alertas, urgência) sem
 * qualquer infraestrutura.
 */
const NUM_RUNS = 100;

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/** Data (meia-noite UTC) numa janela ampla. */
const dataArb: fc.Arbitrary<Date> = fc
  .integer({ min: 0, max: 800 })
  .map((dias) => new Date(Date.UTC(2025, 0, 1) + dias * UM_DIA_MS));

const resultadoArb: fc.Arbitrary<ResultadoDecisao> = fc.constantFrom(
  'APROVADO',
  'REPROVADO',
);

/** Decisões coerentes: no máximo uma por marco. */
const decisoesArb: fc.Arbitrary<DecisaoRegistro[]> = fc
  .record({
    d45: fc.option(resultadoArb, { nil: undefined }),
    d90: fc.option(resultadoArb, { nil: undefined }),
  })
  .map(({ d45, d90 }) => {
    const out: DecisaoRegistro[] = [];
    if (d45) out.push({ marco: 'MARCO_45', resultado: d45 });
    if (d90) out.push({ marco: 'MARCO_90', resultado: d90 });
    return out;
  });

const ETIQUETA_DE: Record<EstadoContrato, EtiquetaContrato> = {
  SEM_ADMISSAO: 'sem_admissao',
  EXPERIENCIA: 'experiencia',
  EFETIVADO: 'efetivado',
  ENCERRADO: 'encerrado',
};

describe('Contratos de experiência — testes de propriedade', () => {
  // Property 1: diff/adicionar são inversos — diffEmDias(base, base+n) === n.
  it('Property 1: adicionarDias e diffEmDias são inversos', () => {
    fc.assert(
      fc.property(dataArb, fc.integer({ min: -400, max: 400 }), (base, n) => {
        return diffEmDias(base, adicionarDias(base, n)) === n;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 2: a etiqueta é sempre o espelho minúsculo do estado.
  it('Property 2: etiqueta corresponde ao estado', () => {
    fc.assert(
      fc.property(
        fc.option(dataArb, { nil: null }),
        decisoesArb,
        dataArb,
        (dataAdmissao, decisoes, hoje) => {
          const r = derivarResumoContrato({ dataAdmissao, decisoes }, hoje);
          return r.etiqueta === ETIQUETA_DE[r.estado];
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 3: qualquer reprovação encerra o contrato.
  it('Property 3: reprovação em qualquer marco → ENCERRADO', () => {
    fc.assert(
      fc.property(
        dataArb,
        fc.constantFrom<MarcoContrato>('MARCO_45', 'MARCO_90'),
        dataArb,
        (dataAdmissao, marco, hoje) => {
          const decisoes: DecisaoRegistro[] = [
            { marco, resultado: 'REPROVADO' },
          ];
          const r = derivarResumoContrato({ dataAdmissao, decisoes }, hoje);
          return r.estado === 'ENCERRADO' && r.marcoEmAtraso === null;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 4: sem admissão → SEM_ADMISSAO e tudo neutro.
  it('Property 4: sem admissão → SEM_ADMISSAO', () => {
    fc.assert(
      fc.property(decisoesArb, dataArb, (decisoes, hoje) => {
        const r = derivarResumoContrato({ dataAdmissao: null, decisoes }, hoje);
        return (
          r.estado === 'SEM_ADMISSAO' &&
          r.diasDeCasa === 0 &&
          r.proximoMarco === null &&
          r.marcoEmAtraso === null
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 5: >=90 dias sem reprovação e sem aprovação-90 → efetivado por
  // decurso, com decisão do marco de 90 em atraso.
  it('Property 5: 90 dias sem decisão → EFETIVADO por decurso', () => {
    fc.assert(
      fc.property(
        dataArb,
        fc.integer({ min: DIAS_MARCO_90, max: DIAS_MARCO_90 + 200 }),
        fc.boolean(),
        (admissao, offset, aprovou45) => {
          const hoje = adicionarDias(admissao, offset);
          const decisoes: DecisaoRegistro[] = aprovou45
            ? [{ marco: 'MARCO_45', resultado: 'APROVADO' }]
            : [];
          const r = derivarResumoContrato(
            { dataAdmissao: admissao, decisoes },
            hoje,
          );
          return (
            r.estado === 'EFETIVADO' &&
            r.efetivadoPorDecurso === true &&
            r.marcoEmAtraso === (aprovou45 ? 'MARCO_90' : 'MARCO_45')
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 6: aprovação explícita no 90 → EFETIVADO limpo (sem atraso).
  it('Property 6: aprovado no marco de 90 → EFETIVADO sem atraso', () => {
    fc.assert(
      fc.property(dataArb, dataArb, (admissao, hoje) => {
        const decisoes: DecisaoRegistro[] = [
          { marco: 'MARCO_45', resultado: 'APROVADO' },
          { marco: 'MARCO_90', resultado: 'APROVADO' },
        ];
        const r = derivarResumoContrato(
          { dataAdmissao: admissao, decisoes },
          hoje,
        );
        return (
          r.estado === 'EFETIVADO' &&
          r.efetivadoPorDecurso === false &&
          r.marcoEmAtraso === null
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 7: em experiência (< 45 dias, sem decisão) o próximo marco é o 45
  // e não há atraso.
  it('Property 7: dentro dos 45 dias sem decisão → próximo marco 45, sem atraso', () => {
    fc.assert(
      fc.property(
        dataArb,
        fc.integer({ min: 0, max: DIAS_MARCO_45 - 1 }),
        (admissao, offset) => {
          const hoje = adicionarDias(admissao, offset);
          const r = derivarResumoContrato(
            { dataAdmissao: admissao, decisoes: [] },
            hoje,
          );
          return (
            r.estado === 'EXPERIENCIA' &&
            r.proximoMarco === 'MARCO_45' &&
            r.marcoEmAtraso === null &&
            r.diasParaProximoMarco === DIAS_MARCO_45 - offset
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 8: aprovado no 45 e < 90 dias → em experiência aguardando o 90.
  it('Property 8: aprovado no 45 e < 90 dias → aguarda marco de 90', () => {
    fc.assert(
      fc.property(
        dataArb,
        fc.integer({ min: DIAS_MARCO_45, max: DIAS_MARCO_90 - 1 }),
        (admissao, offset) => {
          const hoje = adicionarDias(admissao, offset);
          const r = derivarResumoContrato(
            {
              dataAdmissao: admissao,
              decisoes: [{ marco: 'MARCO_45', resultado: 'APROVADO' }],
            },
            hoje,
          );
          return (
            r.estado === 'EXPERIENCIA' &&
            r.proximoMarco === 'MARCO_90' &&
            r.marcoEmAtraso === null
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 9: "decisão em atraso" ⇔ há marco em atraso; senão VENCIMENTO só
  // quando faltam de 0 a ANTECEDENCIA dias.
  it('Property 9: avaliarAlerta é coerente com o resumo', () => {
    fc.assert(
      fc.property(
        fc.option(dataArb, { nil: null }),
        decisoesArb,
        dataArb,
        (dataAdmissao, decisoes, hoje) => {
          const r = derivarResumoContrato({ dataAdmissao, decisoes }, hoje);
          const a = avaliarAlerta(r);
          if (r.marcoEmAtraso) {
            return a !== null && a.tipo === 'DECISAO_ATRASO';
          }
          if (a && a.tipo === 'VENCIMENTO') {
            return a.dias >= 0 && a.dias <= ANTECEDENCIA_ALERTA_DIAS;
          }
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 10: urgência CRITICO ⇔ atraso ou vencendo em <= antecedência
  // (dentro de experiência/efetivado). INATIVO ⇔ sem admissão ou encerrado.
  it('Property 10: classificarUrgencia é coerente', () => {
    fc.assert(
      fc.property(
        fc.option(dataArb, { nil: null }),
        decisoesArb,
        dataArb,
        (dataAdmissao, decisoes, hoje) => {
          const r = derivarResumoContrato({ dataAdmissao, decisoes }, hoje);
          const u = classificarUrgencia(r);
          if (r.estado === 'SEM_ADMISSAO' || r.estado === 'ENCERRADO') {
            return u === 'INATIVO';
          }
          if (r.marcoEmAtraso) return u === 'CRITICO';
          if (r.estado === 'EFETIVADO') return u === 'OK';
          // Experiência sem atraso.
          const vencendo =
            r.diasParaProximoMarco !== null &&
            r.diasParaProximoMarco >= 0 &&
            r.diasParaProximoMarco <= ANTECEDENCIA_ALERTA_DIAS;
          return u === (vencendo ? 'CRITICO' : 'ATENCAO');
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 11: podeDecidirMarco — o 90 exige 45 aprovado; nada após reprovação.
  it('Property 11: podeDecidirMarco respeita a ordem e a reprovação', () => {
    fc.assert(
      fc.property(
        decisoesArb,
        fc.constantFrom<MarcoContrato>('MARCO_45', 'MARCO_90'),
        (decisoes, marco) => {
          const d45 = decisoes.find((d) => d.marco === 'MARCO_45')?.resultado;
          const d90 = decisoes.find((d) => d.marco === 'MARCO_90')?.resultado;
          const pode = podeDecidirMarco(marco, decisoes);
          if (d45 === 'REPROVADO' || d90 === 'REPROVADO') return pode === false;
          if (marco === 'MARCO_90') return pode === (d45 === 'APROVADO');
          return pode === true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 12: resumirCarteira — as categorias de estado somam o total.
  it('Property 12: resumirCarteira soma o total por estado', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            dataAdmissao: fc.option(dataArb, { nil: null }),
            decisoes: decisoesArb,
            hoje: dataArb,
          }),
          { maxLength: 40 },
        ),
        (entradas) => {
          const resumos = entradas.map((e) =>
            derivarResumoContrato(
              { dataAdmissao: e.dataAdmissao, decisoes: e.decisoes },
              e.hoje,
            ),
          );
          const c = resumirCarteira(resumos);
          return (
            c.total === entradas.length &&
            c.emExperiencia + c.efetivados + c.encerrados + c.semAdmissao ===
              c.total &&
            c.decisaoPendente <= c.total &&
            c.vencendoSemana <= c.total
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
