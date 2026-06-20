import * as fc from 'fast-check';
import {
  LoteApaeEstado,
  PRECO_SACOLA_APAE,
  atualizarSaldo,
  calcularPercentualVendido,
  calcularQuantidadeVendida,
  calcularValorArrecadado,
  criarLote,
  reiniciarLote,
} from './lote-apae.domain';
import { SaldoInvalidoError } from './lote-apae.errors';

/**
 * Testes de propriedade (fast-check) do ciclo de Lote de Sacolas APAE.
 *
 * Cada teste implementa uma única propriedade de correção do design e executa
 * no mínimo 100 iterações. As decisões puras (cálculo de vendida/percentual,
 * validação de atualização e reinício) são exercitadas sem banco de dados.
 */

const NUM_RUNS = 100;

const dataArb: fc.Arbitrary<Date> = fc
  .integer({ min: 0, max: 400 })
  .map((dias) => new Date(Date.UTC(2024, 0, 1) + dias * 24 * 60 * 60 * 1000));

describe('Lote de Sacolas APAE — testes de propriedade', () => {
  // Feature: gestao-frente-de-caixa, Property 11: Quantidade vendida e percentual do lote APAE
  // Validates: Requirements 2.6.2, 2.6.3
  it('Property 11: vendida = inicial - saldoAtual e percentual = vendida/inicial em [0,1]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        dataArb,
        (quantidadeInicial, fracaoSaldo, dataInicio) => {
          // saldoAtual entre 0 e quantidadeInicial (atualização válida).
          const saldoAtual = Math.round(quantidadeInicial * fracaoSaldo);
          const lote = criarLote(quantidadeInicial, dataInicio);
          const atualizado = atualizarSaldo(lote, saldoAtual);

          const vendidaEsperada = quantidadeInicial - saldoAtual;
          if (atualizado.quantidadeVendida !== vendidaEsperada) {
            return false;
          }
          if (
            calcularQuantidadeVendida(quantidadeInicial, saldoAtual) !==
            vendidaEsperada
          ) {
            return false;
          }

          const percentual = calcularPercentualVendido(
            quantidadeInicial,
            atualizado.quantidadeVendida,
          );
          return (
            percentual >= 0 &&
            percentual <= 1 &&
            Math.abs(percentual - vendidaEsperada / quantidadeInicial) < 1e-9
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 12: Atualização inválida de lote é rejeitada
  // Validates: Requirements 2.6.4
  it('Property 12: saldo atual maior que o anterior é rejeitado e o lote permanece inalterado', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }),
        fc.integer({ min: 0, max: 100000 }),
        fc.integer({ min: 1, max: 100000 }),
        dataArb,
        (quantidadeInicial, saldoInicialFrac, incremento, dataInicio) => {
          // Lote com saldo já reduzido para um valor anterior.
          const saldoAnterior = Math.min(saldoInicialFrac, quantidadeInicial);
          const lote: LoteApaeEstado = {
            ...criarLote(quantidadeInicial, dataInicio),
            saldoAtual: saldoAnterior,
            quantidadeVendida: quantidadeInicial - saldoAnterior,
          };

          // Tenta um saldo MAIOR que o anterior -> inválido.
          const saldoMaior = saldoAnterior + incremento;
          let lancou = false;
          try {
            atualizarSaldo(lote, saldoMaior);
          } catch (e) {
            lancou = e instanceof SaldoInvalidoError;
          }

          // Rejeitou e o lote original permanece inalterado.
          return (
            lancou === true &&
            lote.saldoAtual === saldoAnterior &&
            lote.quantidadeVendida === quantidadeInicial - saldoAnterior
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 13: Reinício de lote zera vendida e preserva histórico
  // Validates: Requirements 2.6.5, 2.6.6
  it('Property 13: lote encerrado preserva inicial/vendida/datas e novo lote inicia com vendida zero', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }),
        fc.integer({ min: 0, max: 100000 }),
        fc.integer({ min: 1, max: 100000 }),
        dataArb,
        dataArb,
        (
          quantidadeInicial,
          saldoFinalFrac,
          novaQuantidadeInicial,
          dataInicio,
          dataEncerramento,
        ) => {
          const saldoFinal = Math.min(saldoFinalFrac, quantidadeInicial);
          const lote: LoteApaeEstado = {
            ...criarLote(quantidadeInicial, dataInicio),
            saldoAtual: saldoFinal,
            quantidadeVendida: quantidadeInicial - saldoFinal,
          };

          const dataInicioNovo = dataEncerramento;
          const { encerrado, novo } = reiniciarLote(
            lote,
            dataEncerramento,
            novaQuantidadeInicial,
            dataInicioNovo,
          );

          // Encerrado preserva quantidade inicial, datas e total vendida.
          const vendidaTotal = quantidadeInicial - saldoFinal;
          const encerradoOk =
            encerrado.status === 'ENCERRADO' &&
            encerrado.quantidadeInicial === quantidadeInicial &&
            encerrado.quantidadeVendida === vendidaTotal &&
            encerrado.dataInicio.getTime() === dataInicio.getTime() &&
            encerrado.dataEncerramento?.getTime() ===
              dataEncerramento.getTime();

          // Novo lote inicia com vendida zerada e status ABERTO.
          const novoOk =
            novo.status === 'ABERTO' &&
            novo.quantidadeVendida === 0 &&
            novo.quantidadeInicial === novaQuantidadeInicial &&
            novo.saldoAtual === novaQuantidadeInicial &&
            novo.dataEncerramento === null;

          return encerradoOk && novoOk;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 14: Valor arrecadado da APAE
  // Validates: cálculo de arrecadação (quantidade vendida × preço unitário)
  it('Property 14: valor arrecadado = quantidade vendida × preço unitário e nunca negativo', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        dataArb,
        (quantidadeInicial, fracaoSaldo, dataInicio) => {
          const saldoAtual = Math.round(quantidadeInicial * fracaoSaldo);
          const lote = criarLote(quantidadeInicial, dataInicio);
          const atualizado = atualizarSaldo(lote, saldoAtual);

          const valor = calcularValorArrecadado(atualizado.quantidadeVendida);
          const esperado = atualizado.quantidadeVendida * PRECO_SACOLA_APAE;
          return valor >= 0 && Math.abs(valor - esperado) < 1e-9;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
