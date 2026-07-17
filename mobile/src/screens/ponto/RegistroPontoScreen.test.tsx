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
import { ApiError } from '../../api/client';

// Sem NavigationContainer no teste: mocka o hook de navegação (só usamos o
// atalho para a Central de Jornada, que não é exercitado aqui).
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

// Sem AuthProvider no teste: o atalho da Central de Jornada fica oculto.
jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ podeAcessar: () => false }),
}));

// Sem OfflineProvider no teste: fornece um contexto offline neutro (a fila é
// exercitada nos testes de src/offline/).
jest.mock('../../offline/OfflineContext', () => ({
  useOfflineContexto: () => ({
    online: true,
    pendentes: 0,
    definirOnline: jest.fn(),
    enfileirar: jest.fn(),
    sincronizarAgora: jest.fn(),
  }),
}));

jest.mock('../../api/services', () => ({
  pontoService: {
    buscarPessoas: jest.fn(),
    jornadaDoDia: jest.fn(),
    registrarBatida: jest.fn(),
    editarBatida: jest.fn(),
    removerBatida: jest.fn(),
    lerComprovante: jest.fn(),
  },
  fiscaisService: {
    meuResumo: jest.fn(),
    informarFalta: jest.fn(),
  },
}));

jest.mock('./leitorComprovante', () => ({
  capturarComprovante: jest.fn(),
}));

// Leitor ao vivo (câmera): neutro nos testes de tela (é exercitado no APK).
jest.mock('./leitorAoVivo', () => ({
  LeitorComprovanteAoVivo: () => null,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { capturarComprovante } = require('./leitorComprovante');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { pontoService, fiscaisService } = require('../../api/services');

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

const JORNADA_QUATRO = {
  ...JORNADA_VAZIA,
  jornada: {
    ...JORNADA_VAZIA.jornada,
    trabalhadoMs: 25200000,
    status: 'ENCERRADO',
  },
  batidas: [
    { id: 'b1', hora: '2026-07-13T07:00:00.000Z', tipo: 'ENTRADA' },
    { id: 'b2', hora: '2026-07-13T12:00:00.000Z', tipo: 'SAIDA_INTERVALO' },
    { id: 'b3', hora: '2026-07-13T14:00:00.000Z', tipo: 'RETORNO_INTERVALO' },
    { id: 'b4', hora: '2026-07-13T16:00:00.000Z', tipo: 'ENCERRAMENTO' },
  ],
};

describe('RegistroPontoScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pontoService.buscarPessoas.mockResolvedValue([
      { id: 'f1', nome: 'Ana Souza', tipoPessoa: 'FISCAL' },
    ]);
    pontoService.jornadaDoDia.mockResolvedValue(JORNADA_VAZIA);
    pontoService.registrarBatida.mockResolvedValue(JORNADA_VAZIA);
    // Por padrão o usuário do teste não é fiscal (card de falta não aparece).
    fiscaisService.meuResumo.mockResolvedValue(null);
    fiscaisService.informarFalta.mockResolvedValue(undefined);
  });

  it('busca, seleciona o colaborador e mostra a jornada', async () => {
    render(<RegistroPontoScreen />);
    fireEvent.changeText(
      screen.getByPlaceholderText('Digite o nome…'),
      'Ana',
    );
    fireEvent.press(await screen.findByText('Ana Souza'));
    await waitFor(() =>
      expect(pontoService.jornadaDoDia).toHaveBeenCalledWith(
        'f1',
        expect.any(String),
        'FISCAL',
      ),
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

  it('não oferece uma quinta batida e mantém correção e exclusão disponíveis', async () => {
    pontoService.jornadaDoDia.mockResolvedValue(JORNADA_QUATRO);

    render(<RegistroPontoScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('Digite o nome…'), 'Ana');
    fireEvent.press(await screen.findByText('Ana Souza'));

    expect(
      await screen.findByText(
        'Limite de 4 batidas atingido. Você ainda pode corrigir ou excluir uma batida.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Registrar batida')).toBeNull();
    expect(screen.getByText('Entrada')).toBeTruthy();
    expect(screen.getByText('Encerramento')).toBeTruthy();
  });

  it('mostra a mensagem do backend quando a batida é recusada por duplicidade', async () => {
    pontoService.registrarBatida.mockRejectedValue(
      new ApiError(
        409,
        'Já existe uma batida nesse horário. Verifique se não é repetida.',
      ),
    );

    render(<RegistroPontoScreen />);
    fireEvent.changeText(
      screen.getByPlaceholderText('Digite o nome…'),
      'Ana',
    );
    fireEvent.press(await screen.findByText('Ana Souza'));
    await screen.findByText('Jornada do dia');

    fireEvent.press(screen.getByText('Registrar batida'));
    fireEvent.changeText(screen.getByPlaceholderText('07:56'), '0800');
    fireEvent.press(screen.getByText('Registrar'));

    expect(
      await screen.findByText(
        'Já existe uma batida nesse horário. Verifique se não é repetida.',
      ),
    ).toBeTruthy();
  });

  it('lê o comprovante, sugere o colaborador e pré-preenche a hora', async () => {
    capturarComprovante.mockResolvedValue({ texto: 'FUNCIONARIO ANA SOUZA 07:56' });
    pontoService.lerComprovante.mockResolvedValue({
      texto: 'FUNCIONARIO ANA SOUZA 07:56',
      nome: 'ANA SOUZA',
      data: null,
      hora: '07:56',
      candidatos: [{ id: 'f1', nome: 'Ana Souza', tipoPessoa: 'FISCAL' }],
    });

    render(<RegistroPontoScreen />);
    fireEvent.press(screen.getByText('Tirar foto do comprovante'));

    // Sugere o colaborador lido; ao escolher, abre o formulário com a hora.
    fireEvent.press(await screen.findByText('Ana Souza'));
    expect(await screen.findByText('Registrar batida')).toBeTruthy();
    expect(pontoService.lerComprovante).toHaveBeenCalledWith({
      texto: 'FUNCIONARIO ANA SOUZA 07:56',
    });
  });
});
