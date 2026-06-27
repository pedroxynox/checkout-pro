/**
 * Testes da tela "Não reconhecidos" (fila de códigos sem cadastro):
 *  - lista os códigos com nome/código/valor e o aviso de total;
 *  - estado vazio quando está tudo reconhecido;
 *  - fluxo de "Associar": abre o seletor, escolhe um colaborador e chama o
 *    serviço de associação com o código certo.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { NaoReconhecidosScreen } from './NaoReconhecidosScreen';

jest.mock('../../api/services', () => ({
  arrecadacaoService: { listarNaoReconhecidos: jest.fn() },
  colaboradoresService: { listar: jest.fn(), adicionarIdentificador: jest.fn() },
}));

jest.mock('../../utils/dialogos', () => ({
  confirmar: jest.fn(() => Promise.resolve(true)),
  notificar: jest.fn(),
}));

jest.mock('../../utils/formato', () => {
  const real = jest.requireActual('../../utils/formato');
  return { ...real, hojeISO: () => '2026-06-19' };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { arrecadacaoService, colaboradoresService } = require('../../api/services');

function navFake() {
  return { navigate: jest.fn() } as never;
}
function routeFake() {
  return { params: undefined } as never;
}

const ITEM = {
  matricula: '999',
  nome: 'Externo Silva',
  total: 12.5,
  lancamentos: 3,
  tipos: ['TROCO_SOLIDARIO'],
};

describe('NaoReconhecidosScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    colaboradoresService.listar.mockResolvedValue([]);
    arrecadacaoService.listarNaoReconhecidos.mockResolvedValue([]);
    colaboradoresService.adicionarIdentificador.mockResolvedValue({ ok: true });
  });

  it('lista os códigos não reconhecidos com o aviso de total', async () => {
    arrecadacaoService.listarNaoReconhecidos.mockResolvedValue([ITEM]);

    render(<NaoReconhecidosScreen navigation={navFake()} route={routeFake()} />);

    expect(await screen.findByText('Externo Silva')).toBeTruthy();
    expect(screen.getByText(/Cód\. 999/)).toBeTruthy();
    expect(screen.getByText(/código\(s\) sem cadastro/)).toBeTruthy();
  });

  it('mostra o estado vazio quando está tudo reconhecido', async () => {
    arrecadacaoService.listarNaoReconhecidos.mockResolvedValue([]);

    render(<NaoReconhecidosScreen navigation={navFake()} route={routeFake()} />);

    expect(await screen.findByText('Tudo reconhecido 🎉')).toBeTruthy();
  });

  it('associa um código a um colaborador escolhido', async () => {
    arrecadacaoService.listarNaoReconhecidos.mockResolvedValue([ITEM]);
    colaboradoresService.listar.mockResolvedValue([
      {
        id: 'c1',
        nome: 'Ana Operadora',
        matricula: '100',
        funcao: 'OPERADOR',
        genero: 'F',
        ativo: true,
        turno: null,
        entradaSemana: null,
        saidaSemana: null,
        entradaFds: null,
        saidaFds: null,
        folgaDiaSemana: null,
        usuarioId: null,
      },
    ]);

    render(<NaoReconhecidosScreen navigation={navFake()} route={routeFake()} />);

    // Abre o seletor de associação.
    fireEvent.press(await screen.findByText('Associar'));
    // Escolhe a colaboradora.
    fireEvent.press(await screen.findByText('Ana Operadora'));

    await waitFor(() =>
      expect(colaboradoresService.adicionarIdentificador).toHaveBeenCalledWith(
        'c1',
        '999',
      ),
    );
  });
});
