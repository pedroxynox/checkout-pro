/**
 * Painel de inconsistências: agrupa os problemas do ciclo por dia (seções
 * recolhíveis) e filtra apenas por pessoa (nome).
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { InconsistenciasScreen } from "./InconsistenciasScreen";

jest.mock("../../api/services", () => ({
  centralJornadaService: { inconsistencias: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { centralJornadaService } = require("../../api/services");

const RESPOSTA = {
  periodo: { inicio: "", fim: "", rotulo: "26/06 – 25/07", deslocamento: 0 },
  totais: {
    incompletas: 1,
    duplicadas: 0,
    conflitos: 1,
    atrasos: 0,
    tac: 0,
    pontoEmFolga: 0,
    total: 2,
  },
  itens: [
    {
      colaboradorId: "c1",
      nome: "Ana Souza",
      primeiroNome: "Ana",
      funcao: "OPERADOR",
      data: "2026-06-28T00:00:00.000Z",
      diaSemana: 0,
      ehFeriado: false,
      tipo: "INCOMPLETA",
      detalhe: "Falta registrar: encerramento",
    },
    {
      colaboradorId: "c2",
      nome: "Bruno Lima",
      primeiroNome: "Bruno",
      funcao: "FISCAL",
      data: "2026-06-29T00:00:00.000Z",
      diaSemana: 1,
      ehFeriado: false,
      tipo: "CONFLITO_AUSENCIA",
      detalhe: "Bateu ponto e tem falta/atestado marcado no mesmo dia",
    },
  ],
};

describe("InconsistenciasScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    centralJornadaService.inconsistencias.mockResolvedValue(RESPOSTA);
  });

  it("agrupa por dia e expande ao tocar no dia", async () => {
    render(<InconsistenciasScreen />);
    // Cabeçalhos de dia aparecem (Ana em 28/06, Bruno em 29/06).
    const diaAna = await screen.findByText(/28\/06/);
    expect(screen.getByText(/29\/06/)).toBeTruthy();
    // Recolhido por padrão: os nomes ainda não aparecem.
    expect(screen.queryByText("Ana Souza")).toBeNull();
    // Ao tocar no dia, expande e mostra a pessoa daquele dia.
    fireEvent.press(diaAna);
    expect(screen.getByText("Ana Souza")).toBeTruthy();
  });

  it("filtra apenas por pessoa (nome)", async () => {
    render(<InconsistenciasScreen />);
    await screen.findByText(/28\/06/);

    fireEvent.changeText(
      screen.getByPlaceholderText("Nome do colaborador…"),
      "bruno",
    );

    // O dia da Ana some; fica só o dia do Bruno.
    expect(screen.queryByText(/28\/06/)).toBeNull();
    const diaBruno = screen.getByText(/29\/06/);
    fireEvent.press(diaBruno);
    expect(screen.getByText("Bruno Lima")).toBeTruthy();
  });

  it("mostra o item de ESCALA (ponto em dia de folga) com a sugestão", async () => {
    // Este tipo não é uma irregularidade da pessoa: ela trabalhou num dia que o
    // cadastro diz ser folga dela, o que quase sempre significa que a folga mudou
    // sem alguém atualizar o sistema. O rótulo é "Escala" — o que precisa de
    // correção é o cadastro, não a conduta dela.
    centralJornadaService.inconsistencias.mockResolvedValue({
      ...RESPOSTA,
      totais: { ...RESPOSTA.totais, pontoEmFolga: 1, total: 3 },
      itens: [
        ...RESPOSTA.itens,
        {
          colaboradorId: "c3",
          nome: "Carla Dias",
          primeiroNome: "Carla",
          funcao: "OPERADOR",
          data: "2026-06-30T00:00:00.000Z",
          diaSemana: 2,
          ehFeriado: false,
          tipo: "PONTO_EM_FOLGA",
          detalhe:
            "Trabalhou num dia marcado como FOLGA no cadastro. O ponto está " +
            "correto — confira a escala. Nas últimas 3 semanas ela trabalhou " +
            "toda terça e não apareceu nenhuma quinta — a folga parece ter " +
            "mudado para quinta. Confirme no cadastro.",
        },
      ],
    });
    render(<InconsistenciasScreen />);

    const diaCarla = await screen.findByText(/30\/06/);
    fireEvent.press(diaCarla);

    expect(screen.getByText("Carla Dias")).toBeTruthy();
    expect(screen.getByText("Escala")).toBeTruthy();
    // A sugestão do novo dia de folga chega junto do detalhe.
    expect(
      screen.getByText(/folga parece ter mudado para quinta/),
    ).toBeTruthy();
  });
});
