/**
 * Testes da seção "Colaboradores" (somente leitura) — foco na CONTAGEM do
 * quadro: card "Fiscais" separado e os cards de turno contando APENAS
 * operadores (fiscais não entram nos turnos). Também valida que a contagem
 * considera apenas colaboradores ATIVOS.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { ColaboradoresScreen } from './ColaboradoresScreen';

jest.mock('../../api/services', () => ({
  colaboradoresService: { listar: jest.fn() },
}));

// A tela agora exibe o atalho para Contratos conforme a permissão.
jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ podeAcessar: () => true }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { colaboradoresService } = require('../../api/services');

/** Helper para montar um colaborador de teste com defaults. */
function colab(
  over: Partial<{
    id: string;
    nome: string;
    matricula: string;
    funcao: string;
    turno: string | null;
    ativo: boolean;
    genero: string | null;
  }>,
) {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    nome: over.nome ?? 'Fulano',
    matricula: over.matricula ?? '900000',
    funcao: over.funcao ?? 'OPERADOR',
    genero: over.genero ?? 'F',
    ativo: over.ativo ?? true,
    turno: over.turno ?? null,
    entradaSemana: null,
    saidaSemana: null,
    entradaFds: null,
    saidaFds: null,
    folgaDiaSemana: null,
    usuarioId: null,
  };
}

function navFake() {
  // addListener devolve a função de "unsubscribe" (usada na limpeza do efeito).
  return { navigate: jest.fn(), addListener: jest.fn(() => jest.fn()) } as never;
}

describe('ColaboradoresScreen — contagem do quadro', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    colaboradoresService.listar.mockResolvedValue([
      colab({ matricula: '900001', funcao: 'OPERADOR', turno: 'ABERTURA' }),
      colab({ matricula: '900002', funcao: 'OPERADOR', turno: 'FECHAMENTO' }),
      colab({ matricula: '900003', funcao: 'FISCAL', turno: 'FECHAMENTO' }),
      colab({ matricula: '900004', funcao: 'FISCAL', turno: 'ABERTURA' }),
      // Inativo: não deve contar em lugar nenhum.
      colab({ matricula: '900005', funcao: 'OPERADOR', turno: 'ABERTURA', ativo: false }),
    ]);
  });

  it('conta Fiscais à parte e os turnos só com operadores (ativos)', async () => {
    render(<ColaboradoresScreen navigation={navFake()} route={{} as never} />);

    // Espera a lista carregar (aparece a card "Total").
    expect(await screen.findByText('Total')).toBeTruthy();
    expect(screen.getByText('Fiscais')).toBeTruthy();

    // Total de ativos = 4 (o inativo não conta). É o único card com "4".
    expect(screen.getByText('4')).toBeTruthy();

    // Fiscais = 2, e é o ÚNICO card com o número 2 — ou seja, nenhum card de
    // turno contou os fiscais (Abertura/Fechamento operadores = 1 cada).
    expect(screen.getAllByText('2')).toHaveLength(1);
  });

  it('filtra a lista ao tocar num card (Fiscais some os operadores)', async () => {
    colaboradoresService.listar.mockResolvedValue([
      colab({ nome: 'Olivia Operadora', funcao: 'OPERADOR', turno: 'ABERTURA' }),
      colab({ nome: 'Fabio Fiscal', funcao: 'FISCAL' }),
    ]);
    render(<ColaboradoresScreen navigation={navFake()} route={{} as never} />);

    await screen.findByText('Total');
    // Sem filtro (Total): ambos aparecem.
    expect(screen.getByText('Olivia Operadora')).toBeTruthy();
    expect(screen.getByText('Fabio Fiscal')).toBeTruthy();

    // Toca no card "Fiscais": só o fiscal permanece na lista.
    fireEvent.press(screen.getByLabelText('Filtrar por Fiscais'));
    expect(screen.queryByText('Olivia Operadora')).toBeNull();
    expect(screen.getByText('Fabio Fiscal')).toBeTruthy();

    // Volta ao Total: os dois voltam a aparecer.
    fireEvent.press(screen.getByLabelText('Filtrar por Total'));
    expect(screen.getByText('Olivia Operadora')).toBeTruthy();
    expect(screen.getByText('Fabio Fiscal')).toBeTruthy();
  });

  it('mostra estado vazio (e sem contadores) quando não há colaboradores', async () => {
    colaboradoresService.listar.mockResolvedValue([]);
    render(<ColaboradoresScreen navigation={navFake()} route={{} as never} />);

    expect(await screen.findByText('Sem colaboradores')).toBeTruthy();
    // Sem dados, o bloco de contagem não aparece.
    expect(screen.queryByText('Total')).toBeNull();
    expect(screen.queryByText('Fiscais')).toBeNull();
  });
});
