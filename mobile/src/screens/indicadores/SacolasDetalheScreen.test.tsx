/**
 * Detalhe do indicador Sacolas (ADR 0022).
 *
 * O foco é o **teto de sacolas** — o número que serve para decidir durante o mês
 * — e as duas leituras que evitam conclusões erradas: a direção contraintuitiva
 * (receber menos melhora o indicador, mas a loja precisa de sacolas) e a diferença
 * entre acúmulo de estoque e desperdício.
 */
import { render, screen } from "@testing-library/react-native";
import React from "react";
import { SacolasDetalheScreen } from "./SacolasDetalheScreen";

jest.mock("../../api/services", () => ({
  insumosService: { detalheSacolas: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { insumosService } = require("../../api/services");

const INDICADOR = {
  anoMes: "2026-09",
  rotulo: "Set/26",
  parcial: true,
  vendaMes: 1_500_000,
  sacolasRecebidas: 100_000,
  fardosRecebidos: 100,
  entregas: 1,
  fatorEmbalagem: 1000,
  valor: 15,
  meta: 28,
  unidade: "REAIS_POR_UNIDADE" as const,
  sentido: "MAIOR_MELHOR" as const,
  nivel: "FORA" as const,
  cumpriuMeta: false,
  desvio: { absoluto: -13, percentual: -46.43, noPiso: false },
  estado: "OK" as const,
  valorAnterior: null,
  variacao: null,
  evolucao: null,
  resumo: "R$ 15,00 de venda por sacola — 100 fardos recebidos no mês.",
  avisoEntregas: null,
};

const DETALHE = {
  indicador: INDICADOR,
  vendaEsperada: {
    valor: 3_000_000,
    fonte: "ESTIMATIVA" as const,
    fracaoRealizada: 0.5,
    realizado: 1_500_000,
  },
  teto: {
    tetoSacolas: 107_142,
    tetoFardos: 107,
    podemEntrarSacolas: 7_142,
    podemEntrarFardos: 7,
    tetoEstourado: false,
    vendaNecessaria: 2_800_000,
    vendaFaltante: 0,
  },
  projecao: {
    valor: 15,
    cumprira: false,
    sacolasNoFechamento: 200_000,
    sacolasPrevistas: 100_000,
    baseDaPrevisao:
      "Supõe 1 entrega a mais (100 fardos, o tamanho da que já veio), porque faltam 15 dias e o ciclo de sacolas é quinzenal.",
  },
  consumoVsEntrada: {
    sacolasRecebidas: 100_000,
    sacolasConsumidas: 60_000,
    variacaoEstoque: 40_000,
    porEntrada: 15,
    porConsumo: 25,
    leitura:
      "Entraram 40 fardos mais do que se usou: o estoque subiu. O indicador oficial (R$ 15,00) fica abaixo do uso real (R$ 25,00) — não é desperdício, é reposição.",
  },
  entradas: [
    {
      data: "2026-09-05",
      dataHora: "2026-09-05T10:00:00.000Z",
      sacolas: 100_000,
      fardos: 100,
      origem: "ENTRADA",
      responsavelNome: "Ana",
    },
  ],
  serie: [
    { data: "2026-09-05", venda: 0, estimativa: null, consumo: 0, entrada: 100_000 },
    { data: "2026-09-06", venda: 1_500_000, estimativa: null, consumo: 60_000, entrada: 0 },
  ],
};

describe("SacolasDetalheScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("destaca quantos fardos ainda cabem no mês", async () => {
    insumosService.detalheSacolas.mockResolvedValue(DETALHE);
    render(<SacolasDetalheScreen />);

    await screen.findByText("Quantas sacolas ainda cabem");
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("fardos ainda cabem neste mês")).toBeTruthy();
    expect(screen.getByText("(7.142 sacolas)")).toBeTruthy();
  });

  it("mostra de onde vem a venda esperada e quanto dela já é fato", async () => {
    insumosService.detalheSacolas.mockResolvedValue(DETALHE);
    render(<SacolasDetalheScreen />);

    await screen.findByText("Quantas sacolas ainda cabem");
    expect(
      screen.getByText(/realizado \+ estimativas dos dias que faltam/),
    ).toBeTruthy();
    expect(screen.getByText(/50% já é venda realizada/)).toBeTruthy();
  });

  /**
   * Sem este aviso, a tela seria lida como "compre menos sacolas" — o que
   * significaria deixar de atender clientes.
   */
  it("avisa que a saída também pode ser vender mais", async () => {
    insumosService.detalheSacolas.mockResolvedValue(DETALHE);
    render(<SacolasDetalheScreen />);

    await screen.findByText("Quantas sacolas ainda cabem");
    expect(screen.getByText(/a saída também pode ser vender mais/)).toBeTruthy();
  });

  it("teto estourado mostra a venda que faltaria, não um número negativo", async () => {
    insumosService.detalheSacolas.mockResolvedValue({
      ...DETALHE,
      teto: {
        tetoSacolas: 107_142,
        tetoFardos: 107,
        podemEntrarSacolas: 0,
        podemEntrarFardos: 0,
        tetoEstourado: true,
        vendaNecessaria: 5_600_000,
        vendaFaltante: 2_600_000,
      },
    });
    render(<SacolasDetalheScreen />);

    await screen.findByText(/já recebeu mais sacolas do que a venda esperada/);
    expect(screen.getByText("R$ 2.600.000,00")).toBeTruthy();
    expect(screen.queryByText("fardos ainda cabem neste mês")).toBeNull();
  });

  it("projeta o fechamento e mostra a suposição por escrito", async () => {
    insumosService.detalheSacolas.mockResolvedValue(DETALHE);
    render(<SacolasDetalheScreen />);

    await screen.findByText("Onde o mês fecha, se nada mudar");
    expect(screen.getByText("Abaixo da meta")).toBeTruthy();
    expect(screen.getByText(/ciclo de sacolas é quinzenal/)).toBeTruthy();
  });

  it("separa acúmulo de estoque de desperdício", async () => {
    insumosService.detalheSacolas.mockResolvedValue(DETALHE);
    render(<SacolasDetalheScreen />);

    await screen.findByText("Recebido × usado no mês");
    expect(screen.getByText("Indicador oficial (pela entrada)")).toBeTruthy();
    expect(screen.getByText("Referência de uso real (pelo consumo)")).toBeTruthy();
    expect(screen.getByText(/não é desperdício, é reposição/)).toBeTruthy();
  });

  it("lista os dias em que entrou sacola, com quem registrou", async () => {
    insumosService.detalheSacolas.mockResolvedValue(DETALHE);
    render(<SacolasDetalheScreen />);

    await screen.findByText("Dias em que entrou sacola");
    expect(screen.getByText("05/09")).toBeTruthy();
    // "100 fardos" também aparece na suposição da projeção, por isso o texto
    // conferido é o do extrato: fardos com as sacolas entre parênteses.
    expect(screen.getByText(/\(100\.000 sacolas\)/)).toBeTruthy();
    expect(screen.getByText(/entrada manual · Ana/)).toBeTruthy();
  });

  it("mês sem entrada de sacola diz isso em vez de listar vazio", async () => {
    insumosService.detalheSacolas.mockResolvedValue({
      ...DETALHE,
      entradas: [],
    });
    render(<SacolasDetalheScreen />);

    await screen.findByText("Dias em que entrou sacola");
    expect(screen.getByText("Nenhuma entrada de sacola neste mês.")).toBeTruthy();
  });

  /**
   * O total de fardos e o número de entregas ficavam na card do painel. Saíram de
   * lá para deixá-la enxuta, então precisam estar escritos aqui: são o denominador
   * do indicador, e sem eles o extrato não se soma a nada.
   */
  it("escreve o recebido do mês em fardos e entregas, acima do extrato", async () => {
    insumosService.detalheSacolas.mockResolvedValue(DETALHE);
    render(<SacolasDetalheScreen />);

    await screen.findByText("Dias em que entrou sacola");
    expect(screen.getByText("Recebido no mês")).toBeTruthy();
    expect(screen.getByText("100 fardos em 1 entrega")).toBeTruthy();
  });

  it("pluraliza as entregas quando houve mais de uma", async () => {
    insumosService.detalheSacolas.mockResolvedValue({
      ...DETALHE,
      indicador: { ...INDICADOR, entregas: 2 },
    });
    render(<SacolasDetalheScreen />);

    await screen.findByText("Dias em que entrou sacola");
    expect(screen.getByText("100 fardos em 2 entregas")).toBeTruthy();
  });
});
