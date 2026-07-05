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
    taxaPonderada: 2,
    justificadas: 0,
    risco: 'BAIXO',
    tendencia: 0,
    porMes: [],
    porDiaSemana: [],
  },
  motivosCancelamento: [],
  insignias: [],
  incidencias: {
    total: 3,
    porTipo: [
      { tipo: 'NAO_RETORNO_INTERVALO', rotulo: 'Não retorno do intervalo', total: 2 },
      { tipo: 'ATRASO', rotulo: 'Atraso', total: 1 },
    ],
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
      { data: '2026-06-15', kind: 'ATRASO' },
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

  it('exibe o botão "Registrar ocorrência" quando há permissão', async () => {
    render_();

    expect(await screen.findByText('Histórico de incidências')).toBeTruthy();
    expect(screen.getByText('Registrar ocorrência')).toBeTruthy();
  });

  it('oculta o botão "Registrar ocorrência" sem permissão', async () => {
    mockAuth.permitir = false;
    render_();

    expect(await screen.findByText('Histórico de incidências')).toBeTruthy();
    expect(screen.queryByText('Registrar ocorrência')).toBeNull();
  });

  it('abre o modal em modo criar (só advertência/suspensão, sem horário)', async () => {
    render_();

    const botao = await screen.findByText('Registrar ocorrência');
    // Antes de abrir, o único "Registrar ocorrência" presente é o botão de ação.
    expect(screen.getAllByText('Registrar ocorrência')).toHaveLength(1);

    fireEvent.press(botao);

    // O modal abre com o seletor de tipos do perfil (advertência/suspensão) e
    // o botão "Salvar". Como esses tipos não usam horário, o campo "Retorno
    // real" NÃO aparece.
    expect(await screen.findByText('Salvar')).toBeTruthy();
    expect(screen.getByText('Suspensão')).toBeTruthy();
    expect(screen.queryByText('Retorno real')).toBeNull();
    // Modo criação, não edição.
    expect(screen.queryByText('Editar ocorrência')).toBeNull();
  });
});
