/**
 * Testes da seção "Feedforward" do perfil do colaborador: permissões, revisão
 * de ponto (modal com observação), remoção de rodada, envio de foto numa rodada
 * já salva e impressão (formulário em branco, histórico e rodada).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { FeedforwardSecao } from './FeedforwardSecao';

jest.mock('../../api/services', () => ({
  feedforwardService: {
    doColaborador: jest.fn(),
    criar: jest.fn(),
    enviarFoto: jest.fn(),
    revisarPonto: jest.fn(),
    remover: jest.fn(),
  },
}));

// Permissões controláveis por teste.
const mockPermissoes: Record<string, boolean> = {
  FEEDFORWARD_VISUALIZAR: true,
  FEEDFORWARD_GERIR: true,
};
jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ podeAcessar: (f: string) => !!mockPermissoes[f] }),
}));

jest.mock('../../utils/dialogos', () => ({
  confirmar: jest.fn(),
  notificar: jest.fn(),
}));

jest.mock('../../utils/impressao', () => ({
  imprimirRelatorio: jest.fn(() => Promise.resolve()),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { feedforwardService } = require('../../api/services');
const { confirmar, notificar } = require('../../utils/dialogos');
const { imprimirRelatorio } = require('../../utils/impressao');
const ImagePicker = require('expo-image-picker');
/* eslint-enable @typescript-eslint/no-var-requires */

const COLAB = { nome: 'Ana Souza', matricula: '123', funcao: 'OPERADOR' };

const RODADAS = [
  {
    id: 'r1',
    colaboradorId: 'c1',
    data: '2026-10-01T00:00:00.000Z',
    liderNome: 'Carlos Lima',
    cargo: 'OPERADOR',
    pontosFortes: 'Simpatia com os clientes',
    oportunidades: null,
    compromissoFinal: null,
    evolucaoNota: 4,
    fotoUrl: null,
    criadoEm: '2026-10-01T12:00:00.000Z',
    pontos: [
      {
        id: 'p1',
        descricao: 'Agilizar o atendimento',
        prazo: '2026-11-01T00:00:00.000Z',
        status: 'PENDENTE',
        situacao: 'EM_DIA',
        revisadoPorNome: null,
        revisadoEm: null,
        observacaoRevisao: null,
      },
      {
        id: 'p2',
        descricao: 'Conferir o troco',
        prazo: '2026-10-05T00:00:00.000Z',
        status: 'ATINGIDO',
        situacao: 'ATINGIDO',
        revisadoPorNome: 'Bia Supervisora',
        revisadoEm: '2026-10-06T15:00:00.000Z',
        observacaoRevisao: 'Evoluiu muito',
      },
    ],
  },
];

function renderizar(): void {
  render(<FeedforwardSecao colaboradorId="c1" colaborador={COLAB} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissoes.FEEDFORWARD_VISUALIZAR = true;
  mockPermissoes.FEEDFORWARD_GERIR = true;
  feedforwardService.doColaborador.mockResolvedValue(RODADAS);
  feedforwardService.revisarPonto.mockResolvedValue({});
  feedforwardService.remover.mockResolvedValue(undefined);
  feedforwardService.enviarFoto.mockResolvedValue(RODADAS[0]);
  confirmar.mockResolvedValue(true);
});

