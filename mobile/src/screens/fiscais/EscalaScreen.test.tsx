/**
 * Testes de componente da tela de Escala consolidada.
 *
 * Cobre a exibição da escala efetiva por funcionário (Req 4.3.6) e as ações
 * rápidas por colaborador — **Falta** e **Sem retorno** — visíveis só para quem
 * gere ausências (`OPERADORES_AUSENCIAS`), que marcam a ocorrência de hoje com
 * um toque (sem horário).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { EscalaScreen } from './EscalaScreen';

jest.mock('../../api/services', () => ({
  escalaService: {
    consolidada: jest.fn(),
    registrarIncidencia: jest.fn(),
  },
  operadoresService: {
    registrarAusencia: jest.fn(),
  },
  fiscaisService: {
    painel: jest.fn(),
  },
}));

// Painel de fiscais em tempo real (status ao vivo na escala): conexão neutra.
jest.mock('../../api/socket', () => ({
  conectarPainelFiscais: jest.fn(() =>
    Promise.resolve({ socket: {}, desconectar: jest.fn() }),
  ),
}));

// Diálogos: confirmar resolve true (usuário confirma) e notificar é neutro.
jest.mock('../../utils/dialogos', () => ({
  confirmar: jest.fn(() => Promise.resolve(true)),
  notificar: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));
const mockAuth = { permitir: false };
jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ podeAcessar: () => mockAuth.permitir }),
}));

// "Hoje" determinístico (sexta = 5) para não depender do dia real.
jest.mock('../../utils/formato', () => {
  const real = jest.requireActual('../../utils/formato');
  return { ...real, hojeISO: () => '2026-06-19', diaSemanaHoje: () => 5 };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { escalaService, operadoresService, fiscaisService } = require('../../api/services');

const CONSOLIDADA = [
  {
    funcionarioId: 'f-ana',
    colaboradorId: 'c-ana',
    nome: 'Ana Souza',
    matricula: '123',
    efetiva: {
      funcionarioId: 'f-ana',
      diaSemana: 1,
      entrada: '08:00',
      saida: '16:00',
      intervaloMin: 60,
      folga: false,
      especial: false,
    },
  },
  {
    funcionarioId: 'f-bruno',
    colaboradorId: 'c-bruno',
    nome: 'Bruno Lima',
    efetiva: {
      funcionarioId: 'f-bruno',
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
    mockAuth.permitir = false;
    escalaService.consolidada.mockResolvedValue(CONSOLIDADA);
    escalaService.registrarIncidencia.mockResolvedValue({});
    operadoresService.registrarAusencia.mockResolvedValue({});
    fiscaisService.painel.mockResolvedValue([]);
  });

  it('exibe os horários efetivos e selos de folga/especial', async () => {
    render(<EscalaScreen />);

    expect(await screen.findByText('Ana Souza')).toBeTruthy();
    expect(screen.getByText(/08:00 às 16:00/)).toBeTruthy();
    expect(screen.getByText('Folga')).toBeTruthy();
    expect(screen.getByText('Especial')).toBeTruthy();
  });

  it('exibe o status ao vivo do fiscal quando o dia é hoje', async () => {
    fiscaisService.painel.mockResolvedValue([
      { fiscalId: 'f-ana', primeiroNome: 'Ana', status: 'DISPONIVEL', desde: null },
      { fiscalId: 'f-bruno', primeiroNome: 'Bruno', status: 'INTERVALO', desde: null },
    ]);

    render(<EscalaScreen />);

    expect(await screen.findByText('Ana Souza')).toBeTruthy();
    expect(await screen.findByText('Disponível')).toBeTruthy();
    expect(screen.getByText('Em intervalo')).toBeTruthy();
  });

  it('exibe estado vazio quando não há escala no dia', async () => {
    escalaService.consolidada.mockResolvedValue([]);

    render(<EscalaScreen />);

    expect(await screen.findByText('Sem escala')).toBeTruthy();
  });

  it('não mostra as ações Falta/Sem retorno sem permissão de gestão', async () => {
    render(<EscalaScreen />);

    expect(await screen.findByText('Ana Souza')).toBeTruthy();
    expect(screen.queryByText('Falta')).toBeNull();
    expect(screen.queryByText('Sem retorno')).toBeNull();
  });

  it('mostra Falta e Sem retorno por colaborador quando há permissão', async () => {
    mockAuth.permitir = true;

    render(<EscalaScreen />);

    expect(await screen.findByText('Ana Souza')).toBeTruthy();
    // Um par de botões por colaborador com colaboradorId (Ana e Bruno).
    expect(screen.getAllByText('Falta')).toHaveLength(2);
    expect(screen.getAllByText('Sem retorno')).toHaveLength(2);
  });

  it('marca "Sem retorno" (não-retorno, sem horário) ao tocar o botão', async () => {
    mockAuth.permitir = true;

    render(<EscalaScreen />);

    await screen.findByText('Ana Souza');
    fireEvent.press(screen.getAllByText('Sem retorno')[0]);

    await waitFor(() =>
      expect(escalaService.registrarIncidencia).toHaveBeenCalledWith({
        colaboradorId: 'c-ana',
        tipo: 'NAO_RETORNO_INTERVALO',
        data: '2026-06-19',
      }),
    );
    // Não-retorno é marcado sem horário: nenhuma falta é registrada por engano.
    expect(operadoresService.registrarAusencia).not.toHaveBeenCalled();
  });

  it('marca "Falta" (ausência de hoje) ao tocar o botão', async () => {
    mockAuth.permitir = true;

    render(<EscalaScreen />);

    await screen.findByText('Ana Souza');
    fireEvent.press(screen.getAllByText('Falta')[0]);

    await waitFor(() =>
      expect(operadoresService.registrarAusencia).toHaveBeenCalledWith(
        'c-ana',
        '2026-06-19',
      ),
    );
    expect(escalaService.registrarIncidencia).not.toHaveBeenCalled();
  });
});
