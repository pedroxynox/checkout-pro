/**
 * Testes da tela de reinício operacional (Req 1.5).
 *
 * Valida que a ação exige a confirmação explícita "ZERAR": sem a palavra, o
 * botão não dispara a chamada; com a palavra e a confirmação do diálogo, chama
 * o backend com `{ confirmacao: 'ZERAR' }` e mostra o resumo do reinício.
 */
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { ReiniciarDadosScreen } from './ReiniciarDadosScreen';

const mockZerarDados = jest.fn(
  (_dados: { confirmacao: 'ZERAR' }) => Promise.resolve({ vendas_diarias: 3 }),
);

jest.mock('../../api/services', () => ({
  adminService: {
    zerarDados: (dados: { confirmacao: 'ZERAR' }) => mockZerarDados(dados),
  },
}));

jest.mock('../../utils/dialogos', () => ({
  confirmar: jest.fn(() => Promise.resolve(true)),
  notificar: jest.fn(),
}));

describe('ReiniciarDadosScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('não zera enquanto a confirmação "ZERAR" não for digitada', () => {
    render(<ReiniciarDadosScreen />);

    fireEvent.press(
      screen.getByRole('button', { name: 'Zerar dados operacionais' }),
    );

    expect(mockZerarDados).not.toHaveBeenCalled();
  });

  it('zera após digitar ZERAR e confirmar, mostrando o resumo', async () => {
    render(<ReiniciarDadosScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Digite ZERAR'), 'ZERAR');
    fireEvent.press(
      screen.getByRole('button', { name: 'Zerar dados operacionais' }),
    );

    await waitFor(() =>
      expect(mockZerarDados).toHaveBeenCalledWith({ confirmacao: 'ZERAR' }),
    );
    expect(await screen.findByText('Resumo do reinício')).toBeTruthy();
  });
});