describe('FeedforwardSecao — permissões e listagem', () => {
  it('sem FEEDFORWARD_VISUALIZAR não renderiza nada nem busca dados', () => {
    mockPermissoes.FEEDFORWARD_VISUALIZAR = false;
    renderizar();
    expect(screen.queryByText('Feedforward')).toBeNull();
    expect(feedforwardService.doColaborador).not.toHaveBeenCalled();
  });

  it('lista as rodadas com pontos, revisão e observação', async () => {
    renderizar();
    expect(await screen.findByText('Agilizar o atendimento')).toBeTruthy();
    expect(feedforwardService.doColaborador).toHaveBeenCalledWith('c1');
    expect(screen.getByText('Líder: Carlos Lima')).toBeTruthy();
    expect(screen.getByText('Simpatia com os clientes')).toBeTruthy();
    expect(screen.getByText(/Revisado por Bia Supervisora/)).toBeTruthy();
    expect(screen.getByText('“Evoluiu muito”')).toBeTruthy();
  });

  it('sem rodadas mostra o vazio e esconde "Imprimir histórico"', async () => {
    feedforwardService.doColaborador.mockResolvedValue([]);
    renderizar();
    expect(
      await screen.findByText(
        'Ainda não há feedforward registrado para este colaborador.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Imprimir histórico')).toBeNull();
    expect(screen.getByText('Imprimir formulário')).toBeTruthy();
  });

  it('sem FEEDFORWARD_GERIR esconde as ações de gestão', async () => {
    mockPermissoes.FEEDFORWARD_GERIR = false;
    renderizar();
    await screen.findByText('Agilizar o atendimento');
    expect(screen.queryByText('Nova rodada de feedforward')).toBeNull();
    expect(
      screen.queryByLabelText('Remover esta rodada de feedforward'),
    ).toBeNull();
    expect(screen.queryByText('Da galeria')).toBeNull();
    fireEvent.press(screen.getByText('Agilizar o atendimento'));
    expect(screen.queryByText('Revisar ponto')).toBeNull();
    // A impressão continua disponível para quem só visualiza.
    expect(screen.getByText('Imprimir histórico')).toBeTruthy();
  });
});

describe('FeedforwardSecao — revisão de ponto', () => {
  it('abre o modal, envia o resultado com observação e recarrega', async () => {
    renderizar();
    fireEvent.press(await screen.findByText('Agilizar o atendimento'));
    expect(screen.getByText('Revisar ponto')).toBeTruthy();

    fireEvent.press(screen.getByText('Não atingido'));
    fireEvent.changeText(
      screen.getByPlaceholderText('Como foi a evolução neste ponto…'),
      '  Precisa de mais prática  ',
    );
    fireEvent.press(screen.getByText('Salvar revisão'));

    await waitFor(() =>
      expect(feedforwardService.revisarPonto).toHaveBeenCalledWith(
        'p1',
        'NAO_ATINGIDO',
        'Precisa de mais prática',
      ),
    );
    await waitFor(() =>
      expect(feedforwardService.doColaborador).toHaveBeenCalledTimes(2),
    );
    expect(screen.queryByText('Salvar revisão')).toBeNull();
  });

  it('sem observação envia undefined e o padrão é "Atingido"', async () => {
    renderizar();
    fireEvent.press(await screen.findByText('Agilizar o atendimento'));
    fireEvent.press(screen.getByText('Salvar revisão'));
    await waitFor(() =>
      expect(feedforwardService.revisarPonto).toHaveBeenCalledWith(
        'p1',
        'ATINGIDO',
        undefined,
      ),
    );
  });

  it('ponto já revisado não abre o modal', async () => {
    renderizar();
    fireEvent.press(await screen.findByText('Conferir o troco'));
    expect(screen.queryByText('Revisar ponto')).toBeNull();
  });

  it('falha na revisão avisa o usuário e mantém o modal aberto', async () => {
    feedforwardService.revisarPonto.mockRejectedValue(new Error('x'));
    renderizar();
    fireEvent.press(await screen.findByText('Agilizar o atendimento'));
    fireEvent.press(screen.getByText('Salvar revisão'));
    await waitFor(() =>
      expect(notificar).toHaveBeenCalledWith('Erro', 'Falha ao revisar.'),
    );
    expect(screen.getByText('Salvar revisão')).toBeTruthy();
  });

  it('cancelar fecha o modal sem enviar', async () => {
    renderizar();
    fireEvent.press(await screen.findByText('Agilizar o atendimento'));
    fireEvent.press(screen.getByText('Cancelar'));
    expect(screen.queryByText('Salvar revisão')).toBeNull();
    expect(feedforwardService.revisarPonto).not.toHaveBeenCalled();
  });
});

