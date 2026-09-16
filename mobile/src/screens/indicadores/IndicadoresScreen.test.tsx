/**
 * Painel de Indicadores — foco nas duas cards de indicadores **calculados**:
 * Sacolas (ADR 0022) e Cancelamentos Totais (ADR 0025).
 *
 * O que os testes travam, nos dois: o valor vem sempre acompanhado da distância
 * até a meta (o pedido do dono do projeto), um mês sem o denominador NÃO aparece
 * como zero, os avisos de contexto aparecem, e uma falha num deles não derruba o
 * painel inteiro.
 */
import { render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { IndicadoresScreen } from "./IndicadoresScreen";

jest.mock("../../api/services", () => ({
  arrecadacaoService: {
    resumo: jest.fn(),
    destaquesMes: jest.fn(),
    painelAtencao: jest.fn(),
    cancelamentosTotais: jest.fn(),
  },
  vendasService: { resumo: jest.fn() },
  insumosService: { indicadorSacolas: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { arrecadacaoService, vendasService, insumosService } = require("../../api/services");

const navigation = { navigate: jest.fn() } as never;

/** Resumo de arrecadação mínimo, para os cinco indicadores existentes. */
const RESUMO_ARRECADACAO = {
  tipo: "TROCO_SOLIDARIO",
  titulo: "Troco Solidário",
  base: "FIXA",
  meta: 2000,
  sentido: "MAIOR_MELHOR",
  totalDia: 0,
  totalSemana: 0,
  totalMes: 2500,
  quantidadeDia: 0,
  itensDia: 0,
  itensSemana: 0,
  itensMes: 0,
};

/** Indicador de sacolas base: R$ 30,00 por sacola contra piso de R$ 28,00. */
const SACOLAS = {
  anoMes: "2026-09",
  rotulo: "Set/26",
  parcial: true,
  vendaMes: 3_000_000,
  sacolasRecebidas: 100_000,
  fardosRecebidos: 100,
  entregas: 2,
  fatorEmbalagem: 1000,
  valor: 30,
  meta: 28,
  unidade: "REAIS_POR_UNIDADE" as const,
  sentido: "MAIOR_MELHOR" as const,
  nivel: "OK" as const,
  cumpriuMeta: true,
  desvio: { absoluto: 2, percentual: 7.14, noPiso: true },
  estado: "OK" as const,
  valorAnterior: 28,
  variacao: 7.14,
  evolucao: "MELHOROU" as const,
  resumo: "R$ 30,00 de venda por sacola — 100 fardos recebidos no mês.",
  avisoEntregas: null,
};

/**
 * Indicador Cancelamentos Totais base (ADR 0025): 1,10% das vendas contra um
 * teto de 0,75%, ou seja R$ 350 acima do que o teto permitia.
 */
const TOTAIS = {
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
};

function preparar(sacolas: unknown = SACOLAS, totais: unknown = TOTAIS) {
  arrecadacaoService.resumo.mockResolvedValue(RESUMO_ARRECADACAO);
  arrecadacaoService.destaquesMes.mockResolvedValue(null);
  arrecadacaoService.painelAtencao.mockResolvedValue({ tudoCerto: true, criticos: 0, emAtencao: 0, alertas: [] });
  arrecadacaoService.cancelamentosTotais.mockResolvedValue(totais);
  vendasService.resumo.mockResolvedValue({ totalDia: 0, totalSemana: 0, totalMes: 3_000_000 });
  insumosService.indicadorSacolas.mockResolvedValue(sacolas);
}

describe("IndicadoresScreen — card de Sacolas", () => {
  beforeEach(() => jest.clearAllMocks());

  it("mostra a venda por sacola com a distância até o piso", async () => {
    preparar();
    render(<IndicadoresScreen navigation={navigation} route={{} as never} />);

    await screen.findByText("Sacolas");
    // O valor NUNCA aparece sozinho: vem com o desvio e o piso.
    expect(
      screen.getByText(/R\$\s?30,00 por sacola · \+R\$\s?2,00 \(piso R\$\s?28,00\)/),
    ).toBeTruthy();
  });

  it("mostra os fardos recebidos, as entregas e o mês em andamento", async () => {
    preparar();
    render(<IndicadoresScreen navigation={navigation} route={{} as never} />);

    await screen.findByText("Sacolas");
    expect(
      screen.getByText("100 fardos recebidos em 2 entregas · mês em andamento"),
    ).toBeTruthy();
  });

  it("abaixo do piso mostra o desvio negativo", async () => {
    preparar({
      ...SACOLAS,
      valor: 22,
      nivel: "ATENCAO",
      cumpriuMeta: false,
      desvio: { absoluto: -6, percentual: -21.43, noPiso: false },
    });
    render(<IndicadoresScreen navigation={navigation} route={{} as never} />);

    await screen.findByText("Sacolas");
    expect(screen.getByText(/−R\$\s?6,00 \(piso R\$\s?28,00\)/)).toBeTruthy();
  });

  /**
   * O caso que o desenho existe para evitar: sem entrega, "R$ 0,00 por sacola"
   * se leria como catástrofe. A verdade é que o caminhão não veio.
   */
  it("mês sem entrada de sacola não mostra R$ 0,00 — explica", async () => {
    preparar({
      ...SACOLAS,
      valor: null,
      nivel: null,
      cumpriuMeta: null,
      desvio: null,
      estado: "SEM_ENTRADA",
      sacolasRecebidas: 0,
      fardosRecebidos: 0,
      entregas: 0,
    });
    render(<IndicadoresScreen navigation={navigation} route={{} as never} />);

    await screen.findByText("Sacolas");
    expect(screen.getByText("Sem entrada de sacolas neste mês")).toBeTruthy();
    expect(screen.queryByText(/R\$\s?0,00 por sacola/)).toBeNull();
  });

  it("mês sem venda registrada também é explicado", async () => {
    preparar({ ...SACOLAS, valor: null, nivel: null, desvio: null, estado: "SEM_VENDA" });
    render(<IndicadoresScreen navigation={navigation} route={{} as never} />);

    await screen.findByText("Sacolas");
    expect(screen.getByText("Sem venda registrada neste mês")).toBeTruthy();
  });

  it("avisa quando o mês teve um número atípico de entregas", async () => {
    preparar({
      ...SACOLAS,
      entregas: 1,
      avisoEntregas:
        "Só 1 entrega neste mês (o normal são 2, pelo ciclo quinzenal). O indicador tende a ficar mais alto do que a operação real.",
    });
    render(<IndicadoresScreen navigation={navigation} route={{} as never} />);

    await screen.findByText("Sacolas");
    expect(screen.getByText(/Só 1 entrega neste mês/)).toBeTruthy();
  });

  it("uma falha no indicador de sacolas não derruba o painel", async () => {
    preparar();
    insumosService.indicadorSacolas.mockRejectedValue(new Error("indisponível"));

    render(<IndicadoresScreen navigation={navigation} route={{} as never} />);

    // Os outros indicadores seguem na tela; a card de Sacolas simplesmente não
    // aparece (mesmo padrão de degradação dos destaques e do painel de atenção).
    await waitFor(() => expect(screen.getByText("Troco Solidário")).toBeTruthy());
    expect(screen.queryByText("Sacolas")).toBeNull();
  });

  it("pede o indicador do mês selecionado", async () => {
    preparar();
    render(<IndicadoresScreen navigation={navigation} route={{} as never} />);

    await screen.findByText("Sacolas");
    expect(insumosService.indicadorSacolas).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}$/),
    );
  });
});

/**
 * Card de **Cancelamentos Totais** (ADR 0025).
 *
 * O que estes testes travam: o valor nunca aparece sozinho (vem com o desvio até
 * o teto), o excedente em R$ é visível, a card avisa que é a soma das duas de
 * cima e que o teto é próprio, um mês sem venda não vira "0,00% verde", e uma
 * falha aqui não derruba o painel.
 */
describe("IndicadoresScreen — card de Cancelamentos Totais", () => {
  beforeEach(() => jest.clearAllMocks());

  it("mostra o percentual com a distância até o teto", async () => {
    preparar();
    render(<IndicadoresScreen navigation={navigation} route={{} as never} />);

    await screen.findByText("Cancelamentos Totais");
    expect(screen.getByText("1,10% · +0,35 p.p. (teto 0,75%)")).toBeTruthy();
  });

  it("traduz o excesso em dinheiro, que é o número discutível", async () => {
    preparar();
    render(<IndicadoresScreen navigation={navigation} route={{} as never} />);

    await screen.findByText("Cancelamentos Totais");
    expect(
      screen.getByText(/R\$\s?350,00 acima do que o teto permitia no mês/),
    ).toBeTruthy();
  });

  /**
   * Sem este aviso o gestor somaria de novo o que já está somado, e estranharia
   * as duas metades verdes com o total amarelo.
   */
  it("avisa que é a soma das duas cards acima e que o teto é próprio", async () => {
    preparar();
    render(<IndicadoresScreen navigation={navigation} route={{} as never} />);

    await screen.findByText("Cancelamentos Totais");
    expect(
      screen.getByText(
        /Soma das duas cards acima · teto próprio, não a soma dos dois tetos/,
      ),
    ).toBeTruthy();
  });

  it("dentro do teto não mostra linha de excedente", async () => {
    preparar(SACOLAS, {
      ...TOTAIS,
      total: 600,
      percentual: 0.6,
      nivel: "OK",
      cumpriuMeta: true,
      desvio: { absoluto: -0.15, percentual: -20, dentro: true },
      excedente: 0,
    });
    render(<IndicadoresScreen navigation={navigation} route={{} as never} />);

    await screen.findByText("Cancelamentos Totais");
    expect(screen.getByText("0,60% · −0,15 p.p. (teto 0,75%)")).toBeTruthy();
    expect(screen.queryByText(/acima do que o teto permitia/)).toBeNull();
  });

  /**
   * O erro que este indicador nasceu corrigindo: os outros devolvem 0% quando as
   * vendas do mês não foram importadas, e o painel pinta VERDE um mês em que só
   * falta um arquivo.
   */
  it("mês sem venda registrada não vira 0,00% verde — explica", async () => {
    preparar(SACOLAS, {
      ...TOTAIS,
      vendas: 0,
      percentual: null,
      nivel: null,
      cumpriuMeta: null,
      desvio: null,
      estado: "SEM_VENDA",
      limiteReais: null,
      excedente: null,
    });
    render(<IndicadoresScreen navigation={navigation} route={{} as never} />);

    await screen.findByText("Cancelamentos Totais");
    expect(screen.getByText("Sem venda registrada neste mês")).toBeTruthy();
    // Sem denominador não há valor nem teto para comparar: a card não escreve
    // percentual nenhum (é justamente o "0,00% verde" que se quer evitar).
    expect(screen.queryByText(/\(teto 0,75%\)/)).toBeNull();
  });

  it("uma falha no indicador não derruba o painel", async () => {
    preparar();
    arrecadacaoService.cancelamentosTotais.mockRejectedValue(
      new Error("indisponível"),
    );

    render(<IndicadoresScreen navigation={navigation} route={{} as never} />);

    await waitFor(() => expect(screen.getByText("Troco Solidário")).toBeTruthy());
    expect(screen.queryByText("Cancelamentos Totais")).toBeNull();
  });

  it("pede o indicador do mês selecionado", async () => {
    preparar();
    render(<IndicadoresScreen navigation={navigation} route={{} as never} />);

    await screen.findByText("Cancelamentos Totais");
    expect(arrecadacaoService.cancelamentosTotais).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}$/),
    );
  });
});
