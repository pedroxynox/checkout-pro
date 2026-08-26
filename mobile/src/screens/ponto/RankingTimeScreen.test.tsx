/**
 * Ranking do time por métrica: ordena do maior para o menor, manda quem está em
 * zero para o rodapé recolhido, abre o detalhe dia a dia de cada pessoa e
 * navega para o detalhe diário da Central.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { RankingTimeScreen } from './RankingTimeScreen';

// O prefixo `mock` é exigido pelo Jest para variáveis usadas dentro do factory.
const mockNavegar = jest.fn();
const mockDefinirOpcoes = jest.fn();
const mockRota: { params: { metrica: string; ciclo: number } } = {
  params: { metrica: 'FALTAS', ciclo: 0 },
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavegar,
    setOptions: mockDefinirOpcoes,
  }),
  useRoute: () => mockRota,
}));

jest.mock('../../api/services', () => ({
  centralJornadaService: { rankings: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { centralJornadaService } = require('../../api/services');

/** Pessoa com os campos do resumo zerados, sobrescrevendo o que o teste precisa. */
function pessoa(over: Record<string, unknown>) {
  return {
    colaboradorId: 'x',
    nome: 'Sem Nome',
    primeiroNome: 'Sem',
    funcao: 'OPERADOR',
    cargaTrabalhadaMs: 0,
    extras50Ms: 0,
    extras50AtualMs: 0,
    extras100Ms: 0,
    horasDevidasMs: 0,
    horasDevidasAtualMs: 0,
    horasAtestadoMs: 0,
    faltas: 0,
    diasTac: 0,
    conflitos: 0,
    atrasos: 0,
    saldoMs: 0,
    saldo50Ms: 0,
    faltasDetalhe: [],
    atrasosDetalhe: [],
    tacDetalhe: [],
    conflitosDetalhe: [],
    ...over,
  };
}

const ANA = pessoa({
  colaboradorId: 'c1',
  nome: 'Ana Souza',
  primeiroNome: 'Ana',
  faltas: 1,
  extras50AtualMs: 3_600_000,
  faltasDetalhe: [
    {
      data: '2026-07-03T00:00:00.000Z',
      diaSemana: 5,
      ehFeriado: false,
      tipo: 'ATESTADO',
      debito: false,
      devidasMs: 0,
    },
  ],
});

const BRUNO = pessoa({
  colaboradorId: 'c2',
  nome: 'Bruno Lima',
  primeiroNome: 'Bruno',
  funcao: 'FISCAL',
  faltas: 3,
  extras50AtualMs: 7_200_000,
  faltasDetalhe: [
    {
      data: '2026-07-04T00:00:00.000Z',
      diaSemana: 6,
      ehFeriado: false,
      tipo: 'FALTA_DEBITO',
      debito: true,
      devidasMs: 8 * 3_600_000,
    },
    {
      data: '2026-07-05T00:00:00.000Z',
      diaSemana: 0,
      ehFeriado: false,
      tipo: 'FALTA',
      debito: false,
      devidasMs: 0,
    },
    {
      data: '2026-07-07T00:00:00.000Z',
      diaSemana: 2,
      ehFeriado: false,
      tipo: 'FALTA',
      debito: false,
      devidasMs: 0,
    },
  ],
});

const CARLA = pessoa({
  colaboradorId: 'c3',
  nome: 'Carla Dias',
  primeiroNome: 'Carla',
});

const RESPOSTA = {
  periodo: { inicio: '', fim: '', rotulo: '26/06 – 25/07', deslocamento: 0 },
  // De propósito fora de ordem: quem ordena é a tela.
  pessoas: [ANA, CARLA, BRUNO],
};

