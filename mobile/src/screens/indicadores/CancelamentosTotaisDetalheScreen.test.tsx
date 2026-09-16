/**
 * Detalhe de **Cancelamentos Totais** (ADR 0025).
 *
 * O que estes testes travam é o propósito da tela: ela não existe para repetir o
 * número da card, e sim para responder **o que está impactando** e **o que
 * fazer**. Então travam o excedente em dinheiro, a composição das duas metades,
 * as causas e ações vindas do diagnóstico, a simulação dos maiores, o aviso de
 * que motivos só cobrem o cupom e o caso do mês sem venda registrada.
 */
import { render, screen } from "@testing-library/react-native";
import React from "react";
import { CancelamentosTotaisDetalheScreen } from "./CancelamentosTotaisDetalheScreen";

jest.mock("../../api/services", () => ({
  arrecadacaoService: { cancelamentosTotaisDetalhe: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { arrecadacaoService } = require("../../api/services");

/** Mês acima do teto: 1,10% contra 0,75%, R$ 350 de excedente. */
const DETALHE = {
  indicador: {
    tipo: "CANCELAMENTOS_TOTAIS" as const,
    titulo: "Cancelamentos Totais",
    anoMes: "2026-09",
    rotulo: "set/26",
    base: "VENDAS" as const,
    sentido: "MENOR_MELHOR" as const,
    total: 1100,
    totalItens: 800,
    totalCupom: 300,
    itens: 40,
    lancamentos: 30,
    lancamentosItens: 20,
    lancamentosCupom: 10,
    vendas: 100_000,
    percentual: 1.1,
    meta: 0.75,
    nivel: "ATENCAO" as const,
    cumpriuMeta: false,
    desvio: { absoluto: 0.35, percentual: 46.67, dentro: false },
    estado: "OK" as const,
    limiteReais: 750,
    excedente: 350,
    parcial: true,
    valorAnterior: 0.9,
    variacao: 22.22,
    evolucao: "PIOROU" as const,
  },
  composicao: {
    totalItens: 800,
    totalCupom: 300,
    participacaoItens: 72.73,
    participacaoCupom: 27.27,
    percentualItens: 0.8,
    percentualCupom: 0.3,
    dominante: "ITENS" as const,
  },
  ofensores: [
    {
      nome: "Ana Souza",
      total: 600,
      totalItens: 500,
      totalCupom: 100,
      participacao: 66.67,
      percentualVendas: 0.6,
    },
    {
      nome: "Bia Lima",
      total: 300,
      totalItens: 300,
      totalCupom: 0,
      participacao: 33.33,
      percentualVendas: 0.3,
    },
  ],
  concentracao: {
    pessoas: 2,
    participacaoTop3: 100,
    pessoasParaMetade: 1,
    espalhado: false,
  },
  simulacao: {
    quantos: 2,
    nomes: ["Ana Souza", "Bia Lima"],
    valorRemovido: 900,
    percentualSimulado: 0.2,
    ficariaDentro: true,
  },
  motivos: [
    {
      rotulo: "Cliente desistiu",
      total: 200,
      lancamentos: 6,
      participacao: 66.67,
    },
    { rotulo: "Erro de preço", total: 100, lancamentos: 4, participacao: 33.33 },
  ],
  autorizadores: [
    {
      rotulo: "Fiscal Carla",
      total: 250,
      lancamentos: 8,
      participacao: 83.33,
    },
  ],
  perfil: {
    lancamentos: 30,
    ticketMedio: 36.67,
    maioresConsiderados: 3,
    participacaoMaiores: 62,
    perfil: "POUCOS_GRANDES" as const,
  },
  diagnostico: {
    resumo:
      "1,10% das vendas, contra um teto de 0,75% — R$ 350,00 acima do que a meta permitia. Piorou em relação ao mês anterior.",
    causas: [
      {
        titulo: "O peso está no cancelamento de itens",
        detalhe: "73% do valor vem de itens (R$ 800,00), contra R$ 300,00 de cupom.",
      },
      {
        titulo: "O valor está concentrado em poucas pessoas",
        detalhe:
          "Os 3 maiores respondem por 100% do valor das pessoas cadastradas: Ana Souza, Bia Lima.",
      },
    ],
    acoes: [
      "Itens são cancelados na hora de passar a compra: revisar o escaneamento e a marcação de preço na gôndola.",
      "Conversa individual com Ana Souza, Bia Lima — aqui o ganho é caso a caso, não campanha geral.",
    ],
  },
  historico: [
    {
      anoMes: "2026-08",
      rotulo: "ago/26",
      total: 900,
      totalItens: 600,
      totalCupom: 300,
      vendas: 100_000,
      percentual: 0.9,
      meta: 0.75,
      nivel: "ATENCAO" as const,
      cumpriuMeta: false,
      variacao: null,
      evolucao: null,
      parcial: false,
      semDados: false,
    },
    {
      anoMes: "2026-09",
      rotulo: "set/26",
      total: 1100,
      totalItens: 800,
      totalCupom: 300,
      vendas: 100_000,
      percentual: 1.1,
      meta: 0.75,
      nivel: "ATENCAO" as const,
      cumpriuMeta: false,
      variacao: 22.22,
      evolucao: "PIOROU" as const,
      parcial: true,
      semDados: false,
    },
  ],
  sequenciaCumprindo: 0,
  mesesRetencao: 24,
  anoMesLimite: "2024-10",
};

describe("CancelamentosTotaisDetalheScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("mostra o teto em dinheiro e quanto passou dele", async () => {
    arrecadacaoService.cancelamentosTotaisDetalhe.mockResolvedValue(DETALHE);
    render(<CancelamentosTotaisDetalheScreen />);

    await screen.findByText("Cancelamentos Totais");
    expect(screen.getByText(/R\$\s?1\.100,00/)).toBeTruthy();
    expect(screen.getByText("Teto do mês (0,75% das vendas)")).toBeTruthy();
    expect(screen.getByText(/R\$\s?750,00/)).toBeTruthy();
    expect(screen.getByText("Acima do teto")).toBeTruthy();
    // O excedente aparece na linha e também no resumo do diagnóstico.
    expect(screen.getAllByText(/R\$\s?350,00/).length).toBeGreaterThan(0);
  });

  /**
   * O aviso existe porque as duas metades podem estar verdes com o total
   * amarelo: o teto do total é independente, e sem isso escrito parece um bug.
   */
  it("diz que o teto do total não é a soma dos tetos das partes", async () => {
    arrecadacaoService.cancelamentosTotaisDetalhe.mockResolvedValue(DETALHE);
    render(<CancelamentosTotaisDetalheScreen />);

    await screen.findByText("Cancelamentos Totais");
    expect(
      screen.getByText(/não é a soma dos tetos de Cancelamento de Itens e de Cupom/),
    ).toBeTruthy();
  });

  it("decompõe o total nas duas metades, com o % de cada uma sobre as vendas", async () => {
    arrecadacaoService.cancelamentosTotaisDetalhe.mockResolvedValue(DETALHE);
    render(<CancelamentosTotaisDetalheScreen />);

    await screen.findByText("De onde vem");
    expect(screen.getByText("Itens 73%")).toBeTruthy();
    expect(screen.getByText("Cupom 27%")).toBeTruthy();
    expect(screen.getByText(/R\$\s?800,00 · 0,80%/)).toBeTruthy();
    expect(screen.getByText(/R\$\s?300,00 · 0,30%/)).toBeTruthy();
  });

  it("mostra as causas e as ações deduzidas dos números", async () => {
    arrecadacaoService.cancelamentosTotaisDetalhe.mockResolvedValue(DETALHE);
    render(<CancelamentosTotaisDetalheScreen />);

    await screen.findByText("O que está impactando");
    expect(screen.getByText("O peso está no cancelamento de itens")).toBeTruthy();
    expect(screen.getByText("O que fazer para melhorar")).toBeTruthy();
    expect(screen.getByText(/revisar o escaneamento/)).toBeTruthy();
  });

  it("a simulação diz o que bastaria resolver para fechar dentro do teto", async () => {
    arrecadacaoService.cancelamentosTotaisDetalhe.mockResolvedValue(DETALHE);
    render(<CancelamentosTotaisDetalheScreen />);

    await screen.findByText("Se resolver os maiores");
    expect(screen.getByText("0,20%")).toBeTruthy();
    expect(screen.getByText("seria o mês sem os 2 maiores")).toBeTruthy();
    expect(
      screen.getByText(/o mês fecharia dentro do teto de 0,75%/),
    ).toBeTruthy();
  });

  it("dentro do teto não mostra a simulação — não há o que resolver", async () => {
    arrecadacaoService.cancelamentosTotaisDetalhe.mockResolvedValue({
      ...DETALHE,
      indicador: {
        ...DETALHE.indicador,
        total: 600,
        percentual: 0.6,
        nivel: "OK" as const,
        cumpriuMeta: true,
        desvio: { absoluto: -0.15, percentual: -20, dentro: true },
        excedente: 0,
      },
    });
    render(<CancelamentosTotaisDetalheScreen />);

    await screen.findByText("Cancelamentos Totais");
    expect(screen.getByText("Dentro do teto")).toBeTruthy();
    expect(screen.queryByText("Se resolver os maiores")).toBeNull();
  });

  it("mostra o ranking combinado com a quebra entre itens e cupom", async () => {
    arrecadacaoService.cancelamentosTotaisDetalhe.mockResolvedValue(DETALHE);
    render(<CancelamentosTotaisDetalheScreen />);

    await screen.findByText("Quem mais pesa");
    expect(screen.getByText("Ana Souza")).toBeTruthy();
    expect(
      screen.getByText(/itens R\$\s?500,00 · cupom R\$\s?100,00 · 0,60% das vendas/),
    ).toBeTruthy();
  });

  /**
   * Sem este aviso, o gestor leria os motivos como se explicassem o indicador
   * inteiro — quando o arquivo de itens simplesmente não tem essa coluna.
   */
  it("avisa que os motivos cobrem apenas a metade do cupom", async () => {
    arrecadacaoService.cancelamentosTotaisDetalhe.mockResolvedValue(DETALHE);
    render(<CancelamentosTotaisDetalheScreen />);

    await screen.findByText("Motivos do cancelamento de cupom");
    expect(screen.getByText("Cliente desistiu")).toBeTruthy();
    expect(
      screen.getByText(
        /o arquivo de cancelamento de itens não traz motivo/,
      ),
    ).toBeTruthy();
  });

  it("mês sem venda registrada explica a falta, sem inventar percentual", async () => {
    arrecadacaoService.cancelamentosTotaisDetalhe.mockResolvedValue({
      ...DETALHE,
      indicador: {
        ...DETALHE.indicador,
        vendas: 0,
        percentual: null,
        nivel: null,
        cumpriuMeta: null,
        desvio: null,
        estado: "SEM_VENDA" as const,
        limiteReais: null,
        excedente: null,
      },
      diagnostico: {
        resumo:
          "Há R$ 1.100,00 de cancelamentos, mas nenhuma venda registrada no mês: sem o arquivo de vendas não existe percentual para comparar com a meta.",
        causas: [],
        acoes: [
          "Enviar o arquivo de vendas por hora do mês em Importações — sem ele o indicador fica sem denominador.",
        ],
      },
      simulacao: null,
    });
    render(<CancelamentosTotaisDetalheScreen />);

    await screen.findByText("Cancelamentos Totais");
    expect(screen.getByText("Sem dados")).toBeTruthy();
    expect(screen.getByText(/nenhuma venda registrada no mês/)).toBeTruthy();
    expect(screen.getByText(/Enviar o arquivo de vendas/)).toBeTruthy();
  });

  it("informa a forma do dano para separar rotina de exceção", async () => {
    arrecadacaoService.cancelamentosTotaisDetalhe.mockResolvedValue(DETALHE);
    render(<CancelamentosTotaisDetalheScreen />);

    await screen.findByText("Forma do dano");
    expect(screen.getByText("Poucos lançamentos grandes")).toBeTruthy();
    expect(screen.getByText(/dá para revisar caso a caso/)).toBeTruthy();
  });

  it("pede o detalhe do mês corrente ao abrir", async () => {
    arrecadacaoService.cancelamentosTotaisDetalhe.mockResolvedValue(DETALHE);
    render(<CancelamentosTotaisDetalheScreen />);

    await screen.findByText("Cancelamentos Totais");
    expect(arrecadacaoService.cancelamentosTotaisDetalhe).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}$/),
    );
  });
});
