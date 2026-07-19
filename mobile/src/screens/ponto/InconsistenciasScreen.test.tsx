/**
 * Painel de inconsistências: agrupa os problemas do ciclo por dia (seções
 * recolhíveis) e filtra apenas por pessoa (nome).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { InconsistenciasScreen } from './InconsistenciasScreen';

jest.mock('../../api/services', () => ({
  centralJornadaService: { inconsistencias: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { centralJornadaService } = require('../../api/services');

const RESPOSTA = {
  periodo: { inicio: '', fim: '', rotulo: '26/06 – 25/07', deslocamento: 0 },
  totais: {
    incompletas: 1,
    duplicadas: 0,
    conflitos: 1,
    atrasos: 0,
    tac: 0,
    total: 2,
  },
  itens: [
    {
      colaboradorId: 'c1',
      nome: 'Ana Souza',
      primeiroNome: 'Ana',
      funcao: 'OPERADOR',
      data: '2026-06-28T00:00:00.000Z',
      diaSemana: 0,
      ehFeriado: false,
      tipo: 'INCOMPLETA',
      detalhe: 'Falta registrar: encerramento',
    },
    {
      colaboradorId: 'c2',
      nome: 'Bruno Lima',
      primeiroNome: 'Bruno',
      funcao: 'FISCAL',
      data: '2026-06-29T00:00:00.000Z',
      diaSemana: 1,
      ehFeriado: false,
      tipo: 'CONFLITO_AUSENCIA',
      detalhe: 'Bateu ponto e tem falta/atestado marcado no mesmo dia',
    },
  ],
};

describe('InconsistenciasScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    centralJornadaService.inconsistencias.mockResolvedValue(RESPOSTA);
  });

  it('agrupa por dia e expande ao tocar no dia', async () => {
    render(<InconsistenciasScreen />);
    // Cabeçalhos de dia aparecem (Ana em 28/06, Bruno em 29/06).
    const diaAna = await screen.findByText(/28\/06/);
    expect(screen.getByText(/29\/06/)).toBeTruthy();
    // Recolhido por padrão: os nomes ainda não aparecem.
    expect(screen.queryByText('Ana Souza')).toBeNull();
    // Ao tocar no dia, expande e mostra a pessoa daquele dia.
    fireEvent.press(diaAna);
    expect(screen.getByText('Ana Souza')).toBeTruthy();
  });

  it('filtra apenas por pessoa (nome)', async () => {
    render(<InconsistenciasScreen />);
    await screen.findByText(/28\/06/);

    fireEvent.changeText(
      screen.getByPlaceholderText('Nome do colaborador…'),
      'bruno',
    );

    // O dia da Ana some; fica só o dia do Bruno.
    expect(screen.queryByText(/28\/06/)).toBeNull();
    const diaBruno = screen.getByText(/29\/06/);
    fireEvent.press(diaBruno);
    expect(screen.getByText('Bruno Lima')).toBeTruthy();
  });
});
