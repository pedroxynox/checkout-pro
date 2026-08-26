/**
 * Central de Notificações: agrupamento, título sem emoji, botão de ação que
 * navega direto ao módulo (sem abrir modal/prévia) e o botão discreto de limpar
 * a caixa (que só age depois de confirmar).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { NotificacoesScreen } from './NotificacoesScreen';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, react-hooks/exhaustive-deps
    const { useEffect } = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => cb(), []);
  },
}));

jest.mock('../../notificacoes/NotificacoesContext', () => ({
  useNotificacoes: () => ({ zerar: jest.fn(), ultima: null }),
}));

jest.mock('../../api/services', () => ({
  notificacoesService: { historico: jest.fn(), limpar: jest.fn() },
}));

jest.mock('../../utils/dialogos', () => ({
  confirmar: jest.fn(),
  notificar: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { notificacoesService } = require('../../api/services');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { confirmar } = require('../../utils/dialogos');

const AGORA = new Date().toISOString();

describe('NotificacoesScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    notificacoesService.historico.mockResolvedValue([
      { id: 'n1', titulo: '📦 Estoque baixo', mensagem: 'Sacolas P acabando', criadaEm: AGORA },
      { id: 'n2', titulo: '🏆 Vendas de ontem', mensagem: 'Bateu a meta', criadaEm: AGORA },
    ]);
  });

  it('mostra o título sem emoji e agrupa em "Hoje"', async () => {
    render(<NotificacoesScreen />);
    expect(await screen.findByText('Estoque baixo')).toBeTruthy();
    expect(screen.getByText('Vendas de ontem')).toBeTruthy();
    expect(screen.getByText('Hoje')).toBeTruthy();
  });

  it('o botão de ação navega direto ao módulo', async () => {
    render(<NotificacoesScreen />);
    fireEvent.press(await screen.findByText('Ver insumos'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Insumos'));
  });

  it('filtro "Lidas" fica vazio quando nada foi lido', async () => {
    render(<NotificacoesScreen />);
    await screen.findByText('Estoque baixo');
    fireEvent.press(screen.getByText('Lidas'));
    expect(await screen.findByText('Nada por aqui')).toBeTruthy();
  });

  it('limpar pede confirmação antes de apagar', async () => {
    confirmar.mockResolvedValue(false);
    notificacoesService.limpar.mockResolvedValue({ removidas: 2 });
    render(<NotificacoesScreen />);
    await screen.findByText('Estoque baixo');

    fireEvent.press(screen.getByLabelText('Limpar notificações'));

    await waitFor(() => expect(confirmar).toHaveBeenCalled());
    // Recusou: nada é apagado.
    expect(notificacoesService.limpar).not.toHaveBeenCalled();
  });

  it('ao confirmar, limpa a caixa e a tela fica vazia', async () => {
    confirmar.mockResolvedValue(true);
    notificacoesService.limpar.mockResolvedValue({ removidas: 2 });
    render(<NotificacoesScreen />);
    await screen.findByText('Estoque baixo');
    // Depois de limpar, o histórico volta vazio.
    notificacoesService.historico.mockResolvedValue([]);

    fireEvent.press(screen.getByLabelText('Limpar notificações'));

    await waitFor(() => expect(notificacoesService.limpar).toHaveBeenCalled());
    expect(await screen.findByText('Sem notificações')).toBeTruthy();
  });
});
