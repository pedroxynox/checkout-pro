/**
 * Gestão de colaboradores:
 * - pré-preenchimento do cadastro a partir da fila de "não reconhecidos";
 * - jornada por vigência (spec `jornada-5x2`, Fase 4): disponibilidade com
 *   "copiar a primeira para todas", grupo × folgas fixas, contrato só para o
 *   administrador, "Vale a partir de" e avisos; os campos antigos da ficha não
 *   são mais enviados.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { GestaoColaboradoresScreen } from './GestaoColaboradoresScreen';

jest.mock('../../api/services', () => ({
  colaboradoresService: {
    listar: jest.fn(),
    obter: jest.fn(),
    editar: jest.fn(),
    cadastrar: jest.fn(),
  },
  jornadaColaboradorService: { obter: jest.fn(), gravar: jest.fn() },
  tiposContratoService: { listar: jest.fn() },
}));

const mockAuth = { admin: false };
jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({
    podeAcessar: (f: string) => (f === 'ADMIN_DADOS' ? mockAuth.admin : true),
  }),
}));

const mockConfirmar = jest.fn();
const mockNotificar = jest.fn();
jest.mock('../../utils/dialogos', () => ({
  confirmar: (...a: unknown[]) => mockConfirmar(...a),
  notificar: (...a: unknown[]) => mockNotificar(...a),
}));

jest.mock('../../utils/formato', () => {
  const real = jest.requireActual('../../utils/formato');
  return { ...real, hojeISO: () => '2026-11-24' };
});

const {
  colaboradoresService,
  jornadaColaboradorService,
  tiposContratoService,
  // eslint-disable-next-line @typescript-eslint/no-var-requires
} = require('../../api/services');

const ANA = {
  id: 'c1',
  matricula: '1001',
  nome: 'Ana Souza',
  funcao: 'OPERADOR',
  genero: 'F',
  ativo: true,
  turno: 'ABERTURA',
  entradaSemana: '06:50',
  saidaSemana: '15:50',
  entradaFds: '06:50',
  saidaFds: '16:50',
  folgaDiaSemana: 3,
  grupoDomingo: 'G1',
  entradaDom: null,
  saidaDom: null,
  usuarioId: null,
  dataAdmissao: null,
  tipoContratoJornadaId: 'c6x1',
};

const CONTRATOS = [
  {
    id: 'c6x1',
    nome: '6x1 - 2x1',
    padrao: true,
    folgasPorSemana: 1,
    permiteFolgaSabado: false,
  },
  {
    id: 'c5x2',
    nome: '5x2 44h',
    padrao: false,
    folgasPorSemana: 2,
    permiteFolgaSabado: false,
  },
];

const SEM_VIGENCIA = {
  colaboradorId: 'c1',
  regimeHoje: 'LEGADO_6X1',
  vigente: null,
  contratoVigente: { id: 'c6x1', nome: '6x1 - 2x1', desde: null },
  historico: [],
  proximasFolgas: [],
};

function render_(params?: { matriculaInicial?: string; nomeInicial?: string }) {
  const route = { params } as never;
  const navigation = { navigate: jest.fn() } as never;
  return render(
    <GestaoColaboradoresScreen route={route} navigation={navigation} />,
  );
}

async function abrirAna() {
  render_();
  fireEvent.press(await screen.findByText('Ana Souza'));
  await screen.findByText(/Ainda no 6x1/);
}

function preencherSegunda(entrada: string, saida: string) {
  fireEvent.changeText(screen.getByLabelText('Seg entrada'), entrada);
  fireEvent.changeText(screen.getByLabelText('Seg saída'), saida);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.admin = false;
  mockConfirmar.mockResolvedValue(true);
  colaboradoresService.listar.mockResolvedValue([ANA]);
  colaboradoresService.obter.mockResolvedValue({ identificadores: [] });
  colaboradoresService.editar.mockResolvedValue(ANA);
  colaboradoresService.cadastrar.mockResolvedValue({ ...ANA, id: 'novo' });
  jornadaColaboradorService.obter.mockResolvedValue(SEM_VIGENCIA);
  jornadaColaboradorService.gravar.mockResolvedValue({
    vigencia: {},
    avisos: [
      {
        tipo: 'DIA_SEM_HORARIO',
        diaSemana: 6,
        mensagem: 'Sem horário na sábado: nesse dia o sistema não cobra ponto.',
      },
    ],
  });
  tiposContratoService.listar.mockResolvedValue(CONTRATOS);
});

describe('GestaoColaboradoresScreen — pré-preenchimento', () => {
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

describe('GestaoColaboradoresScreen — jornada (5x2)', () => {
  it('sem os campos antigos: nada de folga fixa nem blocos Seg–Qui/Sex–Sáb/Dom', async () => {
    await abrirAna();
    expect(screen.queryByText('Dia de folga')).toBeNull();
    expect(screen.queryByText('Entrada Seg–Qui')).toBeNull();
    expect(screen.queryByText('Grupo de domingo (rodízio)')).toBeNull();
    expect(screen.getByText('Disponibilidade')).toBeTruthy();
    // Sem mudança na jornada, não pede a data.
    expect(screen.queryByText('Vale a partir de')).toBeNull();
  });

  it('grava a vigência com a data sugerida, sem campos legados no PATCH, e mostra os avisos', async () => {
    await abrirAna();
    preencherSegunda('06:50', '16:38');
    fireEvent.press(screen.getByLabelText('Copiar a primeira para todas'));
    expect(screen.getByLabelText('Dom saída').props.value).toBe('16:38');
    fireEvent.press(screen.getByLabelText('Grupo G1'));

    // Quem ainda está no 6x1 recebe 23/11 (data do corte).
    expect(screen.getByDisplayValue('23/11/2026')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(colaboradoresService.editar).toHaveBeenCalled());
    expect(mockConfirmar).toHaveBeenCalled();
    expect(jornadaColaboradorService.gravar).toHaveBeenCalledWith('c1', {
      aPartirDe: '2026-11-23',
      grupo: 'G1',
      folgasFixas: [],
      disponibilidade: [1, 2, 3, 4, 5, 6, 0].map((diaSemana) => ({
        diaSemana,
        entrada: '06:50',
        saida: '16:38',
      })),
    });
    const patch = colaboradoresService.editar.mock.calls[0][1];
    for (const campo of [
      'folgaDiaSemana',
      'entradaSemana',
      'saidaSemana',
      'entradaFds',
      'saidaFds',
      'entradaDom',
      'saidaDom',
      'grupoDomingo',
      'tipoContratoJornadaId',
    ]) {
      expect(patch).not.toHaveProperty(campo);
    }
    expect(mockNotificar).toHaveBeenCalledWith(
      'Salvo com avisos',
      expect.stringContaining('Sem horário na sábado'),
    );
  });

  it('"Folgas fixas" só aparece sem grupo', async () => {
    await abrirAna();
    expect(screen.getByText('Folgas fixas')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Grupo G2'));
    expect(screen.queryByText('Folgas fixas')).toBeNull();
    fireEvent.press(screen.getByLabelText('Sem grupo'));
    expect(screen.getByText('Folgas fixas')).toBeTruthy();
  });

  it('não grava com horário pela metade', async () => {
    await abrirAna();
    preencherSegunda('06:50', '');
    fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(mockNotificar).toHaveBeenCalledWith(
        'Falta completar a jornada',
        expect.stringContaining('Seg: informe entrada e saída'),
      ),
    );
    expect(jornadaColaboradorService.gravar).not.toHaveBeenCalled();
    expect(colaboradoresService.editar).not.toHaveBeenCalled();
  });

  it('quem não é administrador vê o contrato, mas não troca (e não o envia)', async () => {
    await abrirAna();
    expect(screen.getByText(/só o administrador troca/)).toBeTruthy();
    expect(screen.queryByLabelText('Contrato 5x2 44h')).toBeNull();
    expect(tiposContratoService.listar).not.toHaveBeenCalled();
  });

  it('o administrador escolhe o contrato e ele vai na vigência', async () => {
    mockAuth.admin = true;
    await abrirAna();
    fireEvent.press(await screen.findByLabelText('Contrato 5x2 44h'));
    fireEvent.press(screen.getByLabelText('Folga Qua'));
    fireEvent.press(screen.getByLabelText('Folga Dom'));
    preencherSegunda('06:50', '16:38');
    fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(jornadaColaboradorService.gravar).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({
          tipoContratoJornadaId: 'c5x2',
          grupo: null,
          folgasFixas: [3, 0],
        }),
      ),
    );
  });

  it('cadastro novo com jornada manda o bloco; sem data, o backend usa a admissão', async () => {
    render_();
    fireEvent.press(await screen.findByText('Adicionar colaborador'));
    fireEvent.changeText(screen.getByPlaceholderText('Nome completo'), 'Bia');
    fireEvent.changeText(screen.getByPlaceholderText('Ex.: 232152'), '2002');
    fireEvent.press(screen.getByText('Abertura'));
    preencherSegunda('06:50', '16:38');
    fireEvent.press(screen.getByLabelText('Grupo G3'));
    fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(colaboradoresService.cadastrar).toHaveBeenCalled());
    const corpo = colaboradoresService.cadastrar.mock.calls[0][0];
    expect(corpo.jornada).toEqual({
      aPartirDe: undefined,
      grupo: 'G3',
      folgasFixas: [],
      disponibilidade: [{ diaSemana: 1, entrada: '06:50', saida: '16:38' }],
    });
    expect(corpo).not.toHaveProperty('folgaDiaSemana');
    expect(corpo).not.toHaveProperty('tipoContratoJornadaId');
  });
});
