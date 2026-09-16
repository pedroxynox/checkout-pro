/**
 * Tela de publicar escala: prévia do dia e da semana, geração do PDF e da
 * imagem, e o aviso de compressão do WhatsApp.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { EscalaScreen } from './EscalaScreen';

jest.mock('../../api/services', () => ({
  escalaExportacaoService: { dia: jest.fn(), semana: jest.fn() },
}));

jest.mock('../../config/ConfigSistemaContext', () => ({
  useConfigSistema: () => ({ dataInicial: '2026-01-01' }),
}));

jest.mock('../../utils/impressao', () => ({
  imprimirRelatorio: jest.fn(() => Promise.resolve()),
}));

// A imagem depende de canvas (navegador); o suporte é alternado nos testes.
let mockSuportaImagem = true;
jest.mock('../../utils/imagemEscala', () => ({
  suportaImagemPng: () => mockSuportaImagem,
  baixarEscalaComoPng: jest.fn(() => Promise.resolve()),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { escalaExportacaoService } = require('../../api/services');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { imprimirRelatorio } = require('../../utils/impressao');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { baixarEscalaComoPng } = require('../../utils/imagemEscala');

const DIA = {
  dataISO: '2026-07-21',
  diaSemana: 2,
  ehFeriado: false,
  nomeFeriado: null,
  grupoFolgaDomingo: null,
  semFolgaNoCadastro: [],
  totais: { trabalhando: 1, folgas: 1, faltas: 0, atestados: 0, ferias: 0 },
  secoes: [
    {
      funcao: 'OPERADOR',
      linhas: [
        {
          colaboradorId: 'o1',
          nome: 'Ana Souza',
          funcao: 'OPERADOR',
          turno: 'ABERTURA',
          status: 'TRABALHA',
          entrada: '07:00',
          saida: '15:20',
          horarioEspecial: false,
        },
        {
          colaboradorId: 'o2',
          nome: 'Bruno Lima',
          funcao: 'OPERADOR',
          turno: null,
          status: 'FOLGA',
          entrada: null,
          saida: null,
          horarioEspecial: false,
        },
      ],
    },
  ],
};

const SEMANA = {
  inicioISO: '2026-07-20',
  fimISO: '2026-07-26',
  semFolgaNoCadastro: [],
  dias: [1, 2, 3, 4, 5, 6, 0].map((dow, i) => ({
    dataISO: `2026-07-${20 + i}`,
    diaSemana: dow,
    ehFeriado: false,
    nomeFeriado: null,
  })),
  secoes: [
    {
      funcao: 'OPERADOR',
      pessoas: [
        {
          colaboradorId: 'o1',
          nome: 'Ana Souza',
          funcao: 'OPERADOR',
          turno: 'ABERTURA',
          celulas: [
            { status: 'FOLGA', entrada: null, saida: null },
            { status: 'TRABALHA', entrada: '07:00', saida: '15:20' },
            { status: 'TRABALHA', entrada: '07:00', saida: '15:20' },
            { status: 'TRABALHA', entrada: '07:00', saida: '15:20' },
            { status: 'TRABALHA', entrada: '08:00', saida: '17:20' },
            { status: 'TRABALHA', entrada: '08:00', saida: '17:20' },
            { status: 'TRABALHA', entrada: '09:00', saida: '16:20' },
          ],
        },
      ],
    },
  ],
};

describe('EscalaScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSuportaImagem = true;
    escalaExportacaoService.dia.mockResolvedValue(DIA);
    escalaExportacaoService.semana.mockResolvedValue(SEMANA);
  });

  it('mostra a prévia do dia com nome, horário e quem folga', async () => {
    render(<EscalaScreen />);

    expect(await screen.findByText('Ana Souza')).toBeTruthy();
    expect(screen.getByText('07:00 – 15:20')).toBeTruthy();
    // Quem folga aparece: é o que evita a pergunta "eu trabalho hoje?".
    expect(screen.getByText('Bruno Lima')).toBeTruthy();
    expect(screen.getByText('Folga')).toBeTruthy();
  });

  it('gera o PDF com o desenho da escala', async () => {
    render(<EscalaScreen />);
    await screen.findByText('Ana Souza');

    fireEvent.press(screen.getByText('Baixar PDF'));

    await waitFor(() => expect(imprimirRelatorio).toHaveBeenCalled());
    const html = imprimirRelatorio.mock.calls[0][0];
    expect(html).toContain('<svg');
    expect(html).toContain('Ana Souza');
  });

  it('gera a imagem com nome de arquivo previsível', async () => {
    render(<EscalaScreen />);
    await screen.findByText('Ana Souza');

    fireEvent.press(screen.getByText('Baixar imagem 4K'));

    await waitFor(() => expect(baixarEscalaComoPng).toHaveBeenCalled());
    expect(baixarEscalaComoPng.mock.calls[0][1]).toBe('escala-dia-2026-07-21.png');
  });

  it('avisa para enviar como documento no WhatsApp', async () => {
    // Sem o aviso, a escala chega recomprimida e o 4K não serve para nada.
    render(<EscalaScreen />);

    expect(await screen.findByText(/recomprimida/)).toBeTruthy();
  });

  it('sem canvas (no aplicativo), esconde a imagem e aponta o PDF', async () => {
    mockSuportaImagem = false;

    render(<EscalaScreen />);
    await screen.findByText('Ana Souza');

    expect(screen.queryByText('Baixar imagem 4K')).toBeNull();
    expect(screen.getByText(/gerada pelo navegador/)).toBeTruthy();
  });

  it('troca para a semana e mostra a grade dos sete dias', async () => {
    render(<EscalaScreen />);
    await screen.findByText('Ana Souza');

    fireEvent.press(screen.getByText('Semana'));

    await waitFor(() => expect(escalaExportacaoService.semana).toHaveBeenCalled());
    expect(
      await screen.findByText(/Semana de 20\/07\/2026 a 26\/07\/2026/),
    ).toBeTruthy();
  });
});


/**
 * O aviso de ficha sem folga (ADR 0023). Sem dia de folga no cadastro a pessoa é
 * escalada os sete dias e pode receber falta automática num dia em que estava
 * descansando — e a tela mostrava "trabalha" sem nenhum sinal de que faltava um
 * dado. O aviso vem ANTES do cartão de publicar, porque publicar uma escala assim
 * é justamente o erro que ele existe para impedir.
 */
