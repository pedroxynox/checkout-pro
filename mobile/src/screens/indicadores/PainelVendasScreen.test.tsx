/**
 * Testes de componente/snapshot do Painel de Vendas.
 *
 * Cobre a exibição dos totais (dia/semana/mês), o status do dia
 * (enviado/pendente) e os gráficos por hora a partir do serviço de vendas.
 */
import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PainelVendasScreen } from './PainelVendasScreen';

jest.mock('../../api/services', () => ({
  vendasService: {
    status: jest.fn(),
    resumo: jest.fn(),
    porHora: jest.fn(),
    upload: jest.fn(),
  },
}));

jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ perfil: 'GERENTE' }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { vendasService } = require('../../api/services');

describe('PainelVendasScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    vendasService.status.mockResolvedValue({ enviado: true });
    vendasService.resumo.mockResolvedValue({
      totalDia: 12345.67,
      totalSemana: 50000,
      totalMes: 200000,
    });
    vendasService.porHora.mockResolvedValue({
      total: 9999.99,
      horas: [
        { hora: 8, valor: 3000 },
        { hora: 9, valor: 6999.99 },
      ],
    });
  });

  it('exibe os totais de vendas formatados em reais', async () => {
    render(<PainelVendasScreen />);

    expect(await screen.findByText(/12\.345,67/)).toBeTruthy();
    expect(vendasService.resumo).toHaveBeenCalled();
    expect(vendasService.porHora).toHaveBeenCalled();
  });

  it('mostra o status do dia (enviado/pendente)', async () => {
    render(<PainelVendasScreen />);

    expect(await screen.findByText('Enviado')).toBeTruthy();
  });

  it('mantém o snapshot do painel', async () => {
    const arvore = render(<PainelVendasScreen />);

    await waitFor(() => expect(vendasService.porHora).toHaveBeenCalled());
    await screen.findByText(/12\.345,67/);
    expect(arvore.toJSON()).toMatchSnapshot();
  });
});
