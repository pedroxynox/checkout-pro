import * as fc from 'fast-check';
import {
  AusenciaRegistro,
  IntervaloDatas,
  OperadorEscalaDia,
  Turno,
  ausenciaDuplicada,
  classificarTurnoOperador,
  contagemPorTurno,
  nomeDuplicado,
  relatorioAusencias,
} from './operadores.domain';

/**
 * Testes de propriedade (fast-check) do Modulo_Operadores.
 *
 * Cada teste implementa uma única propriedade de correção do design e executa
 * no mínimo 100 iterações. As decisões puras (unicidade de nome/ausência,
 * relatório e classificação/contagem por turno) são exercitadas sem banco de
 * dados.
 */

const NUM_RUNS = 100;

// Gera um horário "HH:mm" válido (00:00–23:59).
const horarioArb: fc.Arbitrary<string> = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(
    ([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
  );

// Gera uma data dentro de uma janela ampla (a partir de uma data base UTC).
const dataArb: fc.Arbitrary<Date> = fc
  .integer({ min: 0, max: 400 })
  .map((dias) => new Date(Date.UTC(2024, 0, 1) + dias * 24 * 60 * 60 * 1000));

describe('Modulo_Operadores — testes de propriedade', () => {
  // Feature: gestao-frente-de-caixa, Property 25: Unicidade de nome de operador
  // Validates: Requirements 6.1.3
  it('Property 25: nome idêntico a um já existente é rejeitado e a lista nunca contém duplicados', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 10 }), {
          minLength: 0,
          maxLength: 30,
        }),
        (nomes) => {
          // Simula a sequência de cadastros usando a regra de unicidade pura:
          // um nome só é aceito quando ainda não está cadastrado.
          const lista: string[] = [];
          for (const nome of nomes) {
            if (nomeDuplicado(lista, nome)) {
              // Rejeitado: a lista permanece inalterada.
              continue;
            }
            lista.push(nome);
          }

          // A lista resultante nunca contém nomes duplicados.
          return new Set(lista).size === lista.length;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 26: Unicidade de ausência por pessoa e dia
  // Validates: Requirements 6.2.3
  it('Property 26: existe no máximo uma ausência por par (pessoa, data)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            pessoaId: fc.constantFrom('p1', 'p2', 'p3'),
            data: dataArb,
          }),
          { minLength: 0, maxLength: 40 },
        ),
        (tentativas) => {
          const registradas: AusenciaRegistro[] = [];
          for (const t of tentativas) {
            if (ausenciaDuplicada(registradas, t.pessoaId, t.data)) {
              // Segunda ausência para a mesma pessoa/dia é rejeitada.
              continue;
            }
            registradas.push({ pessoaId: t.pessoaId, data: t.data });
          }

          // Invariante: chave (pessoa, dia) é única no conjunto registrado.
          const chaves = registradas.map(
            (a) =>
              `${a.pessoaId}@${a.data.getUTCFullYear()}-${a.data.getUTCMonth()}-${a.data.getUTCDate()}`,
          );
          return new Set(chaves).size === chaves.length;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 27: Relatório de ausências filtrado e ordenado
  // Validates: Requirements 6.3.1, 6.3.2, 6.3.3
  it('Property 27: conta apenas ausências do período e ordena de forma decrescente pela quantidade', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            pessoaId: fc.constantFrom('p1', 'p2', 'p3', 'p4'),
            data: dataArb,
          }),
          { minLength: 0, maxLength: 60 },
        ),
        fc.tuple(dataArb, dataArb),
        (ausencias, [a, b]) => {
          const periodo: IntervaloDatas = {
            inicio: a.getTime() <= b.getTime() ? a : b,
            fim: a.getTime() <= b.getTime() ? b : a,
          };

          const relatorio = relatorioAusencias(ausencias, periodo);

          // (1) Contagem correta: cada item reflete exatamente as ausências da
          // pessoa cuja data está dentro do período.
          for (const item of relatorio) {
            const esperado = ausencias.filter(
              (x) =>
                x.pessoaId === item.pessoaId &&
                x.data.getTime() >= periodo.inicio.getTime() &&
                x.data.getTime() <= periodo.fim.getTime(),
            ).length;
            if (item.quantidade !== esperado || item.quantidade === 0) {
              return false;
            }
          }

          // (2) Nenhuma ausência fora do período é contada: o total do
          // relatório é igual ao total de ausências dentro do período.
          const totalDentro = ausencias.filter(
            (x) =>
              x.data.getTime() >= periodo.inicio.getTime() &&
              x.data.getTime() <= periodo.fim.getTime(),
          ).length;
          const totalRelatorio = relatorio.reduce(
            (acc, it) => acc + it.quantidade,
            0,
          );
          if (totalRelatorio !== totalDentro) {
            return false;
          }

          // (3) Ordenação decrescente pela quantidade.
          for (let i = 1; i < relatorio.length; i++) {
            if (relatorio[i - 1].quantidade < relatorio[i].quantidade) {
              return false;
            }
          }
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 32: Classificação de operador por turno conforme horário de entrada
  // Validates: Requirements 6.6.1, 6.6.2, 6.6.3, 6.6.4
  it('Property 32: classifica em exatamente um turno conforme as fronteiras 10:00 e 13:00', () => {
    fc.assert(
      fc.property(horarioArb, (entrada) => {
        const [h, m] = entrada.split(':').map(Number);
        const minutos = h * 60 + m;
        const turno = classificarTurnoOperador(entrada);

        let esperado: Turno;
        if (minutos < 10 * 60) {
          esperado = 'ABERTURA';
        } else if (minutos < 13 * 60) {
          esperado = 'INTERMEDIARIO';
        } else {
          esperado = 'FECHAMENTO';
        }
        return turno === esperado;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 33: Contagem por turno consistente com o total
  // Validates: Requirements 6.6.5, 6.6.6, 6.6.7
  it('Property 33: soma das contagens por turno é igual ao total e exclui folga/férias/desligados', () => {
    const operadorDiaArb: fc.Arbitrary<OperadorEscalaDia> = fc.record({
      operadorId: fc.string({ minLength: 1, maxLength: 6 }),
      entrada: fc.option(horarioArb, { nil: null }),
      folga: fc.boolean(),
      ferias: fc.boolean(),
      desligado: fc.boolean(),
    });

    fc.assert(
      fc.property(
        fc.array(operadorDiaArb, { minLength: 0, maxLength: 40 }),
        (operadores) => {
          const c = contagemPorTurno(operadores);

          // (1) A soma das contagens por turno é igual ao total.
          if (c.abertura + c.intermediario + c.fechamento !== c.total) {
            return false;
          }

          // (2) O total é exatamente o número de operadores trabalhando
          // (não folga, não férias, não desligado e com entrada definida).
          const trabalhando = operadores.filter(
            (o) => !o.folga && !o.ferias && !o.desligado && o.entrada !== null,
          );
          return c.total === trabalhando.length;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
