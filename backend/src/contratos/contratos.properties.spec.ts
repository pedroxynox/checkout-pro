import * as fc from 'fast-check';
import {
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
  resumirCarteira,
} from './contratos.domain';

/**
 * Testes de propriedade (fast-check) dos Contratos de experiência — ciclo
 * AUTOMÁTICO (sem decisão manual de marcos).
 *
 * Regras exercitadas:
 *  - dentro dos 90 dias → EXPERIÊNCIA (sem marco pendente, sem atraso);
 *  - a partir do dia 91 → EFETIVADO automaticamente (por decurso);
 *  - reprovação explícita (histórica, via API) → ENCERRADO;
 *  - aprovação explícita no marco de 90 → EFETIVADO (não "por decurso");
 *  - nunca há alerta de decisão (marcos resolvem-se sozinhos).
 * Cada propriedade roda no mínimo 100 iterações, sem infraestrutura.
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

describe('Contratos de experiência — testes de propriedade (ciclo automático)', () => {
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

  // Property 3: sem admissão → SEM_ADMISSAO e tudo neutro.
  it('Property 3: sem admissão → SEM_ADMISSAO', () => {
    fc.assert(
      fc.property(decisoesArb, dataArb, (decisoes, hoje) => {
        const r = derivarResumoContrato({ dataAdmissao: null, decisoes }, hoje);
        return (
          r.estado === 'SEM_ADMISSAO' &&
          r.proximoMarco === null &&
          r.marcoEmAtraso === null
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 4: dentro dos 90 dias sem decisão → EXPERIÊNCIA, sem marco
  // pendente e sem atraso (o de 45 aprova-se por decurso).
  it('Property 4: 0..90 dias → EXPERIÊNCIA sem decisões pendentes', () => {
    fc.assert(
      fc.property(
        dataArb,
        fc.integer({ min: 0, max: DIAS_MARCO_90 }),
        (admissao, offset) => {
          const hoje = adicionarDias(admissao, offset);
          const r = derivarResumoContrato(
            { dataAdmissao: admissao, decisoes: [] },
            hoje,
          );
          return (
            r.estado === 'EXPERIENCIA' &&
            r.proximoMarco === null &&
            r.marcoEmAtraso === null &&
            r.efetivadoPorDecurso === false
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 5: a partir do dia 91 (mais de 90 dias) sem reprovação → EFETIVADO
  // por decurso, sem marco em atraso.
  it('Property 5: > 90 dias → EFETIVADO por decurso, sem atraso', () => {
    fc.assert(
      fc.property(
        dataArb,
        fc.integer({ min: DIAS_MARCO_90 + 1, max: DIAS_MARCO_90 + 300 }),
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
            r.proximoMarco === null &&
            r.marcoEmAtraso === null
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 6: qualquer reprovação explícita encerra o contrato.
  it('Property 6: reprovação em qualquer marco → ENCERRADO', () => {
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

  // Property 7: aprovação explícita no marco de 90 → EFETIVADO limpo (não "por
  // decurso"), independentemente dos dias.
  it('Property 7: aprovado no marco de 90 → EFETIVADO sem "por decurso"', () => {
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

  // Property 8: não há mais alerta de decisão — avaliarAlerta é sempre null
  // (os marcos resolvem-se automaticamente).
  it('Property 8: avaliarAlerta é sempre null (ciclo automático)', () => {
    fc.assert(
      fc.property(
        fc.option(dataArb, { nil: null }),
        decisoesArb,
        dataArb,
        (dataAdmissao, decisoes, hoje) => {
          const r = derivarResumoContrato({ dataAdmissao, decisoes }, hoje);
          return avaliarAlerta(r) === null;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 9: urgência coerente — INATIVO ⇔ sem admissão/encerrado; OK ⇔
  // efetivado; ATENÇÃO ⇔ em experiência. Nunca CRÍTICO (não há atraso).
  it('Property 9: classificarUrgencia é coerente com o estado', () => {
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
          if (r.estado === 'EFETIVADO') return u === 'OK';
          return u === 'ATENCAO';
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 10: a carteira soma corretamente e nunca há decisão pendente.
  it('Property 10: resumirCarteira soma os buckets e não tem pendências', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            dataAdmissao: fc.option(dataArb, { nil: null }),
            decisoes: decisoesArb,
            hoje: dataArb,
          }),
          { maxLength: 20 },
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
            c.total === resumos.length &&
            c.emExperiencia + c.efetivados + c.encerrados + c.semAdmissao ===
              c.total &&
            c.decisaoPendente === 0 &&
            c.vencendoSemana === 0
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
