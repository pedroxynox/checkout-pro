/**
 * Textos de TAC do Registro de Ponto pelo contrato do dia (spec `jornada-5x2`,
 * R2.5). O que importa provar: no 6x1 (ou sem `regrasResumo`) o texto é o de
 * antes, e com outro contrato cita os números dele.
 */
import {
  REGRAS_RESUMO_6X1,
  regrasDoDia,
  textoDuracaoMin,
  textoRegraTac,
  textoRiscoTac,
} from './regrasTac';

const CINCO_X_DOIS = {
  limiteExtrasMin: 70,
  primeiroAvisoMin: 50,
  segundoAvisoMin: 60,
  intervaloMinimoMin: 60,
  intervaloMaximoMin: 170,
  limiteTrabalhoDiaMin: 600,
};

describe('textoDuracaoMin (igual ao backend)', () => {
  it('escreve horas e minutos como os motivos de TAC', () => {
    expect(textoDuracaoMin(110)).toBe('1h50');
    expect(textoDuracaoMin(60)).toBe('1h');
    expect(textoDuracaoMin(50)).toBe('50 min');
    expect(textoDuracaoMin(528)).toBe('8h48');
    expect(textoDuracaoMin(0)).toBe('0 min');
  });
});

describe('textos de TAC', () => {
  it('sem regrasResumo valem os números do 6x1', () => {
    expect(regrasDoDia(undefined)).toBe(REGRAS_RESUMO_6X1);
    expect(regrasDoDia(null)).toBe(REGRAS_RESUMO_6X1);
  });

  it('no 6x1 os textos são os de antes', () => {
    expect(textoRegraTac(REGRAS_RESUMO_6X1)).toBe(
      '• TAC: acima de 1h50 de extras, ou intervalo abaixo de 1h / acima de 3h.',
    );
    expect(textoRiscoTac(95 * 60_000, REGRAS_RESUMO_6X1)).toBe(
      'Risco de TAC: já atingiu 1h30 de horas extras.',
    );
    expect(textoRiscoTac(100 * 60_000, REGRAS_RESUMO_6X1)).toBe(
      'Risco alto de TAC: já atingiu 1h40 de horas extras.',
    );
  });

  it('com o 5x2 citam o contrato, inclusive o teto diário', () => {
    expect(textoRegraTac(CINCO_X_DOIS)).toBe(
      '• TAC: acima de 1h10 de extras, ou intervalo abaixo de 1h / acima de 2h50, ou mais de 10h trabalhadas no dia.',
    );
    expect(textoRiscoTac(55 * 60_000, CINCO_X_DOIS)).toBe(
      'Risco de TAC: já atingiu 50 min de horas extras.',
    );
    expect(textoRiscoTac(60 * 60_000, CINCO_X_DOIS)).toBe(
      'Risco alto de TAC: já atingiu 1h de horas extras.',
    );
  });
});
