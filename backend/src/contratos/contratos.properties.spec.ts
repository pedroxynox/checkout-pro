import * as fc from 'fast-check';
import {
  ANTECEDENCIA_ALERTA_DIAS,
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
 * Testes de propriedade (fast-check) dos Contratos de experiência — ciclo
 * AUTOMÁTICO (sem decisão manual de marcos).
 *
 * Regras exercitadas:
 *  - dentro dos 90 dias → EXPERIÊNCIA (sem marco pendente, sem atraso);
 *  - a partir do dia 91 → EFETIVADO automaticamente (por decurso);
 *  - reprovação explícita (histórica, via API) → ENCERRADO;
 *  - aprovação explícita no marco de 90 → EFETIVADO (não "por decurso");
 *  - nunca há alerta de decisão (marcos resolvem-se sozinhos);
 *  - o único alerta é o VENCIMENTO do marco de 90, nos 5 dias que o antecedem;
 *  - condicionamento das decisões históricas (podeDecidirMarco).
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
        return r.estado === 'SEM_ADMISSAO' && r.proximoMarco === null;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 4: dentro dos 90 dias → EXPERIÊNCIA, apontando para o marco de 90
  // (usado só para o aviso de vencimento e o semáforo).
  it('Property 4: 0..90 dias → EXPERIÊNCIA apontando para o marco de 90', () => {
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
            r.proximoMarco === 'MARCO_90' &&
            r.efetivadoPorDecurso === false &&
            r.diasParaProximoMarco === DIAS_MARCO_90 - offset
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 5: a partir do dia 91 (mais de 90 dias) sem reprovação → EFETIVADO
  // por decurso.
  it('Property 5: > 90 dias → EFETIVADO por decurso', () => {
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
            r.proximoMarco === null
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
          return r.estado === 'ENCERRADO';
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
        return r.estado === 'EFETIVADO' && r.efetivadoPorDecurso === false;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 8: o único alerta possível é VENCIMENTO do marco de 90, nos 5 dias
  // antes de completá-lo (nunca há "decisão em atraso": ciclo automático).
  it('Property 8: só há alerta de VENCIMENTO (marco de 90) nos 5 dias antes', () => {
    fc.assert(
      fc.property(
        fc.option(dataArb, { nil: null }),
        decisoesArb,
        dataArb,
        (dataAdmissao, decisoes, hoje) => {
          const r = derivarResumoContrato({ dataAdmissao, decisoes }, hoje);
          const a = avaliarAlerta(r);
          if (a === null) return true;
          return (
            a.tipo === 'VENCIMENTO' &&
            a.marco === 'MARCO_90' &&
            a.dias >= 0 &&
            a.dias <= ANTECEDENCIA_ALERTA_DIAS
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 9: urgência coerente — INATIVO ⇔ sem admissão/encerrado; OK ⇔
  // efetivado; ATENÇÃO ⇔ em experiência fora da véspera; CRÍTICO ⇔ véspera.
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
          // EXPERIÊNCIA: crítico nos 5 dias antes dos 90; senão atenção.
          if (
            r.diasParaProximoMarco !== null &&
            r.diasParaProximoMarco >= 0 &&
            r.diasParaProximoMarco <= ANTECEDENCIA_ALERTA_DIAS
          ) {
            return u === 'CRITICO';
          }
          return u === 'ATENCAO';
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 10: a carteira soma corretamente (buckets == total).
  it('Property 10: resumirCarteira soma os buckets', () => {
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
            c.vencendoSemana >= 0 &&
            c.vencendoSemana <= c.emExperiencia
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 11: fronteira da efetivação automática. Exatamente aos 90 dias
  // ainda é EXPERIÊNCIA (vence hoje: diasParaProximoMarco === 0); no dia 91
  // (offset 91) já é EFETIVADO por decurso. A transição é atômica no dia 91.
  it('Property 11: fronteira 90/91 — vence aos 90, efetiva no 91', () => {
    fc.assert(
      fc.property(dataArb, (admissao) => {
        const no90 = derivarResumoContrato(
          { dataAdmissao: admissao, decisoes: [] },
          adicionarDias(admissao, DIAS_MARCO_90),
        );
        const no91 = derivarResumoContrato(
          { dataAdmissao: admissao, decisoes: [] },
          adicionarDias(admissao, DIAS_MARCO_90 + 1),
        );
        return (
          no90.estado === 'EXPERIENCIA' &&
          no90.diasParaProximoMarco === 0 &&
          no91.estado === 'EFETIVADO' &&
          no91.efetivadoPorDecurso === true
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 12: janela do aviso. Dentro da experiência, existe alerta de
  // VENCIMENTO se e somente se faltam entre 0 e ANTECEDENCIA dias para os 90.
  // Fora dessa janela (ainda em experiência) não há alerta nenhum.
  it('Property 12: aviso existe exatamente na janela dos últimos 5 dias', () => {
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
          const a = avaliarAlerta(r);
          const faltam = DIAS_MARCO_90 - offset;
          const naJanela = faltam >= 0 && faltam <= ANTECEDENCIA_ALERTA_DIAS;
          if (naJanela) {
            return (
              a !== null &&
              a.tipo === 'VENCIMENTO' &&
              a.marco === 'MARCO_90' &&
              a.dias === faltam
            );
          }
          return a === null;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Property 13: condicionamento das decisões históricas (podeDecidirMarco).
  //  - após qualquer REPROVAÇÃO nenhum marco pode ser decidido;
  //  - o marco de 90 só é decidível quando o de 45 foi APROVADO;
  //  - o marco de 45 é sempre decidível enquanto não houve reprovação.
  it('Property 13: podeDecidirMarco respeita a ordem e a reprovação', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<MarcoContrato>('MARCO_45', 'MARCO_90'),
        decisoesArb,
        (marco, decisoes) => {
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
});
