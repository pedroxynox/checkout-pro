/**
 * Registro de Ponto (Fase A): busca do colaborador, painel de jornada e
 * registro manual de batida.
 */
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { RegistroPontoScreen } from './RegistroPontoScreen';

jest.mock('../../api/services', () => ({
  pontoService: {
    buscarPessoas: jest.fn(),
    jornadaDoDia: jest.fn(),
    registrarBatida: jest.fn(),
    editarBatida: jest.fn(),
    removerBatida: jest.fn(),
    lerPapelito: jest.fn(),
  },
}));

jest.mock('./leitorPapelito', () => ({
  capturarPapelito: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { capturarPapelito } = require('./leitorPapelito');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { pontoService } = require('../../api/services');

const JORNADA_VAZIA = {
  pessoaId: 'f1',
  tipoPessoa: 'FISCAL',
  data: '2026-07-13',
  jornada: {
    trabalhadoMs: 0,
    intervaloMs: 0,
    status: 'SEM_REGISTRO',
    baseMs: 25200000,
    horasExtrasMs: 0,
    horasExtras50Ms: 0,
    horasExtras100Ms: 0,
    alertaIminente: false,
    tac: false,
    motivosTac: [],
    faltando: [],
  },
  batidas: [],
};

describe('RegistroPontoScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pontoService.buscarPessoas.mockResolvedValue([
      { id: 'f1', nome: 'Ana Souza', tipoPessoa: 'FISCAL' },
    ]);
    pontoService.jornadaDoDia.mockResolvedValue(JORNADA_VAZIA);
    pontoService.registrarBatida.mockResolvedValue(JORNADA_VAZIA);
  });

  it('busca, seleciona o colaborador e mostra a jornada', async () => {
    render(<RegistroPontoScreen />);
    fireEvent.changeText(
      screen.getByPlaceholderText('Digite o nome…'),
      'Ana',
    );
    fireEvent.press(await screen.findByText('Ana Souza'));
    await waitFor(() =>
      expect(pontoService.jornadaDoDia).toHaveBeenCalledWith('f1', expect.any(String)),
    );
    expect(await screen.findByText('Jornada do dia')).toBeTruthy();
  });

  it('registra uma batida manual', async () => {
    render(<RegistroPontoScreen />);
    fireEvent.changeText(
      screen.getByPlaceholderText('Digite o nome…'),
      'Ana',
    );
    fireEvent.press(await screen.findByText('Ana Souza'));
    await screen.findByText('Jornada do dia');

    fireEvent.press(screen.getByText('Registrar batida'));
    fireEvent.changeText(screen.getByPlaceholderText('07:56'), '0756');
    fireEvent.press(screen.getByText('Registrar'));

    await waitFor(() =>
      expect(pontoService.registrarBatida).toHaveBeenCalledWith(
        expect.objectContaining({ pessoaId: 'f1', tipoPessoa: 'FISCAL' }),
      ),
    );
    const arg = pontoService.registrarBatida.mock.calls[0][0];
    expect(arg.hora).toMatch(/T07:56:00/);
  });

  it('lê o papelito, sugere o colaborador e pré-preenche a hora', async () => {
    capturarPapelito.mockResolvedValue({ texto: 'FUNCIONARIO ANA SOUZA 07:56' });
    pontoService.lerPapelito.mockResolvedValue({
      texto: 'FUNCIONARIO ANA SOUZA 07:56',
      nome: 'ANA SOUZA',
      data: null,
      hora: '07:56',
      candidatos: [{ id: 'f1', nome: 'Ana Souza', tipoPessoa: 'FISCAL' }],
    });

    render(<RegistroPontoScreen />);
    fireEvent.press(screen.getByText('Ler papelito (foto)'));

    // Sugere o colaborador lido; ao escolher, abre o formulário com a hora.
    fireEvent.press(await screen.findByText('Ana Souza'));
    expect(await screen.findByText('Registrar batida')).toBeTruthy();
    expect(pontoService.lerPapelito).toHaveBeenCalledWith({
      texto: 'FUNCIONARIO ANA SOUZA 07:56',
    });
  });
});
