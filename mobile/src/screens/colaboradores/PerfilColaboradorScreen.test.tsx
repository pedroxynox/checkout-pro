/**
 * Teste do histórico unificado de incidências no Perfil do Colaborador
 * (Fase 2 — faltas + "não retorno do intervalo").
 *
 * Verifica que o cartão "Histórico de incidências" renderiza o resumo e a
 * linha do tempo (faltas + não retorno) vindos do perfil, e que, com
 * permissão de gestão, os registros completos são buscados (para editar).
 *
 * Cobre também (Score de perfil abrangente) a exposição do botão "Registrar
 * não retorno" no perfil do operador: só aparece com a permissão
 * `OPERADORES_AUSENCIAS` e abre o modal em modo criar.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { PerfilColaboradorScreen } from './PerfilColaboradorScreen';

jest.mock('../../api/services', () => ({
  colaboradoresService: { perfil: jest.fn() },
  escalaService: {
    listarIncidencias: jest.fn(),
    registrarIncidencia: jest.fn(),
    editarIncidencia: jest.fn(),
    removerIncidencia: jest.fn(),
  },
}));

// Permissão controlável por teste: `mockAuth.permitir` alimenta `podeAcessar`
// (usado para `OPERADORES_AUSENCIAS`).
const mockAuth = { permitir: true };
jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ podeAcessar: () => mockAuth.permitir }),
}));

// "Hoje" determinístico para não depender da data de execução.
jest.mock('../../utils/formato', () => {
  const real = jest.requireActual('../../utils/formato');
  return { ...real, hojeISO: () => '2026-06-25' };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { colaboradoresService, escalaService } = require('../../api/services');

const PERFIL = {
  colaborador: {
    id: 'c1',
    nome: 'Ana Souza',
    matricula: '123',
    login: null,
    funcao: 'OPERADOR',
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
  contrato: {
    temAdmissao: true,
    dataAdmissao: '2026-05-01',
    diasDeCasa: 55,
    estado: 'EXPERIENCIA',
    etiqueta: 'experiencia',
    dataMarco45: '2026-06-15',
    dataMarco90: '2026-07-30',
    proximoMarco: 'MARCO_90',
    dataProximoMarco: '2026-07-30',
    diasParaProximoMarco: 35,
    marcoEmAtraso: null,
    efetivadoPorDecurso: false,
    decisao45: 'APROVADO',
    decisao90: null,
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
    mockAuth.permitir = true;
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

  it('exibe o botão "Registrar não retorno" quando há permissão', async () => {
    render_();

    expect(await screen.findByText('Histórico de incidências')).toBeTruthy();
    expect(screen.getByText('Registrar não retorno')).toBeTruthy();
  });

  it('oculta o botão "Registrar não retorno" sem permissão', async () => {
    mockAuth.permitir = false;
    render_();

    expect(await screen.findByText('Histórico de incidências')).toBeTruthy();
    expect(screen.queryByText('Registrar não retorno')).toBeNull();
  });

  it('abre o modal em modo criar ao pressionar "Registrar não retorno"', async () => {
    render_();

    const botao = await screen.findByText('Registrar não retorno');
    // Antes de abrir, o modal (título de criação) não está montado; o único
    // "Registrar não retorno" presente é o botão de ação.
    expect(screen.getAllByText('Registrar não retorno')).toHaveLength(1);

    fireEvent.press(botao);

    // No modo criar, o modal renderiza o botão "Salvar" e o campo de retorno
    // real — marcadores exclusivos do modal (sem incidência existente).
    expect(await screen.findByText('Salvar')).toBeTruthy();
    expect(screen.getByText('Retorno real')).toBeTruthy();
    // O modal de criação NÃO deve estar em modo edição: sem título "Editar".
    expect(screen.queryByText('Editar incidência')).toBeNull();
  });
});
