/**
 * Teste do pré-preenchimento do cadastro a partir da fila de "não reconhecidos":
 * ao chegar com `matriculaInicial`/`nomeInicial`, o formulário abre já pronto.
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { GestaoColaboradoresScreen } from './GestaoColaboradoresScreen';

jest.mock('../../api/services', () => ({
  colaboradoresService: { listar: jest.fn(), obter: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { colaboradoresService } = require('../../api/services');

function render_(params?: { matriculaInicial?: string; nomeInicial?: string }) {
  const route = { params } as never;
  const navigation = { navigate: jest.fn() } as never;
  return render(
    <GestaoColaboradoresScreen route={route} navigation={navigation} />,
  );
}

describe('GestaoColaboradoresScreen — pré-preenchimento', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    colaboradoresService.listar.mockResolvedValue([]);
  });

  it('abre o formulário já preenchido quando recebe matrícula/nome', async () => {
    render_({ matriculaInicial: '999', nomeInicial: 'Externo Silva' });

    expect(await screen.findByText('Novo colaborador')).toBeTruthy();
    expect(screen.getByDisplayValue('999')).toBeTruthy();
    expect(screen.getByDisplayValue('Externo Silva')).toBeTruthy();
  });

  it('sem parâmetros, não abre o formulário automaticamente', async () => {
    render_();

    // Mostra a busca/lista (form fechado): o botão de adicionar aparece.
    expect(await screen.findByText('Adicionar colaborador')).toBeTruthy();
    expect(screen.queryByText('Novo colaborador')).toBeNull();
  });
});
