/**
 * Testes de componente/snapshot da tela do Painel de Vendas (Task 18.5).
 *
 * Cobre a exibição do acumulado de vendas formatado (Req 2.1.3) e a navegação
 * por perfil na tela (o formulário de informar vendas só aparece para o
 * gerente; o fiscal recebe um aviso).
 */
import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PainelVendasScreen } from './PainelVendasScreen';

jest.mock('../../api/services', () => ({
  indicadoresService: {
    acumulado: jest.fn(),
    registrarVenda: jest.fn(),
  },
}));

jest.mock('../../auth/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { indicadoresService } = require('../../api/services');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useAuth } = require('../../auth/AuthContext');

describe('PainelVendasScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    indicadoresService.acumulado.mockResolvedValue({ total: 12345.67 });
  });

  it('exibe o acumulado de vendas formatado em reais', async () => {
    useAuth.mockReturnValue({ perfil: 'GERENTE' });

    render(<PainelVendasScreen />);

    // O total formatado em pt-BR contém o símbolo de real e os centavos.
    expect(await screen.findByText(/12\.345,67/)).toBeTruthy();
    expect(indicadoresService.acumulado).toHaveBeenCalledWith(
      expect.any(String),
      'DIA',
    );
  });

  it('mostra o formulário de informar vendas para o gerente', async () => {
    useAuth.mockReturnValue({ perfil: 'GERENTE' });

    render(<PainelVendasScreen />);

    await waitFor(() =>
      expect(indicadoresService.acumulado).toHaveBeenCalled(),
    );
    expect(screen.getByText('Informar vendas do dia')).toBeTruthy();
  });

  it('oculta o formulário e exibe aviso para o fiscal (snapshot)', async () => {
    useAuth.mockReturnValue({ perfil: 'FISCAL' });

    const arvore = render(<PainelVendasScreen />);

    await waitFor(() =>
      expect(indicadoresService.acumulado).toHaveBeenCalled(),
    );
    expect(screen.queryByText('Informar vendas do dia')).toBeNull();
    expect(
      screen.getByText(
        'Apenas o gerente pode informar ou alterar o valor de vendas.',
      ),
    ).toBeTruthy();
    expect(arvore.toJSON()).toMatchSnapshot();
  });
});
