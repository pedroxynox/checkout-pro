/**
 * Testes da seção "Feedforward" do perfil do colaborador: permissões, revisão
 * de ponto (modal com observação), remoção de rodada, envio de foto numa rodada
 * já salva e impressão (formulário em branco, histórico e rodada).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { FeedforwardSecao } from './FeedforwardSecao';
import { prazoMinimoProrrogacao, somarDiasISO } from './ModalRevisarPonto';

jest.mock('../../api/services', () => ({
  feedforwardService: {
    doColaborador: jest.fn(),
    criar: jest.fn(),
    enviarFoto: jest.fn(),
    revisarPonto: jest.fn(),
    remover: jest.fn(),
    editar: jest.fn(),
    adicionarPonto: jest.fn(),
    editarPonto: jest.fn(),
    prorrogarPonto: jest.fn(),
    removerPonto: jest.fn(),
  },
}));

// "Hoje" determinístico (prazos mínimos e padrões dependem dele).
jest.mock('../../utils/formato', () => {
  const real = jest.requireActual('../../utils/formato');
  return { ...real, hojeISO: () => '2026-10-14' };
});

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
  feedforwardService.editar.mockResolvedValue(RODADAS[0]);
  feedforwardService.adicionarPonto.mockResolvedValue({});
  feedforwardService.editarPonto.mockResolvedValue({});
  feedforwardService.prorrogarPonto.mockResolvedValue({});
  feedforwardService.removerPonto.mockResolvedValue(undefined);
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
    expect(screen.queryByText('Acompanhar ponto')).toBeNull();
    // A impressão continua disponível para quem só visualiza.
    expect(screen.getByText('Imprimir histórico')).toBeTruthy();
  });
});

describe('FeedforwardSecao — revisão de ponto', () => {
  it('abre o modal, envia o resultado com observação e recarrega', async () => {
    renderizar();
    fireEvent.press(await screen.findByText('Agilizar o atendimento'));
    expect(screen.getByText('Acompanhar ponto')).toBeTruthy();

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
    expect(screen.queryByText('Acompanhar ponto')).toBeNull();
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

describe('FeedforwardSecao — cargo e prorrogação exibidos', () => {
  it('mostra o cargo da rodada', async () => {
    renderizar();
    expect(
      await screen.findByText('Cargo na data: Operador(a) de caixa'),
    ).toBeTruthy();
  });

  it('mostra quantas vezes o ponto foi prorrogado, o prazo original e o motivo', async () => {
    feedforwardService.doColaborador.mockResolvedValue([
      {
        ...RODADAS[0],
        pontos: [
          {
            ...RODADAS[0].pontos[0],
            prorrogacoes: 2,
            prazoOriginal: '2026-10-10T00:00:00.000Z',
            prorrogadoPorNome: 'Bia',
            motivoProrrogacao: 'Férias no período',
          },
        ],
      },
    ]);
    renderizar();
    expect(
      await screen.findByText(
        /Prorrogado 2x · prazo original 10\/10\/2026 · por Bia/,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Motivo: Férias no período/)).toBeTruthy();
  });
});

describe('FeedforwardSecao — prorrogar ponto', () => {
  it('prorroga com o prazo padrão (1 semana após o mínimo) e motivo', async () => {
    renderizar();
    fireEvent.press(await screen.findByText('Agilizar o atendimento'));
    fireEvent.press(screen.getByText('Prorrogar'));
    fireEvent.changeText(
      screen.getByPlaceholderText('Por que precisa de mais tempo…'),
      ' Precisa de mais prática ',
    );
    fireEvent.press(screen.getByText('Prorrogar prazo'));
    // prazo atual 01/11 → mínimo 02/11 → padrão 08/11
    await waitFor(() =>
      expect(feedforwardService.prorrogarPonto).toHaveBeenCalledWith(
        'p1',
        '2026-11-08',
        'Precisa de mais prática',
      ),
    );
    await waitFor(() =>
      expect(feedforwardService.doColaborador).toHaveBeenCalledTimes(2),
    );
  });

  it('permite avançar o novo prazo pelo seletor de data', async () => {
    renderizar();
    fireEvent.press(await screen.findByText('Agilizar o atendimento'));
    fireEvent.press(screen.getByText('Prorrogar'));
    fireEvent.press(screen.getByLabelText('Próximo dia'));
    fireEvent.press(screen.getByText('Prorrogar prazo'));
    await waitFor(() =>
      expect(feedforwardService.prorrogarPonto).toHaveBeenCalledWith(
        'p1',
        '2026-11-09',
        undefined,
      ),
    );
  });

  it('erro do servidor é mostrado ao usuário', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ApiError } = require('../../api/client');
    feedforwardService.prorrogarPonto.mockRejectedValue(
      new ApiError(400, 'O novo prazo deve ser uma data futura.'),
    );
    renderizar();
    fireEvent.press(await screen.findByText('Agilizar o atendimento'));
    fireEvent.press(screen.getByText('Prorrogar'));
    fireEvent.press(screen.getByText('Prorrogar prazo'));
    await waitFor(() =>
      expect(notificar).toHaveBeenCalledWith(
        'Erro',
        'O novo prazo deve ser uma data futura.',
      ),
    );
  });
});

describe('FeedforwardSecao — editar e remover ponto', () => {
  it('salva a nova descrição do ponto', async () => {
    renderizar();
    fireEvent.press(await screen.findByText('Agilizar o atendimento'));
    fireEvent.press(screen.getByText('Editar'));
    fireEvent.changeText(
      screen.getByDisplayValue('Agilizar o atendimento'),
      '  Atender com mais agilidade ',
    );
    fireEvent.press(screen.getByText('Salvar descrição'));
    await waitFor(() =>
      expect(feedforwardService.editarPonto).toHaveBeenCalledWith(
        'p1',
        'Atender com mais agilidade',
      ),
    );
  });

  it('descrição curta demais não é enviada', async () => {
    renderizar();
    fireEvent.press(await screen.findByText('Agilizar o atendimento'));
    fireEvent.press(screen.getByText('Editar'));
    fireEvent.changeText(screen.getByDisplayValue('Agilizar o atendimento'), ' a ');
    fireEvent.press(screen.getByText('Salvar descrição'));
    expect(notificar).toHaveBeenCalledWith(
      'Descrição inválida',
      'Descreva o ponto a melhorar.',
    );
    expect(feedforwardService.editarPonto).not.toHaveBeenCalled();
  });

  it('remove o ponto depois de confirmar', async () => {
    renderizar();
    fireEvent.press(await screen.findByText('Agilizar o atendimento'));
    fireEvent.press(screen.getByText('Editar'));
    fireEvent.press(screen.getByText('Remover este ponto'));
    await waitFor(() =>
      expect(feedforwardService.removerPonto).toHaveBeenCalledWith('p1'),
    );
    expect(confirmar).toHaveBeenCalledWith(
      'Remover ponto',
      expect.stringContaining('Agilizar o atendimento'),
      'Remover',
    );
  });

  it('não remove o ponto se cancelar a confirmação', async () => {
    confirmar.mockResolvedValue(false);
    renderizar();
    fireEvent.press(await screen.findByText('Agilizar o atendimento'));
    fireEvent.press(screen.getByText('Editar'));
    fireEvent.press(screen.getByText('Remover este ponto'));
    await waitFor(() => expect(confirmar).toHaveBeenCalled());
    expect(feedforwardService.removerPonto).not.toHaveBeenCalled();
  });
});

describe('FeedforwardSecao — editar rodada', () => {
  it('salva os dados editados e os novos pontos', async () => {
    renderizar();
    fireEvent.press(
      await screen.findByLabelText('Editar esta rodada de feedforward'),
    );
    expect(screen.getByText('Editar rodada')).toBeTruthy();

    fireEvent.changeText(
      screen.getByDisplayValue('Simpatia com os clientes'),
      '  Muito simpática  ',
    );
    fireEvent.press(screen.getByLabelText('Nota 2'));
    fireEvent.press(screen.getByText('Adicionar ponto'));
    fireEvent.changeText(
      screen.getByPlaceholderText('O que precisa melhorar…'),
      ' Organizar a gaveta ',
    );
    fireEvent.press(screen.getByText('Salvar alterações'));

    await waitFor(() =>
      expect(feedforwardService.editar).toHaveBeenCalledWith('r1', {
        data: '2026-10-01',
        evolucaoNota: 2,
        pontosFortes: 'Muito simpática',
        oportunidades: '',
        compromissoFinal: '',
      }),
    );
    await waitFor(() =>
      expect(feedforwardService.adicionarPonto).toHaveBeenCalledWith('r1', {
        descricao: 'Organizar a gaveta',
        prazo: '2026-11-13', // hoje + 30 dias
      }),
    );
    await waitFor(() =>
      expect(feedforwardService.doColaborador).toHaveBeenCalledTimes(2),
    );
    expect(screen.queryByText('Editar rodada')).toBeNull();
  });

  it('"Sem nota" remove a nota e pontos novos vazios são ignorados', async () => {
    renderizar();
    fireEvent.press(
      await screen.findByLabelText('Editar esta rodada de feedforward'),
    );
    fireEvent.press(screen.getByText('Sem nota'));
    fireEvent.press(screen.getByText('Adicionar ponto'));
    fireEvent.press(screen.getByText('Salvar alterações'));
    await waitFor(() =>
      expect(feedforwardService.editar).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ evolucaoNota: null }),
      ),
    );
    expect(feedforwardService.adicionarPonto).not.toHaveBeenCalled();
  });

  it('falha ao salvar avisa e mantém o modal aberto', async () => {
    feedforwardService.editar.mockRejectedValue(new Error('x'));
    renderizar();
    fireEvent.press(
      await screen.findByLabelText('Editar esta rodada de feedforward'),
    );
    fireEvent.press(screen.getByText('Salvar alterações'));
    await waitFor(() =>
      expect(notificar).toHaveBeenCalledWith('Erro', 'Falha ao salvar.'),
    );
    expect(screen.getByText('Editar rodada')).toBeTruthy();
  });

  it('sem FEEDFORWARD_GERIR não mostra o botão de editar', async () => {
    mockPermissoes.FEEDFORWARD_GERIR = false;
    renderizar();
    await screen.findByText('Agilizar o atendimento');
    expect(
      screen.queryByLabelText('Editar esta rodada de feedforward'),
    ).toBeNull();
  });
});

describe('ModalRevisarPonto — regras de data', () => {
  it('somarDiasISO soma dias (com virada de mês/ano)', () => {
    expect(somarDiasISO('2026-10-14', 1)).toBe('2026-10-15');
    expect(somarDiasISO('2026-12-31T00:00:00.000Z', 1)).toBe('2027-01-01');
    expect(somarDiasISO('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('prazo mínimo é o maior entre (prazo atual + 1) e amanhã', () => {
    // prazo futuro → dia seguinte ao prazo
    expect(prazoMinimoProrrogacao('2026-11-01T00:00:00.000Z', '2026-10-14')).toBe(
      '2026-11-02',
    );
    // prazo vencido → amanhã
    expect(prazoMinimoProrrogacao('2026-10-01T00:00:00.000Z', '2026-10-14')).toBe(
      '2026-10-15',
    );
    // prazo hoje → amanhã
    expect(prazoMinimoProrrogacao('2026-10-14', '2026-10-14')).toBe('2026-10-15');
  });
});