describe('FeedforwardSecao — remover rodada', () => {
  it('remove depois de confirmar e recarrega', async () => {
    renderizar();
    fireEvent.press(
      await screen.findByLabelText('Remover esta rodada de feedforward'),
    );
    await waitFor(() =>
      expect(feedforwardService.remover).toHaveBeenCalledWith('r1'),
    );
    expect(confirmar).toHaveBeenCalledWith(
      'Remover feedforward',
      expect.stringContaining('01/10/2026'),
      'Remover',
    );
    await waitFor(() =>
      expect(feedforwardService.doColaborador).toHaveBeenCalledTimes(2),
    );
  });

  it('não remove se o usuário cancelar a confirmação', async () => {
    confirmar.mockResolvedValue(false);
    renderizar();
    fireEvent.press(
      await screen.findByLabelText('Remover esta rodada de feedforward'),
    );
    await waitFor(() => expect(confirmar).toHaveBeenCalled());
    expect(feedforwardService.remover).not.toHaveBeenCalled();
  });
});

describe('FeedforwardSecao — foto de rodada já salva', () => {
  it('envia a foto escolhida na galeria para a rodada', async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///f.jpg', fileName: 'f.jpg', mimeType: 'image/jpeg' }],
    });
    renderizar();
    fireEvent.press(await screen.findByText('Da galeria'));
    await waitFor(() =>
      expect(feedforwardService.enviarFoto).toHaveBeenCalledWith('r1', {
        uri: 'file:///f.jpg',
        name: 'f.jpg',
        mimeType: 'image/jpeg',
      }),
    );
  });

  it('se o usuário cancelar a escolha, não envia nada', async () => {
    renderizar();
    fireEvent.press(await screen.findByText('Tirar foto'));
    await waitFor(() =>
      expect(ImagePicker.launchCameraAsync).toHaveBeenCalled(),
    );
    expect(feedforwardService.enviarFoto).not.toHaveBeenCalled();
  });

  it('sem permissão de galeria avisa e não abre o seletor', async () => {
    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce({
      granted: false,
    });
    renderizar();
    fireEvent.press(await screen.findByText('Da galeria'));
    await waitFor(() =>
      expect(notificar).toHaveBeenCalledWith(
        'Permissão necessária',
        expect.any(String),
      ),
    );
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });
});

describe('FeedforwardSecao — impressão', () => {
  it('imprime o formulário em branco já com o nome do colaborador', async () => {
    renderizar();
    fireEvent.press(await screen.findByText('Imprimir formulário'));
    await waitFor(() => expect(imprimirRelatorio).toHaveBeenCalledTimes(1));
    const html = imprimirRelatorio.mock.calls[0][0] as string;
    expect(html).toContain('Formulário de feedforward');
    expect(html).toContain('Ana Souza');
  });

  it('imprime o histórico completo', async () => {
    renderizar();
    fireEvent.press(await screen.findByText('Imprimir histórico'));
    await waitFor(() => expect(imprimirRelatorio).toHaveBeenCalledTimes(1));
    const html = imprimirRelatorio.mock.calls[0][0] as string;
    expect(html).toContain('Histórico de feedforward');
    expect(html).toContain('Agilizar o atendimento');
  });

  it('imprime uma rodada específica', async () => {
    renderizar();
    fireEvent.press(
      await screen.findByLabelText('Imprimir esta rodada de feedforward'),
    );
    await waitFor(() => expect(imprimirRelatorio).toHaveBeenCalledTimes(1));
    const html = imprimirRelatorio.mock.calls[0][0] as string;
    expect(html).toContain('Rodada de feedforward');
    expect(html).toContain('Assinatura do(a) líder');
  });

  it('falha ao abrir a impressão avisa o usuário', async () => {
    imprimirRelatorio.mockRejectedValueOnce(new Error('sem impressora'));
    renderizar();
    fireEvent.press(await screen.findByText('Imprimir formulário'));
    await waitFor(() =>
      expect(notificar).toHaveBeenCalledWith(
        'Erro',
        'Não foi possível abrir a impressão do feedforward.',
      ),
    );
  });
});
