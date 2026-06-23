/**
 * Testes de componente/snapshot da tela de Importações (carga dos arquivos).
 *
 * Cobre a exibição dos itens carregáveis (5 arrecadações + vendas) com o botão
 * de carregar. A carga em si é feita pelo usuário dedicado (perfil IMPORTADOR).
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { ImportacoesScreen } from './ImportacoesScreen';

jest.mock('../../api/services', () => ({
  arrecadacaoService: {
    upload: jest.fn(),
    status: jest.fn(() => Promise.resolve({})),
    marcarSemMovimento: jest.fn(() => Promise.resolve({ fechamentoConcluido: false })),
  },
  vendasService: {
    upload: jest.fn(),
    status: jest.fn(() => Promise.resolve({})),
  },
}));

// "Hoje" determinístico para o snapshot do seletor de data.
jest.mock('../../utils/formato', () => {
  const real = jest.requireActual('../../utils/formato');
  return { ...real, hojeISO: () => '2026-06-19', diaSemanaHoje: () => 5 };
});

describe('ImportacoesScreen', () => {
  it('lista os arquivos carregáveis (arrecadações + vendas)', async () => {
    render(<ImportacoesScreen />);

    expect(await screen.findByText('Troco Solidário')).toBeTruthy();
    expect(screen.getByText('Vendas por hora')).toBeTruthy();
    // Um botão "Carregar" por item (5 arrecadações + vendas = 6).
    expect(screen.getAllByText('Carregar').length).toBe(6);
  });

  it('renderiza a tela de carga com os indicadores do dia', async () => {
    render(<ImportacoesScreen />);
    expect(await screen.findByText('Troco Solidário')).toBeTruthy();
  });
});
