import * as fc from 'fast-check';
import {
  COLUNAS_OBRIGATORIAS,
  LinhaImportada,
  PessoaCadastrada,
  RegistroHistorico,
  TIPOS_ARQUIVO,
  TipoArquivo,
  historico,
  normalizarNome,
  particionarLinhas,
  statusDoDia,
  tiposPendentes,
  validarColunas,
} from './importacoes.domain';

/**
 * Testes de propriedade (fast-check) do Modulo_Importacoes.
 *
 * Cada teste implementa uma única propriedade de correção do design e executa
 * no mínimo 100 iterações. As decisões puras (validação de colunas, partição
 * por nome, status do dia/pendentes e histórico ordenado/filtrado) são
 * exercitadas sem banco de dados.
 */

const NUM_RUNS = 100;

const tipoArquivoArb: fc.Arbitrary<TipoArquivo> = fc.constantFrom(
  ...TIPOS_ARQUIVO,
);

// Colunas extras irrelevantes que podem aparecer no cabeçalho.
const colunaExtraArb: fc.Arbitrary<string> = fc.constantFrom(
  'pdv',
  'observacao',
  'matricula',
  'turno',
  'extra',
);

// Gera uma data dentro de uma janela ampla (a partir de uma data base UTC).
const dataArb: fc.Arbitrary<Date> = fc
  .integer({ min: 0, max: 400 })
  .map((dias) => new Date(Date.UTC(2024, 0, 1) + dias * 24 * 60 * 60 * 1000));

