/**
 * Card "Compensação de horas" da Central de Jornada (ADR 0021).
 *
 * A card é um **resumo tocável**: mostra só o que se lê de relance e leva à tela
 * `Compensacao`. Os testes das ações (conceder, descartar, cobrir, desfazer)
 * vivem em `CompensacaoScreen.test.tsx`, onde as ações passaram a morar.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { CartaoCompensacao } from './CartaoCompensacao';

jest.mock('../../api/services', () => ({
  compensacaoHorasService: { painel: jest.fn() },
}));

// O prefixo `mock` é o que o Jest permite referenciar dentro da fábrica.
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { compensacaoHorasService } = require('../../api/services');

const H = 3_600_000;

const CARTEIRA = {
  totalSaldoMs: 32 * H,
  pessoasComSaldo: 5,
  pessoasAbaixoDoMinimo: 1,
  totalCoberturaMs: 7 * H,
  totalLiberacaoMs: 14 * H,
  naoAlocadoMs: 11 * H,
  datasDisponiveis: 4,
};

const PERIODO = {
  inicio: '2026-08-26T00:00:00.000Z',
  fim: '2026-09-25T00:00:00.000Z',
  rotulo: '26/08 – 25/09',
  deslocamento: 0,
  diasRestantes: 9,
};

function painel(over: Record<string, unknown> = {}) {
  return {
    periodo: PERIODO,
    carteira: CARTEIRA,
    datasFracas: [],
    liberacoes: [],
    coberturas: [],
    decididas: [],
    bloqueio: null,
    ...over,
  };
}

/** Uma liberação qualquer — a card só conta, não mostra o detalhe. */
const LIBERACAO = { colaboradorId: 'c1', data: '2026-09-23T00:00:00.000Z' };
const COBERTURA = { ausenciaId: 'a1' };

describe('CartaoCompensacao', () => {
  beforeEach(() => jest.clearAllMocks());

  it('não aparece para quem não pode conceder, e nem consulta o servidor', () => {
    compensacaoHorasService.painel.mockResolvedValue(painel());
    render(<CartaoCompensacao ciclo={0} podeConceder={false} />);

    expect(screen.queryByText('Compensação de horas')).toBeNull();
    expect(compensacaoHorasService.painel).not.toHaveBeenCalled();
  });

  it('mostra as horas em aberto e o que NÃO cabe no ciclo', async () => {
    compensacaoHorasService.painel.mockResolvedValue(painel());
    render(<CartaoCompensacao ciclo={0} podeConceder />);

    await screen.findByText('50% em aberto');
    expect(screen.getByText('32h 00min')).toBeTruthy();
    // É o número que exige ação: essas horas serão pagas.
    expect(screen.getByText('Não cabe no ciclo')).toBeTruthy();
    expect(screen.getByText('11h 00min')).toBeTruthy();
  });

  it('conta as sugestões no plural certo', async () => {
    compensacaoHorasService.painel.mockResolvedValue(
      painel({ liberacoes: [LIBERACAO, LIBERACAO], coberturas: [COBERTURA] }),
    );
    render(<CartaoCompensacao ciclo={0} podeConceder />);

    // "3 sugestões", nunca "3 sugestãoões".
    await screen.findByText('3 sugestões para zerar as horas de 50%');
  });

  it('uma sugestão só usa o singular', async () => {
    compensacaoHorasService.painel.mockResolvedValue(
      painel({ liberacoes: [LIBERACAO] }),
    );
    render(<CartaoCompensacao ciclo={0} podeConceder />);

    await screen.findByText('1 sugestão para zerar as horas de 50%');
  });

  it('sem sugestões, explica para que a seção serve', async () => {
    compensacaoHorasService.painel.mockResolvedValue(painel());
    render(<CartaoCompensacao ciclo={0} podeConceder />);

    await screen.findByText('Zerar as horas de 50% antes de o ciclo fechar');
  });

  /** É o ponto do redesenho: a card não abre, ela leva. */
  it('ao ser tocada, leva à tela de compensação', async () => {
    compensacaoHorasService.painel.mockResolvedValue(
      painel({ liberacoes: [LIBERACAO] }),
    );
    render(<CartaoCompensacao ciclo={0} podeConceder />);

    fireEvent.press(await screen.findByText('Compensação de horas'));
    expect(mockNavigate).toHaveBeenCalledWith('Compensacao');
  });

  it('não mostra listas nem botões de ação (isso é da tela)', async () => {
    compensacaoHorasService.painel.mockResolvedValue(
      painel({ liberacoes: [LIBERACAO], coberturas: [COBERTURA] }),
    );
    render(<CartaoCompensacao ciclo={0} podeConceder />);

    await screen.findByText('Compensação de horas');
    expect(screen.queryByText('Conceder')).toBeNull();
    expect(screen.queryByText('Descartar')).toBeNull();
    expect(screen.queryByText('Dias mais fracos do ciclo')).toBeNull();
  });
});
