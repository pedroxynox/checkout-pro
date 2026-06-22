/**
 * Testes de componente do Painel de Vendas inteligente.
 *
 * Cobre o panorama (faturamento do mês, projeção e comparativos) e o detalhe
 * por hora. O envio de arquivos foi movido para a seção Importações; aqui não
 * há upload nem status.
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { PainelVendasScreen } from './PainelVendasScreen';

jest.mock('../../api/services', () => ({
  vendasService: {
    painel: jest.fn(),
    porHora: jest.fn(),
    definirConfig: jest.fn(),
  },
}));

// "Hoje" determinístico (sexta-feira, 19/06/2026).
jest.mock('../../utils/formato', () => {
  const real = jest.requireActual('../../utils/formato');
  return { ...real, hojeISO: () => '2026-06-19' };
});

// Perfil com permissão de edição, para exercitar a configuração de meta.
jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ podeAcessar: () => true }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { vendasService } = require('../../api/services');

const PAINEL = {
  metaMensal: 200000,
  arrecadadoMes: 120000,
  diasComVenda: 12,
  diasNoMes: 30,
  mediaDiaria: 10000,
  projecaoFechamento: 300000,
  metaProgresso: 0.6,
  projecaoVsMeta: 50,
  comparativos: {
    dia: { atual: 12345.67, anterior: 10000, variacao: 23.46 },
    semana: { atual: 70000, anterior: 65000, variacao: 7.69 },
    mes: { atual: 120000, anterior: 110000, variacao: 9.09 },
  },
  tendencia: [
    { data: '2026-06-18', valor: 9000 },
    { data: '2026-06-19', valor: 12345.67 },
  ],
  curvaHoraria: [
    { hora: 8, valor: 3000, pct: 0.3 },
    { hora: 9, valor: 7000, pct: 0.7 },
  ],
  horaPico: 9,
  heatmap: Array.from({ length: 7 }, () => new Array(24).fill(0)),
  padraoDiaSemana: Array.from({ length: 7 }, (_, dow) => ({
    diaSemana: dow,
    nome: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dow],
    media: 10000,
  })),
};

describe('PainelVendasScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    vendasService.painel.mockResolvedValue(PAINEL);
    vendasService.porHora.mockResolvedValue({
      total: 9999.99,
      horas: [
        { hora: 8, valor: 3000 },
        { hora: 9, valor: 6999.99 },
      ],
    });
  });

  it('exibe o faturamento do mês e a projeção de fechamento', async () => {
    render(<PainelVendasScreen />);

    expect(await screen.findByText(/120\.000,00/)).toBeTruthy();
    expect(vendasService.painel).toHaveBeenCalled();
    expect(vendasService.porHora).toHaveBeenCalled();
  });

  it('mostra o comparativo do dia formatado em reais', async () => {
    render(<PainelVendasScreen />);

    expect(await screen.findByText(/12\.345,67/)).toBeTruthy();
  });
});