describe('RankingTimeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRota.params = { metrica: 'FALTAS', ciclo: 0 };
    centralJornadaService.rankings.mockResolvedValue(RESPOSTA);
  });

  it('ordena do que mais tem ao que menos tem', async () => {
    render(<RankingTimeScreen />);
    await screen.findByText('Bruno Lima');

    // Bruno (3 faltas) antes de Ana (1 falta).
    expect(screen.getByText('3 faltas')).toBeTruthy();
    expect(screen.getByText('1 falta')).toBeTruthy();
    const posicoes = screen.getAllByText(/^[12]$/).map((n) => n.props.children);
    expect(posicoes).toEqual([1, 2]);
  });

  it('soma o total do time e explica o que é estar no topo', async () => {
    render(<RankingTimeScreen />);

    expect(await screen.findByText('4 faltas')).toBeTruthy();
    expect(screen.getByText('no time todo')).toBeTruthy();
    expect(
      screen.getByText('Do que mais precisa de atenção ao que menos precisa.'),
    ).toBeTruthy();
  });

  it('manda quem está em zero para o rodapé recolhido', async () => {
    render(<RankingTimeScreen />);
    await screen.findByText('Bruno Lima');

    // Carla não tem faltas: não aparece no ranking, e sim no rodapé.
    expect(screen.queryByText('Carla Dias')).toBeNull();
    expect(screen.getByText('1 pessoa sem novidade')).toBeTruthy();

    fireEvent.press(screen.getByText('1 pessoa sem novidade'));
    expect(screen.getByText('Carla Dias')).toBeTruthy();
  });

  it('abre o detalhe dia a dia da pessoa', async () => {
    render(<RankingTimeScreen />);
    await screen.findByText('Bruno Lima');

    fireEvent.press(screen.getByText('Ver 3 dias'));

    expect(screen.getByText('Sáb 04/07')).toBeTruthy();
    expect(screen.getByText('Falta com débito de 8h 00min')).toBeTruthy();
    expect(screen.getAllByText('Falta sem débito de horas')).toHaveLength(2);
  });

  it('navega para o detalhe diário ao tocar na pessoa', async () => {
    render(<RankingTimeScreen />);
    await screen.findByText('Ana Souza');

    fireEvent.press(screen.getByText('Ana Souza'));

    expect(mockNavegar).toHaveBeenCalledWith('DetalheJornada', {
      colaboradorId: 'c1',
      ciclo: 0,
      pessoa: ANA,
    });
  });

  it('usa o título e o formato da métrica pedida (extras em horas, sem detalhe)', async () => {
    mockRota.params = { metrica: 'EXTRAS_50', ciclo: 0 };
    render(<RankingTimeScreen />);
    await screen.findByText('Bruno Lima');

    expect(mockDefinirOpcoes).toHaveBeenCalledWith({
      title: 'Ranking — Extras 50%',
    });
    // Total do time: 1h (Ana) + 2h (Bruno).
    expect(screen.getByText('3h 00min')).toBeTruthy();
    expect(screen.getByText('2h 00min')).toBeTruthy();
    expect(screen.getByText('1h 00min')).toBeTruthy();
    expect(
      screen.getByText('Do que mais acumulou ao que menos acumulou.'),
    ).toBeTruthy();
    // Extras não têm detalhe por dia.
    expect(screen.queryByText(/^Ver \d+ dia/)).toBeNull();
  });

  it('mostra estado vazio quando ninguém pontuou na métrica', async () => {
    mockRota.params = { metrica: 'CONFLITOS', ciclo: 0 };
    render(<RankingTimeScreen />);

    expect(await screen.findByText('Nada a mostrar')).toBeTruthy();
    expect(
      screen.getByText(
        'Nenhum conflito entre ponto e ausência neste ciclo.',
      ),
    ).toBeTruthy();
    // As três pessoas estão zeradas em conflitos.
    expect(screen.getByText('3 pessoas sem novidade')).toBeTruthy();
  });

  it('pede o ranking do ciclo recebido por parâmetro', async () => {
    mockRota.params = { metrica: 'FALTAS', ciclo: -2 };
    render(<RankingTimeScreen />);
    await screen.findByText('Bruno Lima');

    expect(centralJornadaService.rankings).toHaveBeenCalledWith(-2);
  });
});
