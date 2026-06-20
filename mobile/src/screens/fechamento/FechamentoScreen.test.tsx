/**
 * Testes da tela de Fechamento (status read-only dos arquivos do dia).
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { FechamentoScreen } from './FechamentoScreen';

jest.mock('../../api/services', () => ({
  arrecadacaoService: { status: jest.fn() },
  vendasService: { status: jest.fn() },
}));

// "Hoje" determinístico: a data padrão é hoje, então itens pendentes mostram "Pendente".
jest.mock('../../utils/formato', () => {
  const real = jest.requireActual('../../utils/formato');
  return { ...real, hojeISO: () => '2026-06-19', diaSemanaHoje: () => 5 };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { arrecadacaoService, vendasService } = require('../../api/services');

describe('FechamentoScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    arrecadacaoService.status.mockResolvedValue({
      TROCO_SOLIDARIO: 'ENVIADO',
      RECARGAS_CELULAR: 'PENDENTE',
      CANCELAMENTO_ITENS: 'SEM_MOVIMENTO',
      CANCELAMENTO_CUPOM: 'PENDENTE',
      DEVOLUCOES: 'PENDENTE',
    });
    vendasService.status.mockResolvedValue({ enviado: true });
  });

  it('mostra o status de cada arquivo (enviado/sem movimento/pendente) e o resumo', async () => {
    render(<FechamentoScreen />);

    expect(await screen.findByText('Troco Solidário')).toBeTruthy();
    expect(screen.getByText('Vendas por hora')).toBeTruthy();
    // Troco (enviado) + Itens (sem movimento) + Vendas (enviado) = 3 de 6.
    expect(screen.getByText(/3 de 6/)).toBeTruthy();
    expect(screen.getAllByText('Enviado').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Sem movimento')).toBeTruthy();
    expect(screen.getAllByText('Pendente').length).toBeGreaterThanOrEqual(1);
  });
});
