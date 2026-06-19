/**
 * Testes de componente/snapshot da tela de Importações (Task 18.5).
 *
 * Cobre a exibição do status do dia por arquivo (importado/pendente) e do
 * histórico de importações com os nomes não reconhecidos (Req 1.2, 1.3).
 */
import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { ImportacoesScreen } from './ImportacoesScreen';

jest.mock('../../api/services', () => ({
  importacoesService: {
    statusDoDia: jest.fn(),
    historico: jest.fn(),
    upload: jest.fn(),
  },
  arrecadacaoService: {
    upload: jest.fn(),
    resumo: jest.fn(),
    ranking: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { importacoesService } = require('../../api/services');

const STATUS = {
  CANCELAMENTO_ITENS: 'importado',
  TROCO_SOLIDARIO: 'pendente',
  RECARGAS_CELULAR: 'pendente',
  DEVOLUCOES: 'importado',
};

const HISTORICO = [
  {
    id: 'imp-1',
    tipo: 'CANCELAMENTO_ITENS',
    dataReferencia: '2024-03-10',
    importadoEm: '2024-03-10T12:00:00.000Z',
    importadoPor: 'gerente',
    nomesNaoReconhecidos: ['Fulano Desconhecido'],
  },
];

describe('ImportacoesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    importacoesService.statusDoDia.mockResolvedValue(STATUS);
    importacoesService.historico.mockResolvedValue(HISTORICO);
  });

  it('exibe o status do dia e o histórico de importações', async () => {
    render(<ImportacoesScreen />);

    // Há ao menos um arquivo importado e um pendente no status do dia.
    expect((await screen.findAllByText('Importado')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pendente').length).toBeGreaterThan(0);
    // O histórico mostra os nomes não reconhecidos para revisão.
    expect(
      screen.getByText(/Fulano Desconhecido/),
    ).toBeTruthy();
  });

  it('mantém o snapshot do status e histórico', async () => {
    const arvore = render(<ImportacoesScreen />);

    await waitFor(() => expect(importacoesService.historico).toHaveBeenCalled());
    await screen.findByText(/Fulano Desconhecido/);
    expect(arvore.toJSON()).toMatchSnapshot();
  });

  it('exibe estado vazio quando não há histórico', async () => {
    importacoesService.historico.mockResolvedValue([]);

    render(<ImportacoesScreen />);

    expect(await screen.findByText('Sem importações')).toBeTruthy();
  });
});
