/**
 * Teste da seção Contratos: renderiza os cards com etiqueta/tempo de casa e o
 * resumo; expõe os botões de decisão apenas com `CONTRATOS_GERIR`.
 */
import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { ContratosScreen } from './ContratosScreen';

jest.mock('../../api/services', () => ({
  contratosService: {
    listar: jest.fn(),
    resumo: jest.fn(),
    definirAdmissao: jest.fn(),
    decidir: jest.fn(),
  },
  colaboradoresService: {
    inativar: jest.fn(() => Promise.resolve()),
  },
}));

const mockAuth = { permitir: true };
jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ podeAcessar: () => mockAuth.permitir }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { contratosService } = require('../../api/services');

const CARD_VENCENDO = {
  colaboradorId: 'c1',
  nome: 'Bia Vence',
  matricula: '2',
  funcao: 'OPERADOR',
  dataAdmissao: '2026-05-20',
  diasDeCasa: 42,
  estado: 'EXPERIENCIA',
  etiqueta: 'experiencia',
  urgencia: 'CRITICO',
  proximoMarco: 'MARCO_45',
  dataProximoMarco: '2026-07-04',
  diasParaProximoMarco: 3,
  efetivadoPorDecurso: false,
  decisao45: null,
  decisao90: null,
};

const RESUMO = {
  total: 1,
  emExperiencia: 1,
  efetivados: 0,
  encerrados: 0,
  semAdmissao: 0,
  vencendoSemana: 1,
};

function render_() {
  const route = { params: undefined } as never;
  const navigation = { navigate: jest.fn() } as never;
  return render(<ContratosScreen route={route} navigation={navigation} />);
}

describe('ContratosScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.permitir = true;
    contratosService.listar.mockResolvedValue([CARD_VENCENDO]);
    contratosService.resumo.mockResolvedValue(RESUMO);
  });

  it('mostra o card com a etapa (45D) e o status da 1ª etapa', async () => {
    render_();
    expect(await screen.findByText('Bia Vence')).toBeTruthy();
    // Com 42 dias de casa está na 1ª etapa: o selo mostra "45D".
    expect(screen.getByText('45D')).toBeTruthy();
    expect(
      screen.getByText('Em experiência · 42 de 45 dias (1ª etapa).'),
    ).toBeTruthy();
  });

  it('mostra a etapa "90D" quando já passou dos 45 dias', async () => {
    contratosService.listar.mockResolvedValue([
      { ...CARD_VENCENDO, diasDeCasa: 70, proximoMarco: 'MARCO_90' },
    ]);
    render_();
    await screen.findByText('Bia Vence');
    expect(screen.getByText('90D')).toBeTruthy();
    expect(screen.getByText('Em experiência · 70 de 90 dias.')).toBeTruthy();
  });

  it('com CONTRATOS_GERIR, permite editar admissão e encerrar um contrato em experiência', async () => {
    mockAuth.permitir = true;
    render_();
    await screen.findByText('Bia Vence');
    expect(screen.queryByText('Aprovar 45 dias')).toBeNull();
    expect(screen.queryByText('Reprovar')).toBeNull();
    expect(screen.getByText('Editar admissão')).toBeTruthy();
    expect(screen.getByText('Encerrar contrato')).toBeTruthy();
  });

  it('NÃO exibe "Encerrar contrato" para colaborador já efetivado', async () => {
    contratosService.listar.mockResolvedValue([
      {
        ...CARD_VENCENDO,
        diasDeCasa: 120,
        estado: 'EFETIVADO',
        etiqueta: 'efetivado',
        urgencia: 'OK',
        proximoMarco: null,
        dataProximoMarco: null,
        diasParaProximoMarco: null,
        efetivadoPorDecurso: true,
      },
    ]);
    mockAuth.permitir = true;
    render_();
    await screen.findByText('Bia Vence');
    expect(screen.getByText('Editar admissão')).toBeTruthy();
    expect(screen.queryByText('Encerrar contrato')).toBeNull();
  });

  it('sem permissão de gestão, NÃO exibe botões de decisão', async () => {
    mockAuth.permitir = false;
    render_();
    await screen.findByText('Bia Vence');
    await waitFor(() =>
      expect(screen.queryByText('Aprovar 45 dias')).toBeNull(),
    );
  });
});


/**
 * A carteira deixou de ser só de operadores (ADR 0024): o contrato de
 * experiência é da pessoa, e uma promoção não interrompe o prazo. Antes, promover
 * alguém o fazia desaparecer desta aba — e perder o alerta dos 90 dias.
 */
describe('ContratosScreen — a carteira cobre todo o quadro', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.permitir = true;
    contratosService.resumo.mockResolvedValue(RESUMO);
  });

  it('mostra o cargo de cada pessoa junto do tempo de casa', async () => {
    contratosService.listar.mockResolvedValue([
      { ...CARD_VENCENDO, colaboradorId: 'c2', nome: 'Diones', funcao: 'FISCAL' },
    ]);
    render_();

    await screen.findByText('Diones');
    expect(
      screen.getByText('Fiscal · desde 20/05/2026 · 42 dias de casa'),
    ).toBeTruthy();
  });

  it('traduz o cargo para a palavra da loja', async () => {
    // "Caixa" e "Supervisão" são como a equipe fala; OPERADOR/SUPERVISOR são
    // nomes de banco de dados.
    contratosService.listar.mockResolvedValue([
      { ...CARD_VENCENDO, colaboradorId: 'a', nome: 'Ana', funcao: 'OPERADOR' },
      {
        ...CARD_VENCENDO,
        colaboradorId: 'b',
        nome: 'Bruno',
        funcao: 'SUPERVISOR',
      },
    ]);
    render_();

    await screen.findByText('Ana');
    expect(screen.getByText(/^Caixa · desde/)).toBeTruthy();
    expect(screen.getByText(/^Supervisão · desde/)).toBeTruthy();
  });

  it('quem ainda não tem admissão aparece, com o cargo e o aviso', async () => {
    // Este balde é o que permite ao gestor completar o dado; esconder a pessoa
    // seria esconder o trabalho.
    contratosService.listar.mockResolvedValue([
      {
        ...CARD_VENCENDO,
        colaboradorId: 'c3',
        nome: 'Sem Data',
        funcao: 'FISCAL',
        dataAdmissao: null,
        estado: 'SEM_ADMISSAO',
        etiqueta: 'sem_admissao',
      },
    ]);
    render_();

    await screen.findByText('Sem Data');
    expect(screen.getByText('Fiscal · sem data de admissão')).toBeTruthy();
  });
});
