/**
 * Testes de componente/snapshot da tela de Importações.
 *
 * Cobre o envio dos arquivos .txt por indicador e o status (Enviado/Pendente)
 * de cada tipo no dia selecionado.
 */
import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { ImportacoesScreen } from './ImportacoesScreen';

jest.mock('../../api/services', () => ({
  arrecadacaoService: {
    status: jest.fn(),
    upload: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { arrecadacaoService } = require('../../api/services');

const STATUS = {
  TROCO_SOLIDARIO: true,
  RECARGAS_CELULAR: false,
  CANCELAMENTO_ITENS: false,
  CANCELAMENTO_CUPOM: false,
  DEVOLUCOES: true,
};

describe('ImportacoesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    arrecadacaoService.status.mockResolvedValue(STATUS);
  });

  it('lista os indicadores e o status (enviado/pendente)', async () => {
    render(<ImportacoesScreen />);

    expect(await screen.findByText('Troco Solidário')).toBeTruthy();
    expect(screen.getByText('Recargas de Celular')).toBeTruthy();
    // Há ao menos um tipo enviado e um pendente.
    expect((await screen.findAllByText('Enviado')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pendente').length).toBeGreaterThan(0);
  });

  it('mantém o snapshot da lista de indicadores', async () => {
    const arvore = render(<ImportacoesScreen />);

    await waitFor(() => expect(arrecadacaoService.status).toHaveBeenCalled());
    await screen.findByText('Troco Solidário');
    expect(arvore.toJSON()).toMatchSnapshot();
  });
});
