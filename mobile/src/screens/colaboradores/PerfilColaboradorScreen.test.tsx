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
  jornadaColaboradorService: { obter: jest.fn().mockResolvedValue(null) },
  escalaService: {
    listarIncidencias: jest.fn(),
    registrarIncidencia: jest.fn(),
    editarIncidencia: jest.fn(),
    removerIncidencia: jest.fn(),
  },
  // A seção Feedforward (renderizada no perfil) busca as rodadas do colaborador.
  feedforwardService: { doColaborador: jest.fn().mockResolvedValue([]) },
}));

// A seção Feedforward importa a impressão (expo-print): mock leve.
jest.mock('../../utils/impressao', () => ({
  imprimirRelatorio: jest.fn(() => Promise.resolve()),
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

const {
  colaboradoresService,
  escalaService,
  jornadaColaboradorService,
  // eslint-disable-next-line @typescript-eslint/no-var-requires
} = require('../../api/services');

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

describe('PerfilColaboradorScreen — jornada (5x2)', () => {
  const VIGENCIA = {
    id: 'v1',
    aPartirDe: '2026-11-23',
    tipoContratoJornadaId: 'c5x2',
    tipoContratoNome: '5x2 44h',
    grupo: 'G1',
    folgasFixas: [],
    folgasFixasEfetivas: [],
    disponibilidade: [{ diaSemana: 1, entrada: '06:50', saida: '16:38' }],
    motivo: 'Fim do 6x1',
    criadoPor: '232152',
    criadoEm: '2026-11-23T10:00:00.000Z',
    atualizadoPor: null,
    atualizadoEm: '2026-11-23T10:00:00.000Z',
    avisos: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.permitir = true;
    escalaService.listarIncidencias.mockResolvedValue([]);
    colaboradoresService.perfil.mockResolvedValue({
      ...PERFIL,
      colaborador: {
        ...PERFIL.colaborador,
        entradaSemana: '06:50',
        saidaSemana: '15:50',
        folgaDiaSemana: 3,
      },
    });
  });

  it('com vigência: contrato desde quando, grupo, disponibilidade, próximas folgas e histórico', async () => {
    jornadaColaboradorService.obter.mockResolvedValue({
      colaboradorId: 'c1',
      regimeHoje: 'SEMANAL',
      vigente: VIGENCIA,
      contratoVigente: { id: 'c5x2', nome: '5x2 44h', desde: '2026-11-23' },
      historico: [VIGENCIA],
      proximasFolgas: [
        { data: '2026-11-26', diaSemana: 4 },
        { data: '2026-11-27', diaSemana: 5 },
      ],
    });
    render_();

    expect(await screen.findByText('5x2 44h · desde 23/11/2026')).toBeTruthy();
    expect(screen.getByText('G1')).toBeTruthy();
    expect(screen.getByText('06:50 – 16:38')).toBeTruthy();
    expect(screen.getByText('Qui 26/11 · Sex 27/11')).toBeTruthy();
    expect(
      screen.getByText(/A partir de 23\/11\/2026 · 5x2 44h · G1/),
    ).toBeTruthy();
    // A escala antiga não aparece para quem já está na vigência.
    expect(screen.queryByText('Seg–Qui')).toBeNull();
  });

  it('sem vigência: mostra a escala antiga da ficha (6x1)', async () => {
    jornadaColaboradorService.obter.mockResolvedValue({
      colaboradorId: 'c1',
      regimeHoje: 'LEGADO_6X1',
      vigente: null,
      contratoVigente: { id: 'c6x1', nome: '6x1 - 2x1', desde: null },
      historico: [],
      proximasFolgas: [{ data: '2026-11-25', diaSemana: 3 }],
    });
    render_();

    expect(await screen.findByText('6x1 - 2x1')).toBeTruthy();
    expect(screen.getByText(/Escala antiga \(6x1\)/)).toBeTruthy();
    expect(screen.getByText('06:50 – 15:50')).toBeTruthy();
    expect(screen.getByText('Quarta')).toBeTruthy();
    expect(screen.getByText(/Sem vigências/)).toBeTruthy();
  });
});
