/**
 * Teste do histórico unificado de incidências no Perfil do Colaborador
 * (Fase 2 — faltas + "não retorno do intervalo").
 *
 * Verifica que o cartão "Histórico de incidências" renderiza o resumo e a
 * linha do tempo (faltas + não retorno) vindos do perfil, e que, com
 * permissão de gestão, os registros completos são buscados (para editar).
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { PerfilColaboradorScreen } from './PerfilColaboradorScreen';

jest.mock('../../api/services', () => ({
  colaboradoresService: { perfil: jest.fn() },
  escalaService: {
    listarIncidencias: jest.fn(),
    editarIncidencia: jest.fn(),
    removerIncidencia: jest.fn(),
  },
}));

jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ podeAcessar: () => true }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { colaboradoresService, escalaService } = require('../../api/services');

const PERFIL = {
  colaborador: {
    id: 'c1',
    nome: 'Ana Souza',
    matricula: '123',
    login: null,
    funcao: 'FISCAL',
    genero: 'F',
    ativo: true,
    turno: null,
    entradaSemana: null,
    saidaSemana: null,
    entradaFds: null,
    saidaFds: null,
    folgaDiaSemana: null,
  },
  vinculoApp: null,
  periodo: { inicio: '2026-01-01', fim: '2026-06-30' },
  score: { valor: 80, nivel: 'BOM', componentes: [] },
  resumo: [],
  indicadores: [],
  faltas: {
    total: 1,
    taxa: 2,
    risco: 'BAIXO',
    tendencia: 0,
    porMes: [],
    porDiaSemana: [],
  },
  motivosCancelamento: [],
  insignias: [],
  incidencias: {
    totalNaoRetorno: 2,
    ultimoNaoRetorno: '2026-06-20',
    diasConsecutivosSemIncidencia: 5,
    risco: 'MEDIO',
    tendencia: 'ESTAVEL',
    porDiaSemana: [],
    frequenciaMensal: 1.2,
    percentualSobreEscalados: 8,
    timeline: [
      { data: '2026-06-20', kind: 'NAO_RETORNO_INTERVALO' },
      { data: '2026-06-10', kind: 'FALTA' },
    ],
  },
};

function render_() {
  const route = { params: { colaboradorId: 'c1' } } as never;
  const navigation = { navigate: jest.fn() } as never;
  return render(
    <PerfilColaboradorScreen route={route} navigation={navigation} />,
  );
}

describe('PerfilColaboradorScreen — histórico de incidências', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    colaboradoresService.perfil.mockResolvedValue(PERFIL);
    escalaService.listarIncidencias.mockResolvedValue([
      {
        id: 'i1',
        colaboradorId: 'c1',
        tipo: 'NAO_RETORNO_INTERVALO',
        data: '2026-06-20',
        origem: 'MANUAL',
        criadoEm: '2026-06-20T12:00:00.000Z',
        atualizadoEm: '2026-06-20T12:00:00.000Z',
      },
    ]);
  });

  it('renderiza o cartão de histórico com o resumo e a linha do tempo', async () => {
    render_();

    expect(await screen.findByText('Histórico de incidências')).toBeTruthy();
    expect(screen.getByText('Não retorno do intervalo')).toBeTruthy();
    expect(screen.getByText('Falta')).toBeTruthy();
    // Com permissão de gestão, busca os registros completos (para editar).
    expect(escalaService.listarIncidencias).toHaveBeenCalledWith({
      colaboradorId: 'c1',
    });
  });
});
