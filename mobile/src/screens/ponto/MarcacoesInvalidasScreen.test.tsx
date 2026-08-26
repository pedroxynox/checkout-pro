/**
 * Relatório de marcações inválidas: mostra quantas marcações faltam e QUAIS,
 * agrupadas por dia (abertas por padrão), com busca por pessoa e filtro pela
 * marcação faltante. Os itens de confiança baixa exibem o motivo.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { MarcacoesInvalidasScreen } from './MarcacoesInvalidasScreen';

jest.mock('../../api/services', () => ({
  centralJornadaService: { marcacoesInvalidas: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { centralJornadaService } = require('../../api/services');

const RESPOSTA = {
  periodo: { inicio: '', fim: '', rotulo: '26/06 – 25/07', deslocamento: 0 },
  totais: {
    dias: 2,
    pessoas: 2,
    marcacoesFaltantes: 3,
    faltaUma: 1,
    faltamDuas: 1,
    faltamTresOuMais: 0,
    aConferir: 1,
    porTipo: {
      ENTRADA: 1,
      SAIDA_INTERVALO: 1,
      RETORNO_INTERVALO: 1,
      ENCERRAMENTO: 0,
    },
    devidasMs: 5 * 60 * 60 * 1000,
    naoRetornosExcluidos: 0,
  },
  itens: [
    {
      colaboradorId: 'c1',
      nome: 'Ana Souza',
      primeiroNome: 'Ana',
      funcao: 'OPERADOR',
      data: '2026-06-29T00:00:00.000Z',
      diaSemana: 1,
      ehFeriado: false,
      entradaPrevista: '08:00',
      horasRegistradas: ['12:00', '13:30', '17:20'],
      esperadas: 4,
      registradas: 3,
      quantidadeFaltante: 1,
      tiposFaltantes: ['ENTRADA'],
      tiposPresentes: ['SAIDA_INTERVALO', 'RETORNO_INTERVALO', 'ENCERRAMENTO'],
      confianca: 'ALTA',
      observacao: null,
      detalhe: 'Falta registrar: entrada',
      devidasMs: 3 * 60 * 60 * 1000,
    },
    {
      colaboradorId: 'c2',
      nome: 'Bruno Lima',
      primeiroNome: 'Bruno',
      funcao: 'FISCAL',
      data: '2026-06-28T00:00:00.000Z',
      diaSemana: 0,
      ehFeriado: false,
      entradaPrevista: '08:00',
      horasRegistradas: ['08:00', '17:20'],
      esperadas: 4,
      registradas: 2,
      quantidadeFaltante: 2,
      tiposFaltantes: ['SAIDA_INTERVALO', 'RETORNO_INTERVALO'],
      tiposPresentes: ['ENTRADA', 'ENCERRAMENTO'],
      confianca: 'BAIXA',
      observacao:
        'As duas marcações cobrem a jornada inteira: o mais provável é que faltem as duas do intervalo.',
      detalhe:
        'Faltam registrar: saída para o intervalo e retorno do intervalo',
      devidasMs: 2 * 60 * 60 * 1000,
    },
  ],
};

describe('MarcacoesInvalidasScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    centralJornadaService.marcacoesInvalidas.mockResolvedValue(RESPOSTA);
  });

  it('mostra o que falta em cada dia, já expandido', async () => {
    render(<MarcacoesInvalidasScreen />);

    // Os dias aparecem como cabeçalho (29/06 e 28/06).
    expect(await screen.findByText('Seg 29/06')).toBeTruthy();
    expect(screen.getByText('Dom 28/06')).toBeTruthy();
    // E os itens já vêm visíveis (lista de trabalho, sem precisar tocar).
    expect(screen.getByText('Ana Souza')).toBeTruthy();
    expect(screen.getByText('Falta registrar: entrada')).toBeTruthy();
    expect(
      screen.getByText(
        'Faltam registrar: saída para o intervalo e retorno do intervalo',
      ),
    ).toBeTruthy();
  });

  it('mostra as horas registradas e o turno para conferência', async () => {
    render(<MarcacoesInvalidasScreen />);

    expect(
      await screen.findByText(
        '3 de 4 marcações: 12:00 · 13:30 · 17:20 — turno 08:00',
      ),
    ).toBeTruthy();
  });

  it('mostra o motivo quando a análise pede conferência', async () => {
    render(<MarcacoesInvalidasScreen />);

    expect(
      await screen.findByText(
        'As duas marcações cobrem a jornada inteira: o mais provável é que faltem as duas do intervalo.',
      ),
    ).toBeTruthy();
  });

  it('resume o ciclo com o total de marcações a ajustar', async () => {
    render(<MarcacoesInvalidasScreen />);

    expect(await screen.findByText('3 marcação(ões) a ajustar')).toBeTruthy();
    expect(screen.getByText('Em 2 dia(s), de 2 pessoa(s).')).toBeTruthy();
  });

  it('filtra por pessoa', async () => {
    render(<MarcacoesInvalidasScreen />);
    await screen.findByText('Ana Souza');

    fireEvent.changeText(screen.getByPlaceholderText('Nome do colaborador…'), 'bruno');

    expect(screen.queryByText('Ana Souza')).toBeNull();
    expect(screen.getByText('Bruno Lima')).toBeTruthy();
  });

  it('filtra pela marcação que falta', async () => {
    render(<MarcacoesInvalidasScreen />);
    await screen.findByText('Ana Souza');

    // "Entrada" aparece no filtro e também como selo do item; o primeiro é o
    // botão do filtro (renderizado acima da lista).
    fireEvent.press(screen.getAllByText('Entrada')[0]);

    expect(screen.getByText('Ana Souza')).toBeTruthy();
    expect(screen.queryByText('Bruno Lima')).toBeNull();
  });

  it('recolhe um dia ao tocar no cabeçalho', async () => {
    render(<MarcacoesInvalidasScreen />);
    await screen.findByText('Ana Souza');

    fireEvent.press(screen.getByText('Seg 29/06'));

    expect(screen.queryByText('Ana Souza')).toBeNull();
    // O outro dia continua aberto.
    expect(screen.getByText('Bruno Lima')).toBeTruthy();
  });

  it('mostra estado vazio quando não há nada a ajustar', async () => {
    centralJornadaService.marcacoesInvalidas.mockResolvedValue({
      ...RESPOSTA,
      totais: {
        dias: 0,
        pessoas: 0,
        marcacoesFaltantes: 0,
        faltaUma: 0,
        faltamDuas: 0,
        faltamTresOuMais: 0,
        aConferir: 0,
        porTipo: {
          ENTRADA: 0,
          SAIDA_INTERVALO: 0,
          RETORNO_INTERVALO: 0,
          ENCERRAMENTO: 0,
        },
        devidasMs: 0,
        naoRetornosExcluidos: 0,
      },
      itens: [],
    });

    render(<MarcacoesInvalidasScreen />);

    expect(await screen.findByText('Nada a ajustar')).toBeTruthy();
    expect(
      screen.getByText('Nenhuma marcação faltante neste ciclo. 🎉'),
    ).toBeTruthy();
  });

  it('avisa quantos dias de não retorno ficaram fora da lista', async () => {
    // Não pode sumir em silêncio: sem o aviso, um ciclo só com não-retornos
    // pareceria limpo.
    centralJornadaService.marcacoesInvalidas.mockResolvedValue({
      ...RESPOSTA,
      totais: { ...RESPOSTA.totais, naoRetornosExcluidos: 2 },
    });

    render(<MarcacoesInvalidasScreen />);

    expect(
      await screen.findByText(
        /2 dias de não retorno do intervalo não entram nesta lista/,
      ),
    ).toBeTruthy();
  });
});
