/**
 * Teste "congela-regra" do contrato vigente 6x1–2x1 (spec
 * `solidez-contratos-jornada`, requisitos R1.4/RT.2).
 *
 * Estas são regras acordadas com o dono do produto; se algum destes valores
 * mudar sem intenção, ESTE teste falha. As regras vivem em `REGRAS_PADRAO`
 * (= `REGRAS_SEIS_X_UM_DOIS_X_UM`) e são semeadas, com os mesmos valores, no
 * tipo de contrato padrão (migração `9zy_tipos_contrato_jornada`).
 */
import {
  REGRAS_PADRAO,
  REGRAS_SEIS_X_UM_DOIS_X_UM,
  cargaBaseDoDia,
  diaPagaAdicional100,
} from './ponto.domain';
import { isDomingo, jornadaEsperadaMs } from '../fiscais/fiscais.domain';

const MIN = 60_000;

describe('Contrato 6x1–2x1 (congela-regra)', () => {
  it('REGRAS_PADRAO é o contrato 6x1–2x1', () => {
    expect(REGRAS_PADRAO).toBe(REGRAS_SEIS_X_UM_DOIS_X_UM);
  });

  it('carga base preserva 7h (seg–qui), 8h (sex–sáb) e 7h20 (domingo)', () => {
    const r = REGRAS_SEIS_X_UM_DOIS_X_UM;
    expect(r.cargaBaseMs(0)).toBe(7 * 60 * MIN + 20 * MIN); // domingo 7h20
    expect(r.cargaBaseMs(1)).toBe(7 * 60 * MIN); // segunda 7h
    expect(r.cargaBaseMs(2)).toBe(7 * 60 * MIN); // terça 7h
    expect(r.cargaBaseMs(3)).toBe(7 * 60 * MIN); // quarta 7h
    expect(r.cargaBaseMs(4)).toBe(7 * 60 * MIN); // quinta 7h
    expect(r.cargaBaseMs(5)).toBe(8 * 60 * MIN); // sexta 8h
    expect(r.cargaBaseMs(6)).toBe(8 * 60 * MIN); // sábado 8h
  });

  it('adicional de 100% apenas no domingo', () => {
    const r = REGRAS_SEIS_X_UM_DOIS_X_UM;
    expect(r.temAdicional100(0)).toBe(true); // domingo
    for (let dia = 1; dia <= 6; dia++) {
      expect(r.temAdicional100(dia)).toBe(false);
    }
  });

  it('limites de TAC congelados: extras 1h50; intervalo 1h–3h; riscos 1h30/1h40', () => {
    const r = REGRAS_SEIS_X_UM_DOIS_X_UM;
    expect(r.limiteExtrasMs).toBe(110 * MIN); // TAC por extras: 1h50
    expect(r.intervaloMinimoMs).toBe(60 * MIN); // intervalo mínimo: 1h
    expect(r.intervaloMaximoMs).toBe(180 * MIN); // intervalo máximo: 3h
    expect(r.riscoTac1h30Ms).toBe(90 * MIN); // risco preventivo 1h30
    expect(r.riscoTac1h40Ms).toBe(100 * MIN); // risco alto 1h40
    expect(r.maxTrabalhoSemIntervaloMs).toBe(290 * MIN); // 4h50 corridas
  });

  it('no 6x1 o intervalo NÃO é obrigatório (jornada curta encerra sem TAC)', () => {
    expect(REGRAS_SEIS_X_UM_DOIS_X_UM.intervaloObrigatorio).toBe(false);
  });

  it('campos da Fase 2 (jornada-5x2) com os valores de sempre', () => {
    const r = REGRAS_SEIS_X_UM_DOIS_X_UM;
    expect(r.cargaFeriadoMs).toBe(440 * MIN); // feriado 7h20
    expect(r.feriadoAdicional100).toBe(true); // feriado a 100%
    expect(r.limiteTrabalhoDiaMs).toBeNull(); // sem teto diário
    expect(r.folgasPorSemana).toBe(1);
    expect(r.folgasFixasPadrao).toEqual([]);
    expect(r.permiteFolgaSabado).toBe(false);
  });

  it('a carga e o 100% pelo contrato dão os números fixos que os relatórios do log usavam', () => {
    // `fiscais.service`/`fiscais-alertas` trocaram `jornadaEsperadaMs` e
    // `isDomingo` pelas regras do contrato do dia (R2.10): no 6x1 o número
    // tem de ser o mesmo, com e sem feriado.
    for (let dia = 0; dia <= 6; dia++) {
      for (const feriado of [false, true]) {
        expect(cargaBaseDoDia(dia, feriado, REGRAS_SEIS_X_UM_DOIS_X_UM)).toBe(
          feriado ? jornadaEsperadaMs(0) : jornadaEsperadaMs(dia),
        );
        expect(
          diaPagaAdicional100(dia, feriado, REGRAS_SEIS_X_UM_DOIS_X_UM),
        ).toBe(isDomingo(dia) || feriado);
      }
    }
  });
});