describe('Modulo_Importacoes — testes de propriedade', () => {
  // Feature: gestao-frente-de-caixa, Property 1: Validação de colunas rejeita arquivo incompleto
  // Validates: Requirements 1.1.6
  it('Property 1: válido sse todas as colunas obrigatórias estão presentes; ausentes são reportadas', () => {
    fc.assert(
      fc.property(
        tipoArquivoArb,
        // Subconjunto das colunas obrigatórias que estarão presentes.
        fc.subarray([...COLUNAS_OBRIGATORIAS]),
        fc.array(colunaExtraArb, { maxLength: 4 }),
        fc.boolean(),
        (tipo, presentes, extras, embaralhar) => {
          // Cabeçalho = subconjunto das obrigatórias + colunas extras.
          let cabecalho = [...presentes, ...extras];
          if (embaralhar) {
            cabecalho = cabecalho.map((c) => c.toUpperCase());
          }

          const resultado = validarColunas(tipo, cabecalho);

          const faltando = COLUNAS_OBRIGATORIAS.filter(
            (c) => !presentes.includes(c),
          );

          // Válido se e somente se nenhuma obrigatória está faltando.
          if (faltando.length === 0) {
            return (
              resultado.valido === true &&
              resultado.colunasAusentes.length === 0
            );
          }
          // Inválido: reporta exatamente as colunas obrigatórias ausentes.
          return (
            resultado.valido === false &&
            resultado.colunasAusentes.length === faltando.length &&
            faltando.every((c) => resultado.colunasAusentes.includes(c))
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 2: Particionamento por nome (vinculado ou não reconhecido)
  // Validates: Requirements 1.1.7, 1.1.8
  it('Property 2: cada linha é vinculada ou não reconhecida — nunca ambos e nunca nenhum', () => {
    const nomeArb = fc.constantFrom(
      'Ana',
      'Bruno',
      'Carlos',
      'Daniela',
      'Eduardo',
      'Desconhecido',
      'Fulano',
    );

    fc.assert(
      fc.property(
        // Pessoas cadastradas (subconjunto dos nomes possíveis).
        fc.subarray(['Ana', 'Bruno', 'Carlos', 'Daniela', 'Eduardo'], {
          minLength: 0,
        }),
        fc.array(
          fc.record({
            data: dataArb,
            nome: nomeArb,
            valor: fc.float({ min: 0, max: 10000, noNaN: true }),
          }),
          { maxLength: 50 },
        ),
        (nomesCadastrados, linhas: LinhaImportada[]) => {
          const pessoas: PessoaCadastrada[] = nomesCadastrados.map(
            (nome, i) => ({
              id: `p${i}`,
              nome,
              tipo: i % 2 === 0 ? 'OPERADOR' : 'FISCAL',
            }),
          );

          const { vinculados, naoReconhecidos } = particionarLinhas(
            linhas,
            pessoas,
          );

          // (1) Cobertura exata: cada linha cai em exatamente um conjunto.
          if (vinculados.length + naoReconhecidos.length !== linhas.length) {
            return false;
          }

          // (2) Vinculados: o nome corresponde a uma pessoa cadastrada.
          const nomesCad = new Set(pessoas.map((p) => normalizarNome(p.nome)));
          for (const v of vinculados) {
            if (
              normalizarNome(v.pessoa.nome) !== normalizarNome(v.linha.nome)
            ) {
              return false;
            }
            if (!nomesCad.has(normalizarNome(v.linha.nome))) {
              return false;
            }
          }

          // (3) Não reconhecidos: nenhum corresponde a pessoa cadastrada.
          for (const linha of naoReconhecidos) {
            if (nomesCad.has(normalizarNome(linha.nome))) {
              return false;
            }
          }
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 3: Status do dia e pendentes refletem as importações
  // Validates: Requirements 1.2.1, 1.2.2, 1.2.3, 1.4.1
  it('Property 3: status "importado" sse importado; pendentes é exatamente o complemento', () => {
    fc.assert(
      fc.property(
        fc.subarray([...TIPOS_ARQUIVO], { minLength: 0 }),
        (importados) => {
          const importadosSet = new Set(importados);
          const status = statusDoDia(importados);
          const pendentes = tiposPendentes(importados);
          const pendentesSet = new Set(pendentes);

          for (const tipo of TIPOS_ARQUIVO) {
            const esperado = importadosSet.has(tipo) ? 'importado' : 'pendente';
            if (status[tipo] !== esperado) {
              return false;
            }
            // Pendentes é exatamente o complemento dos importados.
            if (importadosSet.has(tipo) === pendentesSet.has(tipo)) {
              return false;
            }
          }

          // Importados e pendentes particionam os quatro tipos.
          return importadosSet.size + pendentes.length === TIPOS_ARQUIVO.length;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 4: Histórico ordenado e filtrado por intervalo
  // Validates: Requirements 1.3.2, 1.3.3
  it('Property 4: histórico ordenado do mais recente ao mais antigo e filtrado por intervalo', () => {
    const registroArb: fc.Arbitrary<RegistroHistorico> = fc.record({
      tipo: tipoArquivoArb,
      dataReferencia: dataArb,
      importadoEm: fc
        .integer({ min: 0, max: 1_000_000 })
        .map((ms) => new Date(Date.UTC(2024, 0, 1) + ms * 1000)),
    });

    fc.assert(
      fc.property(
        fc.array(registroArb, { maxLength: 40 }),
        fc.tuple(dataArb, dataArb),
        (registros, [a, b]) => {
          const intervalo = {
            inicio: a.getTime() <= b.getTime() ? a : b,
            fim: a.getTime() <= b.getTime() ? b : a,
          };

          const resultado = historico(registros, intervalo);

          // (1) Filtragem: exatamente os registros com data de referência no
          // intervalo.
          const esperadoCount = registros.filter(
            (r) =>
              r.dataReferencia.getTime() >= intervalo.inicio.getTime() &&
              r.dataReferencia.getTime() <= intervalo.fim.getTime(),
          ).length;
          if (resultado.length !== esperadoCount) {
            return false;
          }
          for (const r of resultado) {
            if (
              r.dataReferencia.getTime() < intervalo.inicio.getTime() ||
              r.dataReferencia.getTime() > intervalo.fim.getTime()
            ) {
              return false;
            }
          }

          // (2) Ordenação decrescente por data/hora de importação.
          for (let i = 1; i < resultado.length; i++) {
            if (
              resultado[i - 1].importadoEm.getTime() <
              resultado[i].importadoEm.getTime()
            ) {
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
