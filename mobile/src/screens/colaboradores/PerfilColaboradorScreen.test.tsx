/**
 * Teste do histórico unificado de incidências no Perfil do Colaborador
 * (faltas + "não retorno do intervalo" + sanções) — **somente leitura**.
 *
 * Verifica que o cartão "Histórico de incidências" renderiza o resumo e a
 * linha do tempo, e que o registro/edição de ocorrências NÃO é mais exposto
 * no perfil (foi movido para a seção "Sanções").
 */
import { render, screen } from '@testing-library/react-native';
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
  // A seção Feedforward (renderizada no perfil) busca as rodadas do colaborador.
  feedforwardService: { doColaborador: jest.fn().mockResolvedValue([]) },
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
      { data: '2026-06-12', kind: 'FALTA', justificada: true },
      { data: '2026-06-10', kind: 'FALTA', justificada: false },
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
    // Falta injustificada aparece como "Falta"; a justificada, com o rótulo próprio.
    expect(screen.getByText('Falta')).toBeTruthy();
    expect(screen.getByText('Falta + justificação')).toBeTruthy();
  });

  it('é somente leitura: não expõe registro/edição de ocorrências no perfil', async () => {
    render_();

    expect(await screen.findByText('Histórico de incidências')).toBeTruthy();
    // O registro de sanções foi movido para a seção "Sanções".
    expect(screen.queryByText('Registrar ocorrência')).toBeNull();
    expect(screen.queryByText('Editar ocorrência')).toBeNull();
    // O perfil não busca mais os registros completos (só exibe a timeline).
    expect(escalaService.listarIncidencias).not.toHaveBeenCalled();
  });
});

describe('PerfilColaboradorScreen — marcos do contrato', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.permitir = true;
    escalaService.listarIncidencias.mockResolvedValue([]);
  });

  it('efetivado (mais de 90 dias): marcos de 45 e 90 aparecem como Aprovado', async () => {
    colaboradoresService.perfil.mockResolvedValue({
      ...PERFIL,
      contrato: {
        ...PERFIL.contrato,
        diasDeCasa: 120,
        estado: 'EFETIVADO',
        etiqueta: 'efetivado',
        proximoMarco: null,
        dataProximoMarco: null,
        diasParaProximoMarco: null,
        efetivadoPorDecurso: true,
        decisao45: null,
        decisao90: null,
      },
    });
    render_();
    await screen.findByText('Tempo de casa');
    // Sem decisão manual, ambos os marcos já cumpridos contam como aprovados.
    expect(screen.getAllByText(/Aprovado/).length).toBeGreaterThanOrEqual(2);
  });
});
