import { TipoContratoJornada } from '@prisma/client';
import { regrasContratoDeModelo } from './tipos-contrato.adapter';

const MIN = 60_000;

/** Linha 6x1 (mesmos valores semeados na migração). */
function modelo6x1(): TipoContratoJornada {
  return {
    id: 'c1',
    nome: '6x1 - 2x1',
    descricao: null,
    ativo: true,
    padrao: true,
    cargaBaseMinPorDia: [440, 420, 420, 420, 420, 480, 480],
    diasComAdicional100: [0],
    maxTrabalhoSemIntervaloMin: 290,
    intervaloMinimoMin: 60,
    intervaloMaximoMin: 180,
    limiteExtrasMin: 110,
    riscoTac1h30Min: 90,
    riscoTac1h40Min: 100,
    intervaloMinimoEntreBatidasMin: 2,
    intervaloObrigatorio: false,
    trabalhaDomingo: true,
    // Padrões da migração 9zzv: reproduzem o comportamento do 6x1.
    cargaFeriadoMin: 440,
    feriadoAdicional100: true,
    limiteTrabalhoDiaMin: null,
    folgasPorSemana: 1,
    folgasFixasPadrao: [],
    permiteFolgaSabado: false,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  };
}

describe('regrasContratoDeModelo', () => {
  it('o 6x1 com os padrões da migração 9zzv é o comportamento de antes', () => {
    const r = regrasContratoDeModelo(modelo6x1());
    expect(r.cargaFeriadoMs).toBe(440 * MIN); // feriado 7h20, como era fixo
    expect(r.feriadoAdicional100).toBe(true);
    expect(r.limiteTrabalhoDiaMs).toBeNull();
    expect(r.folgasPorSemana).toBe(1);
    expect(r.folgasFixasPadrao).toEqual([]);
    expect(r.permiteFolgaSabado).toBe(false);
  });

  it('5x2: carga de feriado própria, teto diário e folgas do contrato', () => {
    const r = regrasContratoDeModelo({
      ...modelo6x1(),
      cargaBaseMinPorDia: [528, 528, 528, 528, 528, 528, 528],
      cargaFeriadoMin: 480,
      feriadoAdicional100: false,
      limiteTrabalhoDiaMin: 600,
      folgasPorSemana: 2,
      folgasFixasPadrao: [6, 0],
      permiteFolgaSabado: true,
    });
    expect(r.cargaFeriadoMs).toBe(480 * MIN);
    expect(r.feriadoAdicional100).toBe(false);
    expect(r.limiteTrabalhoDiaMs).toBe(600 * MIN);
    expect(r.folgasPorSemana).toBe(2);
    expect(r.folgasFixasPadrao).toEqual([6, 0]);
    expect(r.permiteFolgaSabado).toBe(true);
  });

  it('converte minutos em ms e reproduz a carga base do 6x1 por dia', () => {
    const r = regrasContratoDeModelo(modelo6x1());
    expect(r.cargaBaseMs(0)).toBe(440 * MIN); // domingo 7h20
    expect(r.cargaBaseMs(1)).toBe(420 * MIN); // segunda 7h
    expect(r.cargaBaseMs(5)).toBe(480 * MIN); // sexta 8h
    expect(r.cargaBaseMs(6)).toBe(480 * MIN); // sábado 8h
    expect(r.maxTrabalhoSemIntervaloMs).toBe(290 * MIN);
    expect(r.intervaloMinimoMs).toBe(60 * MIN);
    expect(r.intervaloMaximoMs).toBe(180 * MIN);
    expect(r.limiteExtrasMs).toBe(110 * MIN);
    expect(r.riscoTac1h30Ms).toBe(90 * MIN);
    expect(r.riscoTac1h40Ms).toBe(100 * MIN);
    expect(r.intervaloMinimoEntreBatidasMs).toBe(2 * MIN);
  });

  it('adicional de 100% só nos dias configurados', () => {
    const r = regrasContratoDeModelo(modelo6x1());
    expect(r.temAdicional100(0)).toBe(true); // domingo
    expect(r.temAdicional100(1)).toBe(false); // segunda
    expect(r.temAdicional100(6)).toBe(false); // sábado
  });

  it('normaliza o dia da semana para a faixa 0..6', () => {
    const r = regrasContratoDeModelo(modelo6x1());
    expect(r.cargaBaseMs(7)).toBe(r.cargaBaseMs(0));
    expect(r.temAdicional100(7)).toBe(true); // 7 % 7 = 0 (domingo)
  });

  it('permite um contrato sem adicional de 100% (ex.: 5x2)', () => {
    const cincoXDois: TipoContratoJornada = {
      ...modelo6x1(),
      id: 'c2',
      nome: '5x2 6h/dia',
      // 6h de seg a sex; 0 no fim de semana (folga).
      cargaBaseMinPorDia: [0, 360, 360, 360, 360, 360, 0],
      diasComAdicional100: [],
    };
    const r = regrasContratoDeModelo(cincoXDois);
    expect(r.cargaBaseMs(1)).toBe(360 * MIN); // segunda 6h
    expect(r.cargaBaseMs(0)).toBe(0); // domingo folga
    expect(r.temAdicional100(0)).toBe(false);
  });

  it('propaga o intervalo obrigatório (contrato de 6h)', () => {
    const seisH: TipoContratoJornada = {
      ...modelo6x1(),
      id: 'c3',
      nome: '6h intervalo obrigatório',
      intervaloMinimoMin: 20,
      intervaloObrigatorio: true,
    };
    const r = regrasContratoDeModelo(seisH);
    expect(r.intervaloObrigatorio).toBe(true);
    expect(r.intervaloMinimoMs).toBe(20 * MIN);
  });
});
