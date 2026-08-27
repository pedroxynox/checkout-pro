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

// Sem NavigationContainer no teste: mocka o hook de navegação. Os parâmetros da
// rota são configuráveis para exercitar o "modo correção" (chegada pelo
// relatório de marcações inválidas).
let mockParams: Record<string, unknown> = {};
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: mockGoBack }),
  useRoute: () => ({ params: mockParams }),
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
  // Usado só no modo correção, para saber qual é a próxima pendência.
  centralJornadaService: { marcacoesInvalidas: jest.fn() },
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
const {
  pontoService,
  fiscaisService,
  centralJornadaService,
} = require('../../api/services');

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
    mockParams = {};
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

  it('descreve o estado da jornada e explica o cálculo sob demanda', async () => {
    pontoService.jornadaDoDia.mockResolvedValue(JORNADA_QUATRO);

    render(<RegistroPontoScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('Digite o nome…'), 'Ana');
    fireEvent.press(await screen.findByText('Ana Souza'));

    // Estado diferenciado com uma frase que o explica (tarefa 47).
    expect(
      await screen.findByText('Jornada do dia concluída (finalizada).'),
    ).toBeTruthy();

    // A explicação do cálculo aparece só ao tocar em "Como é calculado?" (46).
    expect(screen.queryByText(/Trabalhado: soma dos períodos/)).toBeNull();
    fireEvent.press(screen.getByText('Como é calculado?'));
    expect(
      await screen.findByText(/Trabalhado: soma dos períodos/),
    ).toBeTruthy();
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

/**
 * Modo correção: a tela é aberta por um item do relatório de marcações
 * inválidas, já na pessoa e no dia daquele item.
 */
describe('RegistroPontoScreen — modo correção', () => {
  const PARAMS_CORRECAO = {
    correcaoColaboradorId: 'c1',
    correcaoNome: 'Ana Souza',
    correcaoData: '2026-06-29',
    correcaoFaltantes: ['ENTRADA'],
    correcaoEntradaPrevista: '08:00',
    correcaoCiclo: 0,
  };

  const ITEM_BRUNO = {
    colaboradorId: 'c2',
    nome: 'Bruno Lima',
    primeiroNome: 'Bruno',
    funcao: 'OPERADOR',
    data: '2026-06-27T00:00:00.000Z',
    diaSemana: 6,
    ehFeriado: false,
    entradaPrevista: '08:00',
    horasRegistradas: ['08:00'],
    esperadas: 4,
    registradas: 1,
    quantidadeFaltante: 3,
    tiposFaltantes: ['SAIDA_INTERVALO'],
    tiposPresentes: ['ENTRADA'],
    confianca: 'ALTA',
    observacao: null,
    detalhe: 'Falta registrar: saída para o intervalo',
    devidasMs: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { ...PARAMS_CORRECAO };
    // A pessoa é casada pela ficha do Cadastro (colaboradorId), não pelo id do
    // ponto: para fiscais os dois são diferentes.
    pontoService.buscarPessoas.mockResolvedValue([
      {
        id: 'f1',
        nome: 'Ana Souza',
        tipoPessoa: 'FISCAL',
        colaboradorId: 'c1',
      },
    ]);
    pontoService.jornadaDoDia.mockResolvedValue(JORNADA_VAZIA);
    pontoService.registrarBatida.mockResolvedValue(JORNADA_VAZIA);
    fiscaisService.meuResumo.mockResolvedValue(null);
    centralJornadaService.marcacoesInvalidas.mockResolvedValue({
      itens: [],
    });
  });

  it('abre na pessoa e no dia pedidos, dizendo qual marcação falta', async () => {
    render(<RegistroPontoScreen />);

    expect(await screen.findByText('Ajuste do ponto')).toBeTruthy();
    // O nome aparece no cartão do ajuste e no cabeçalho da pessoa selecionada.
    expect(screen.getAllByText('Ana Souza').length).toBeGreaterThan(0);
    expect(screen.getAllByText('29/06/2026').length).toBeGreaterThan(0);
    expect(screen.getByText('Falta registrar:')).toBeTruthy();

    // Sem busca manual: a jornada do dia certo já é carregada.
    await waitFor(() =>
      expect(pontoService.jornadaDoDia).toHaveBeenCalledWith(
        'f1',
        '2026-06-29',
        'FISCAL',
      ),
    );
  });

  it('oferece o turno previsto como sugestão, sem registrar sozinho', async () => {
    render(<RegistroPontoScreen />);
    await screen.findByText('Ajuste do ponto');

    fireEvent.press(screen.getByText(/Turno previsto 08:00/));

    // Preenche o campo e espera a confirmação: a escala diz o esperado, o valor
    // válido é o do comprovante.
    expect(await screen.findByDisplayValue('08:00')).toBeTruthy();
    expect(pontoService.registrarBatida).not.toHaveBeenCalled();
  });

  it('oferece a próxima pendência depois de lançar a batida', async () => {
    centralJornadaService.marcacoesInvalidas.mockResolvedValue({
      itens: [ITEM_BRUNO],
    });

    render(<RegistroPontoScreen />);
    await screen.findByText('Ajuste do ponto');
    await screen.findByText('Jornada do dia');

    fireEvent.press(screen.getByText(/Turno previsto 08:00/));
    fireEvent.press(screen.getByText('Registrar'));

    expect(
      await screen.findByText('Próxima: Bruno · 27/06/2026'),
    ).toBeTruthy();
  });

  it('segue no mesmo dia enquanto ele continuar incompleto', async () => {
    // Dia com duas marcações faltando: uma batida não fecha o dia, então a fila
    // não anda — só o aviso do que ainda falta é atualizado.
    centralJornadaService.marcacoesInvalidas.mockResolvedValue({
      itens: [
        {
          ...ITEM_BRUNO,
          colaboradorId: 'c1',
          nome: 'Ana Souza',
          primeiroNome: 'Ana',
          data: '2026-06-29T00:00:00.000Z',
          tiposFaltantes: ['ENCERRAMENTO'],
          detalhe: 'Falta registrar: encerramento',
        },
      ],
    });

    render(<RegistroPontoScreen />);
    await screen.findByText('Jornada do dia');

    fireEvent.press(screen.getByText(/Turno previsto 08:00/));
    fireEvent.press(screen.getByText('Registrar'));

    expect(await screen.findByText('Encerramento')).toBeTruthy();
    expect(screen.queryByText(/^Próxima:/)).toBeNull();
  });

  it('avisa quando a fila acaba', async () => {
    render(<RegistroPontoScreen />);
    await screen.findByText('Jornada do dia');

    fireEvent.press(screen.getByText(/Turno previsto 08:00/));
    fireEvent.press(screen.getByText('Registrar'));

    expect(
      await screen.findByText(
        'Fila concluída: não há mais marcações a ajustar neste ciclo.',
      ),
    ).toBeTruthy();
  });

  it('volta à lista pelo botão do cartão', async () => {
    render(<RegistroPontoScreen />);
    await screen.findByText('Ajuste do ponto');

    fireEvent.press(screen.getByText('Voltar à lista'));

    expect(mockGoBack).toHaveBeenCalled();
  });

  it('pede escolha manual quando não localiza a pessoa no ponto', async () => {
    // Nunca adivinha a pessoa: registrar batida no colaborador errado é pior do
    // que pedir uma confirmação.
    pontoService.buscarPessoas.mockResolvedValue([]);

    render(<RegistroPontoScreen />);

    expect(
      await screen.findByText(
        'Não localizei essa pessoa no Relógio Ponto. Escolha na busca abaixo para continuar.',
      ),
    ).toBeTruthy();
    expect(pontoService.jornadaDoDia).not.toHaveBeenCalled();
  });
});
