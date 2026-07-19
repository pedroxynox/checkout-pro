/**
 * Revisão/fechamento do ciclo: mostra os totais para revisão (sem prévia de
 * linhas nem exportação de CSV) e permite fechar/reabrir o ciclo.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { ExportarCicloScreen } from './ExportarCicloScreen';

jest.mock('../../api/services', () => ({
  centralJornadaService: { exportacao: jest.fn() },
  cicloFolhaService: { status: jest.fn(), fechar: jest.fn(), reabrir: jest.fn() },
}));

// Diálogos: confirmar resolve true; notificar é neutro.
jest.mock('../../utils/dialogos', () => ({
  confirmar: jest.fn().mockResolvedValue(true),
  notificar: jest.fn(),
}));

// Gestão com permissão de fechar (CENTRAL_JORNADA), sem reabrir (ADMIN_DADOS).
jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ podeAcessar: (f: string) => f === 'CENTRAL_JORNADA' }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { centralJornadaService, cicloFolhaService } = require('../../api/services');

const EXPORT = {
  periodo: { inicio: '', fim: '', rotulo: '26/06 – 25/07', deslocamento: 0 },
  geradoEm: '2026-07-10T12:00:00.000Z',
  totais: {
    extras50Ms: 3_600_000,
    extras100Ms: 0,
    horasDevidasMs: 0,
    horasAtestadoMs: 0,
    faltas: 0,
    diasTac: 1,
    conflitos: 0,
    atrasos: 0,
    saldoMs: 3_600_000,
    inconsistencias: 1,
  },
  pessoas: [],
  linhas: [
    {
      colaboradorId: 'c1',
      nome: 'Ana Souza',
      funcao: 'OPERADOR',
      data: '2026-06-29T00:00:00.000Z',
      diaSemana: 1,
      tipo: 'TRABALHO',
      trabalhadoMs: 28_800_000,
      baseMs: 25_200_000,
      extras50Ms: 3_600_000,
      extras100Ms: 0,
      devidasMs: 0,
      atestado: false,
      tac: true,
      motivosTac: ['Excedeu 1h50 de horas extras'],
      problemas: ['TAC'],
    },
  ],
};

const STATUS_ABERTO = {
  periodo: { inicio: '', fim: '', rotulo: '26/06 – 25/07', deslocamento: 0 },
  status: 'ABERTO',
  fechadoPorNome: null,
  fechadoEm: null,
  reabertoPorNome: null,
  reabertoEm: null,
};

describe('ExportarCicloScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    centralJornadaService.exportacao.mockResolvedValue(EXPORT);
    cicloFolhaService.status.mockResolvedValue(STATUS_ABERTO);
    cicloFolhaService.fechar.mockResolvedValue({
      ...STATUS_ABERTO,
      status: 'FECHADO',
    });
  });

  it('mostra a revisão do ciclo (totais) sem prévia de linhas', async () => {
    render(<ExportarCicloScreen />);
    expect(await screen.findByText('Revisão do ciclo')).toBeTruthy();
    expect(screen.getByText(/Inconsistências 1/)).toBeTruthy();
    // Não há mais prévia de linhas nem CSV.
    expect(screen.queryByText('Ana Souza')).toBeNull();
    expect(screen.queryByText(/Prévia/)).toBeNull();
  });

  it('fecha o ciclo ao tocar em Fechar ciclo (com confirmação)', async () => {
    render(<ExportarCicloScreen />);
    const botao = await screen.findByText('Fechar ciclo');

    fireEvent.press(botao);

    await waitFor(() =>
      expect(cicloFolhaService.fechar).toHaveBeenCalledWith(0),
    );
  });
});
