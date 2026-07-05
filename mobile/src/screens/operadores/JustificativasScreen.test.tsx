/**
 * Painel de Justificativas: lista faltas e não-retornos com estado, mostra quem
 * registrou/justificou e permite justificar (motivo).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { JustificativasScreen } from './JustificativasScreen';

jest.mock('../../api/services', () => ({
  operadoresService: { listarAusencias: jest.fn(), justificarAusencia: jest.fn() },
  escalaService: { listarIncidencias: jest.fn(), justificarIncidencia: jest.fn() },
  colaboradoresService: { listar: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { operadoresService, escalaService, colaboradoresService } = require('../../api/services');

describe('JustificativasScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    operadoresService.listarAusencias.mockResolvedValue([
      {
        id: 'a1',
        pessoaId: 'c1',
        nome: 'Ana Souza',
        matricula: '1',
        data: '2026-07-02',
        registradaPorNome: 'Fiscal João',
        statusJustificativa: 'PENDENTE',
        motivoJustificativa: null,
        justificadaPorNome: null,
      },
    ]);
    escalaService.listarIncidencias.mockResolvedValue([]);
    colaboradoresService.listar.mockResolvedValue([{ id: 'c1', nome: 'Ana Souza' }]);
    operadoresService.justificarAusencia.mockResolvedValue({});
  });

  it('mostra a falta pendente com quem a registrou', async () => {
    render(<JustificativasScreen />);
    expect(await screen.findByText('Ana Souza')).toBeTruthy();
    expect(screen.getByText(/Falta ·/)).toBeTruthy();
    expect(screen.getByText(/marcou Fiscal João/)).toBeTruthy();
    expect(screen.getByText('Pendente')).toBeTruthy();
  });

  it('justifica com motivo e chama o serviço', async () => {
    render(<JustificativasScreen />);
    await screen.findByText('Ana Souza');
    fireEvent.press(screen.getByText('Justificar'));
    fireEvent.press(await screen.findByText('Atestado médico'));
    fireEvent.press(screen.getByText('Confirmar justificativa'));
    await waitFor(() =>
      expect(operadoresService.justificarAusencia).toHaveBeenCalledWith('a1', {
        status: 'JUSTIFICADA',
        motivo: 'ATESTADO_MEDICO',
        observacao: undefined,
      }),
    );
  });
});
