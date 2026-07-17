/**
 * Painel de inconsistências: lista os problemas do ciclo e filtra por tipo,
 * função e nome.
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

  it('lista as inconsistências do ciclo', async () => {
    render(<InconsistenciasScreen />);
    expect(await screen.findByText('Ana Souza')).toBeTruthy();
    expect(screen.getByText('Bruno Lima')).toBeTruthy();
  });

  it('filtra por tipo (Conflitos oculta as incompletas)', async () => {
    render(<InconsistenciasScreen />);
    await screen.findByText('Ana Souza');

    fireEvent.press(screen.getByText('Conflitos'));

    expect(screen.queryByText('Ana Souza')).toBeNull();
    expect(screen.getByText('Bruno Lima')).toBeTruthy();
  });

  it('filtra por nome', async () => {
    render(<InconsistenciasScreen />);
    await screen.findByText('Ana Souza');

    fireEvent.changeText(
      screen.getByPlaceholderText('Nome do colaborador…'),
      'bruno',
    );

    expect(screen.queryByText('Ana Souza')).toBeNull();
    expect(screen.getByText('Bruno Lima')).toBeTruthy();
  });
});
