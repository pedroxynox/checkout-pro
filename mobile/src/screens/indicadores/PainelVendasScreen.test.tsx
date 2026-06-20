/**
 * Testes de componente/snapshot do Painel de Vendas (somente informativo).
 *
 * Cobre a exibição dos totais (dia/semana/mês) e os gráficos por hora. O envio
 * de arquivos foi movido para a seção Importações; aqui não há upload nem status.
 */
import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PainelVendasScreen } from './PainelVendasScreen';

jest.mock('../../api/services', () => ({
  vendasService: {
    resumo: jest.fn(),
    porHora: jest.fn(),
  },
}));

// "Hoje" determinístico (sexta-feira, 19/06/2026) para o snapshot.
jest.mock('../../utils/formato', () => {
  const real = jest.requireActual('../../utils/formato');
  return { ...real, hojeISO: () => '2026-06-19', diaSemanaHoje: () => 5 };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { vendasService } = require('../../api/services');

describe('PainelVendasScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('mantém o snapshot do painel', async () => {
    const arvore = render(<PainelVendasScreen />);

    await waitFor(() => expect(vendasService.porHora).toHaveBeenCalled());
    await screen.findByText(/12\.345,67/);
    expect(arvore.toJSON()).toMatchSnapshot();
  });
});
