/**
 * Testes do cálculo puro do resumo de evolução do feedforward: contagens,
 * % de atingimento (só revisados), nota (atual, anterior, tendência, média),
 * última conversa e próximo prazo pendente.
 */
import { PontoFeedforward, RodadaFeedforward } from '../api/types';
import { diasEntreISO, evolucaoFeedforward, textoPrazo } from './resumoFeedforward';

const HOJE = '2026-10-14';

function ponto(over: Partial<PontoFeedforward> = {}): PontoFeedforward {
  return {
    id: 'p',
    descricao: 'Ponto',
    prazo: '2026-11-01T00:00:00.000Z',
    status: 'PENDENTE',
    situacao: 'EM_DIA',
    revisadoPorNome: null,
    revisadoEm: null,
    observacaoRevisao: null,
    ...over,
  };
}

function rodada(over: Partial<RodadaFeedforward> = {}): RodadaFeedforward {
  return {
    id: 'r',
    colaboradorId: 'c1',
    data: '2026-10-01T00:00:00.000Z',
    liderNome: null,
    cargo: null,
    pontosFortes: null,
    oportunidades: null,
    compromissoFinal: null,
    evolucaoNota: null,
    fotoUrl: null,
    criadoEm: '2026-10-01T00:00:00.000Z',
    pontos: [],
    ...over,
  };
}

describe('resumoFeedforward — auxiliares', () => {
  it('diasEntreISO conta dias civis (com virada de mês)', () => {
    expect(diasEntreISO('2026-10-14', '2026-10-14')).toBe(0);
    expect(diasEntreISO('2026-10-01T00:00:00.000Z', '2026-10-14')).toBe(13);
    expect(diasEntreISO('2026-10-14', '2026-09-30')).toBe(-14);
  });

  it('textoPrazo descreve hoje, futuro e vencido (singular/plural)', () => {
    expect(textoPrazo(0)).toBe('vence hoje');
    expect(textoPrazo(1)).toBe('em 1 dia');
    expect(textoPrazo(5)).toBe('em 5 dias');
    expect(textoPrazo(-1)).toBe('vencido há 1 dia');
    expect(textoPrazo(-3)).toBe('vencido há 3 dias');
  });
});

