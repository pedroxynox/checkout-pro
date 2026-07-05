/**
 * Testes do Centro de Controle — visibilidade do botão de reinício (Req 1.5).
 *
 * A card "Zerar dados operacionais" só deve aparecer para quem tem a
 * funcionalidade `ADMIN_DADOS`.
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { CentroControleScreen } from './CentroControleScreen';
import { useAuth } from '../../auth/AuthContext';

jest.mock('../../auth/AuthContext', () => ({
  useAuth: jest.fn(),
}));

const useAuthMock = useAuth as unknown as jest.Mock;

/** Navegação mínima para satisfazer as props da tela. */
const navigation = { navigate: jest.fn() } as never;
const route = { key: 'CentroControle', name: 'CentroControle' } as never;

describe('CentroControleScreen — reinício operacional', () => {
  afterEach(() => jest.clearAllMocks());

  it('mostra a card de reinício quando o usuário tem ADMIN_DADOS', () => {
    useAuthMock.mockReturnValue({
      podeAcessar: (f: string) => f === 'ADMIN_DADOS',
    });

    render(<CentroControleScreen navigation={navigation} route={route} />);

    expect(screen.getByText('Zerar dados operacionais')).toBeTruthy();
  });

  it('esconde a card de reinício sem ADMIN_DADOS', () => {
    useAuthMock.mockReturnValue({
      podeAcessar: (_f: string) => false,
    });

    render(<CentroControleScreen navigation={navigation} route={route} />);

    expect(screen.queryByText('Zerar dados operacionais')).toBeNull();
  });
});
