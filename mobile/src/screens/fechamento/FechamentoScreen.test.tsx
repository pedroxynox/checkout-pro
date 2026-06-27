/**
 * Testes da tela de Fechamento (resumo inteligente, read-only).
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { FechamentoScreen } from './FechamentoScreen';

jest.mock('../../api/services', () => ({
  fechamentoService: { resumo: jest.fn() },
}));

jest.mock('../../utils/formato', () => {
  const real = jest.requireActual('../../utils/formato');
  return { ...real, hojeISO: () => '2026-06-19' };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fechamentoService } = require('../../api/services');

describe('FechamentoScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('mostra o titular, os itens e um alerta de consistência', async () => {
    fechamentoService.resumo.mockResolvedValue({
      dataISO: '2026-06-19',
      completoArquivos: false,
      tudoPronto: false,
      totalItens: 8,
      concluidos: 3,
      itens: [
        { id: 'TROCO_SOLIDARIO', titulo: 'Troco Solidário', categoria: 'ARRECADACAO', status: 'OK' },
        { id: 'VENDAS', titulo: 'Vendas por hora', categoria: 'VENDAS', status: 'OK' },
        { id: 'CHECKLIST_FECHAMENTO', titulo: 'Checklist de fechamento', categoria: 'CHECKLIST', status: 'PENDENTE' },
      ],
      pendentes: ['Checklist de fechamento'],
      alertas: ['As vendas já entraram, mas ainda faltam: Devoluções.'],
    });

    render(<FechamentoScreen />);

    expect(await screen.findByText(/3 de 8 concluídos/)).toBeTruthy();
    expect(screen.getByText('Vendas por hora')).toBeTruthy();
    expect(screen.getByText(/Faltam: Checklist de fechamento/)).toBeTruthy();
    expect(
      screen.getByText(/As vendas já entraram/),
    ).toBeTruthy();
  });

  it('mostra "Tudo pronto!" quando o dia está completo', async () => {
    fechamentoService.resumo.mockResolvedValue({
      dataISO: '2026-06-19',
      completoArquivos: true,
      tudoPronto: true,
      totalItens: 8,
      concluidos: 8,
      itens: [],
      pendentes: [],
      alertas: [],
    });

    render(<FechamentoScreen />);
    expect(await screen.findByText('Tudo pronto!')).toBeTruthy();
  });
});
