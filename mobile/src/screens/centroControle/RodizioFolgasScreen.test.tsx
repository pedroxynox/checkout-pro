/**
 * Tela do rodízio de folgas (spec `jornada-5x2`, Fase 3): abre a vigência em
 * vigor, edita 2 dias por semana, confere no backend sem gravar e salva com
 * confirmação.
 */
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { RodizioFolgasScreen } from './RodizioFolgasScreen';
import { PADRAO_5X2 } from '../../utils/rodizioFolgas';

const VIGENCIA = {
  id: 'rodizio-folgas-2026-11-23',
  vigenteDesde: '2026-11-23',
  semanasNoCiclo: 3,
  padrao: PADRAO_5X2,
  criadoPor: 'migracao-9zzw',
  criadoEm: null,
  atualizadoPor: null,
  atualizadoEm: null,
  avisos: [],
};

const CONFIG = {
  vigencias: [VIGENCIA],
  vigente: VIGENCIA,
  previa: [
    {
      inicio: '2026-11-23',
      semanaDoCiclo: 1,
      dias: [
        { data: '2026-11-23', diaSemana: 1, grupos: ['G3'], fonte: 'RODIZIO' },
        { data: '2026-11-28', diaSemana: 6, grupos: [], fonte: 'RODIZIO' },
      ],
    },
  ],
};

const mockObter = jest.fn(() => Promise.resolve(CONFIG));
const mockSimular = jest.fn((_e: unknown) =>
  Promise.resolve({
    vigencia: {
      ...VIGENCIA,
      id: null,
      avisos: [
        {
          tipo: 'DIA_SEM_GRUPO',
          grupo: null,
          semana: 1,
          diaSemana: 4,
          mensagem: 'Semana 1: nenhum grupo folga na quinta.',
        },
      ],
    },
    previa: CONFIG.previa,
  }),
);
const mockDefinir = jest.fn((_e: unknown) => Promise.resolve(CONFIG));

jest.mock('../../api/services', () => ({
  rodizioFolgasService: {
    obter: () => mockObter(),
    simular: (e: unknown) => mockSimular(e),
    definir: (e: unknown) => mockDefinir(e),
  },
}));

const mockConfirmar = jest.fn(() => Promise.resolve(true));
const mockNotificar = jest.fn();
jest.mock('../../utils/dialogos', () => ({
  confirmar: () => mockConfirmar(),
  notificar: (...a: unknown[]) => mockNotificar(...a),
}));

describe('RodizioFolgasScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('abre a vigência em vigor com a tabela e a prévia', async () => {
    render(<RodizioFolgasScreen />);
    expect(
      await screen.findByText('Rodízio a partir de 23/11/2026'),
    ).toBeTruthy();
    expect(screen.getAllByText('Semana 1 · qui + sex')).toHaveLength(1); // G1
    expect(screen.getByText('Semana 1 · seg + dom')).toBeTruthy(); // G3
    expect(screen.getByText('Folga G3')).toBeTruthy();
    expect(screen.getByText('Todos trabalham')).toBeTruthy(); // sábado
    expect(screen.getByText('Em vigor')).toBeTruthy();
  });

  it('não deixa marcar um terceiro dia nem o sábado; com um dia a menos, não confere', async () => {
    render(<RodizioFolgasScreen />);
    await screen.findByText('Rodízio a partir de 23/11/2026');
    fireEvent.press(screen.getByLabelText('G1 semana 1 Seg')); // terceiro dia
    fireEvent.press(screen.getByLabelText('G1 semana 1 Sáb'));
    expect(screen.getByText('Semana 1 · qui + sex')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('G1 semana 1 Qui')); // desmarca
    expect(screen.getByText('Semana 1 · sex')).toBeTruthy();
    expect(screen.getByText('G1, semana 1: marque 2 dias.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Conferir' }));
    expect(mockSimular).not.toHaveBeenCalled();
    expect(mockNotificar).toHaveBeenCalledWith(
      'Falta completar',
      'G1, semana 1: marque 2 dias.',
    );
  });

  it('confere no backend e mostra os avisos, sem salvar', async () => {
    render(<RodizioFolgasScreen />);
    await screen.findByText('Rodízio a partir de 23/11/2026');
    fireEvent.press(screen.getByRole('button', { name: 'Conferir' }));
    await waitFor(() =>
      expect(mockSimular).toHaveBeenCalledWith({
        vigenteDesde: '2026-11-23',
        semanasNoCiclo: 3,
        padrao: PADRAO_5X2,
      }),
    );
    expect(
      await screen.findByText('Semana 1: nenhum grupo folga na quinta.'),
    ).toBeTruthy();
    expect(screen.getByText('Prévia (não salva)')).toBeTruthy();
    expect(mockDefinir).not.toHaveBeenCalled();
  });

  it('salva depois de confirmar', async () => {
    render(<RodizioFolgasScreen />);
    await screen.findByText('Rodízio a partir de 23/11/2026');
    fireEvent.press(screen.getByRole('button', { name: 'Salvar rodízio' }));
    await waitFor(() => expect(mockDefinir).toHaveBeenCalledTimes(1));
    expect(mockConfirmar).toHaveBeenCalledTimes(1);
    expect(mockDefinir).toHaveBeenCalledWith(
      expect.objectContaining({
        vigenteDesde: '2026-11-23',
        semanasNoCiclo: 3,
      }),
    );
  });
});