describe('EscalaScreen — aviso de ficha sem folga', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSuportaImagem = true;
  });

  it('nomeia quem está sem dia de folga e diz o que fazer', async () => {
    escalaExportacaoService.dia.mockResolvedValue({
      ...DIA,
      semFolgaNoCadastro: [
        { colaboradorId: 'c2', nome: 'Diones Alves', funcao: 'FISCAL' },
      ],
    });
    render(<EscalaScreen />);

    await screen.findByText('1 pessoa está sem dia de folga no cadastro');
    // O nome é o que torna o aviso acionável.
    expect(screen.getByText('Diones Alves · Fiscais')).toBeTruthy();
    expect(
      screen.getByText(/Controle → Colaboradores → editar a pessoa/),
    ).toBeTruthy();
  });

  it('explica a consequência, não só o dado que falta', async () => {
    escalaExportacaoService.dia.mockResolvedValue({
      ...DIA,
      semFolgaNoCadastro: [
        { colaboradorId: 'c2', nome: 'Diones Alves', funcao: 'FISCAL' },
        { colaboradorId: 'c3', nome: 'Carla Dias', funcao: 'OPERADOR' },
      ],
    });
    render(<EscalaScreen />);

    await screen.findByText('2 pessoas estão sem dia de folga no cadastro');
    expect(
      screen.getByText(/pode marcar falta num dia em que estavam descansando/),
    ).toBeTruthy();
  });

  it('não aparece nada quando o time todo tem o dia preenchido', async () => {
    escalaExportacaoService.dia.mockResolvedValue(DIA);
    render(<EscalaScreen />);

    await screen.findByText('Enviar para a equipe');
    expect(screen.queryByText(/sem dia de folga no cadastro/)).toBeNull();
  });

  it('o mesmo aviso acompanha a grade da semana', async () => {
    escalaExportacaoService.dia.mockResolvedValue(DIA);
    escalaExportacaoService.semana.mockResolvedValue({
      ...SEMANA,
      semFolgaNoCadastro: [
        { colaboradorId: 'c2', nome: 'Diones Alves', funcao: 'FISCAL' },
      ],
    });
    render(<EscalaScreen />);

    fireEvent.press(await screen.findByText('Semana'));

    await screen.findByText('1 pessoa está sem dia de folga no cadastro');
  });
});
