/**
 * Testes de componente/snapshot da tela de Escala consolidada (Task 18.5).
 *
 * Cobre a exibição da escala efetiva por funcionário (Req 4.3.6): horário de
 * entrada/saída e intervalo para quem trabalha, selo "Folga" para quem folga e
 * selo "Especial" para horário individual.
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { EscalaScreen } from './EscalaScreen';

jest.mock('../../api/services', () => ({
  escalaService: {
    consolidada: jest.fn(),
  },
}));

// "Hoje" determinístico (sexta-feira = 5) para o snapshot não depender do dia
// real de execução — ver utils/formato (fuso de Brasília).
jest.mock('../../utils/formato', () => {
  const real = jest.requireActual('../../utils/formato');
  return { ...real, hojeISO: () => '2026-06-19', diaSemanaHoje: () => 5 };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { escalaService } = require('../../api/services');

const CONSOLIDADA = [
  {
    funcionarioId: 'Ana Souza',
    efetiva: {
      funcionarioId: 'Ana Souza',
      diaSemana: 1,
      entrada: '08:00',
      saida: '16:00',
      intervaloMin: 60,
      folga: false,
      especial: false,
    },
  },
  {
    funcionarioId: 'Bruno Lima',
    efetiva: {
      funcionarioId: 'Bruno Lima',
      diaSemana: 1,
      entrada: '13:00',
      saida: '21:00',
      intervaloMin: 30,
      folga: false,
      especial: true,
    },
  },
  { funcionarioId: 'Carla Dias', efetiva: 'FOLGA' },
];

describe('EscalaScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    escalaService.consolidada.mockResolvedValue(CONSOLIDADA);
  });

  it('exibe os horários efetivos e selos de folga/especial', async () => {
    render(<EscalaScreen />);

    expect(await screen.findByText('Ana Souza')).toBeTruthy();
    expect(screen.getByText(/08:00 às 16:00/)).toBeTruthy();
    expect(screen.getByText('Folga')).toBeTruthy();
    expect(screen.getByText('Especial')).toBeTruthy();
  });

  it('exibe estado vazio quando não há escala no dia', async () => {
    escalaService.consolidada.mockResolvedValue([]);

    render(<EscalaScreen />);

    expect(await screen.findByText('Sem escala')).toBeTruthy();
  });
});