describe('resumoFeedforward — evolucaoFeedforward', () => {
  it('sem rodadas, devolve tudo zerado/nulo', () => {
    const e = evolucaoFeedforward([], HOJE);
    expect(e.rodadas).toBe(0);
    expect(e.ultimaConversa).toBeNull();
    expect(e.diasDesdeUltima).toBeNull();
    expect(e.taxaAtingimento).toBeNull();
    expect(e.notaAtual).toBeNull();
    expect(e.tendenciaNota).toBeNull();
    expect(e.mediaNota).toBeNull();
    expect(e.proximoPrazo).toBeNull();
  });

  it('ordena por data mesmo que as rodadas venham fora de ordem', () => {
    const e = evolucaoFeedforward(
      [
        rodada({ id: 'b', data: '2026-09-01T00:00:00.000Z', evolucaoNota: 4 }),
        rodada({ id: 'c', data: '2026-10-01T00:00:00.000Z', evolucaoNota: 2 }),
        rodada({ id: 'a', data: '2026-08-01T00:00:00.000Z', evolucaoNota: 3 }),
      ],
      HOJE,
    );
    expect(e.notas).toEqual([3, 4, 2]);
    expect(e.notaAtual).toBe(2);
    expect(e.notaAnterior).toBe(4);
    expect(e.tendenciaNota).toBe('CAIU');
    expect(e.mediaNota).toBe(3);
    expect(e.ultimaConversa).toBe('2026-10-01T00:00:00.000Z');
    expect(e.diasDesdeUltima).toBe(13);
  });

  it('tendência SUBIU / ESTAVEL e rodadas sem nota são ignoradas', () => {
    const subiu = evolucaoFeedforward(
      [
        rodada({ data: '2026-08-01T00:00:00.000Z', evolucaoNota: 2 }),
        rodada({ data: '2026-09-01T00:00:00.000Z', evolucaoNota: null }),
        rodada({ data: '2026-10-01T00:00:00.000Z', evolucaoNota: 5 }),
      ],
      HOJE,
    );
    expect(subiu.notas).toEqual([2, 5]);
    expect(subiu.tendenciaNota).toBe('SUBIU');
    expect(subiu.mediaNota).toBe(3.5);

    const estavel = evolucaoFeedforward(
      [
        rodada({ data: '2026-09-01T00:00:00.000Z', evolucaoNota: 4 }),
        rodada({ data: '2026-10-01T00:00:00.000Z', evolucaoNota: 4 }),
      ],
      HOJE,
    );
    expect(estavel.tendenciaNota).toBe('ESTAVEL');
  });

  it('uma única nota não tem tendência', () => {
    const e = evolucaoFeedforward([rodada({ evolucaoNota: 3 })], HOJE);
    expect(e.notaAtual).toBe(3);
    expect(e.notaAnterior).toBeNull();
    expect(e.tendenciaNota).toBeNull();
  });

  it('média arredonda para 1 casa decimal', () => {
    const e = evolucaoFeedforward(
      [
        rodada({ data: '2026-08-01T00:00:00.000Z', evolucaoNota: 4 }),
        rodada({ data: '2026-09-01T00:00:00.000Z', evolucaoNota: 4 }),
        rodada({ data: '2026-10-01T00:00:00.000Z', evolucaoNota: 5 }),
      ],
      HOJE,
    );
    expect(e.mediaNota).toBe(4.3);
  });

  it('% de atingimento considera só os pontos revisados', () => {
    const e = evolucaoFeedforward(
      [
        rodada({
          pontos: [
            ponto({ id: '1', status: 'ATINGIDO', situacao: 'ATINGIDO' }),
            ponto({ id: '2', status: 'ATINGIDO', situacao: 'ATINGIDO' }),
            ponto({ id: '3', status: 'NAO_ATINGIDO', situacao: 'NAO_ATINGIDO' }),
            ponto({ id: '4', status: 'PENDENTE', situacao: 'VENCIDO' }),
          ],
        }),
      ],
      HOJE,
    );
    expect(e.taxaAtingimento).toBe(67);
    expect(e.pendentes).toBe(1);
    expect(e.vencidos).toBe(1);
  });

  it('sem pontos revisados, o atingimento é nulo (pendente não conta contra)', () => {
    const e = evolucaoFeedforward([rodada({ pontos: [ponto()] })], HOJE);
    expect(e.taxaAtingimento).toBeNull();
  });

  it('próximo prazo = pendente mais antigo entre todas as rodadas', () => {
    const e = evolucaoFeedforward(
      [
        rodada({
          id: 'r1',
          pontos: [
            ponto({ id: 'a', descricao: 'Longe', prazo: '2026-12-01T00:00:00.000Z' }),
            ponto({
              id: 'b',
              descricao: 'Já atingido',
              prazo: '2026-09-01T00:00:00.000Z',
              status: 'ATINGIDO',
              situacao: 'ATINGIDO',
            }),
          ],
        }),
        rodada({
          id: 'r2',
          pontos: [
            ponto({
              id: 'c',
              descricao: 'Vencido',
              prazo: '2026-10-12T00:00:00.000Z',
              situacao: 'VENCIDO',
            }),
          ],
        }),
      ],
      HOJE,
    );
    expect(e.proximoPrazo).toEqual({
      descricao: 'Vencido',
      prazo: '2026-10-12T00:00:00.000Z',
      situacao: 'VENCIDO',
      dias: -2,
    });
  });

  it('sem pendentes, não há próximo prazo', () => {
    const e = evolucaoFeedforward(
      [rodada({ pontos: [ponto({ status: 'ATINGIDO', situacao: 'ATINGIDO' })] })],
      HOJE,
    );
    expect(e.proximoPrazo).toBeNull();
  });
});
