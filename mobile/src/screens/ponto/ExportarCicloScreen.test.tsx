/**
 * Exportação do ciclo: mostra os totais para revisão e a prévia das linhas, e
 * compartilha o CSV.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Share } from 'react-native';
import { ExportarCicloScreen } from './ExportarCicloScreen';

jest.mock('../../api/services', () => ({
  centralJornadaService: { exportacao: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { centralJornadaService } = require('../../api/services');

const RESPOSTA = {
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
  csv: 'Colaborador;Função;Data\nAna Souza;Operador;29/06/2026',
};

describe('ExportarCicloScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    centralJornadaService.exportacao.mockResolvedValue(RESPOSTA);
  });

  it('mostra a revisão do ciclo e a prévia das linhas', async () => {
    render(<ExportarCicloScreen />);
    expect(await screen.findByText('Revisão do ciclo')).toBeTruthy();
    expect(screen.getByText('Ana Souza')).toBeTruthy();
    expect(screen.getByText(/Prévia \(1 linha\)/)).toBeTruthy();
  });

  it('compartilha o CSV ao tocar em Compartilhar', async () => {
    const spy = jest.spyOn(Share, 'share').mockResolvedValue({
      action: 'sharedAction',
    } as never);

    render(<ExportarCicloScreen />);
    await screen.findByText('Revisão do ciclo');

    fireEvent.press(screen.getByText('Compartilhar CSV'));

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ message: RESPOSTA.csv }),
      expect.objectContaining({ subject: 'Ponto 26/06 – 25/07' }),
    );
  });
});
