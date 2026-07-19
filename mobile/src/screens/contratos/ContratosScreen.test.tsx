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
