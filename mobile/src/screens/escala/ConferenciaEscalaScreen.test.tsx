/**
 * Conferência de escala (ADR 0026, etapa 2).
 *
 * O que estes testes travam é o propósito da tela: ela não existe para listar
 * divergências, e sim para responder **se dá para mover a cobrança de ponto para a
 * ficha e quem seria afetado**. Então travam o veredito, a separação entre o risco
 * real (a cobrança adiantaria) e o ruído (divergência que não muda cobrança), e as
 * duas pendências que a versão anterior do diagnóstico não via: ficha sem dia de
 * folga e domingo sem horário.
 */
import { render, screen } from "@testing-library/react-native";
import React from "react";
import { ConferenciaEscalaScreen } from "./ConferenciaEscalaScreen";

jest.mock("../../api/services", () => ({
  escalaService: { conferenciaEscala: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { escalaService } = require("../../api/services");

/** Relatório sem nenhuma pendência. */
const LIMPO = {
  incoerentes: [],
  semEscala: [],
  horarioIncompleto: [],
  duplicadas: [],
  semFolgaNaFicha: [],
  domingoSemHorario: [],
  totalFiscaisAtivos: 6,
  coerentes: 6,
  bloqueiamEtapa2: 0,
  nomesQueBloqueiam: [],
  ok: true,
};

describe("ConferenciaEscalaScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sem pendências, diz que dá para acertar a cobrança", async () => {
    escalaService.conferenciaEscala.mockResolvedValue(LIMPO);
    render(<ConferenciaEscalaScreen />);

    await screen.findByText("Conferência de escala");
    expect(screen.getByText("6 fiscais ativos · 6 sem divergência")).toBeTruthy();
    expect(
      screen.getByText(/Nenhuma pessoa seria cobrada mais cedo/),
    ).toBeTruthy();
    expect(
      screen.getByText("Fichas e escala semanal coerentes. Nada a ajustar."),
    ).toBeTruthy();
  });

  /**
   * O caso que decide a etapa 2: a escala semanal é mais tardia, então é ela que
   * vale hoje. Passar a valer a ficha adianta a cobrança — com nome, dia e minutos.
   */
  it("nomeia quem seria cobrado mais cedo, com o dia e os minutos", async () => {
    escalaService.conferenciaEscala.mockResolvedValue({
      ...LIMPO,
      incoerentes: [
        {
          colaboradorId: "c1",
          nome: "Bia",
          matricula: "1001",
          fichaVazia: false,
          dias: [
            {
              diaSemana: 2,
              ficha: { entrada: "07:00", saida: "15:20", folga: false },
              escala: { entrada: "07:25", saida: "15:20", folga: false },
              efeito: "COBRA_MAIS_CEDO",
              minutosAdiantados: 25,
            },
          ],
        },
      ],
      coerentes: 5,
      bloqueiamEtapa2: 1,
      nomesQueBloqueiam: ["Bia"],
      ok: false,
    });
    render(<ConferenciaEscalaScreen />);

    await screen.findByText("Seriam cobrados mais cedo");
    expect(screen.getByText(/1 pessoa\(s\) seriam afetadas/)).toBeTruthy();
    expect(screen.getByText(/passaria a cobrar 25 min mais cedo/)).toBeTruthy();
  });

  it("converte a distância em horas quando passa de uma hora", async () => {
    escalaService.conferenciaEscala.mockResolvedValue({
      ...LIMPO,
      incoerentes: [
        {
          colaboradorId: "c1",
          nome: "Bia",
          matricula: "1001",
          fichaVazia: false,
          dias: [
            {
              diaSemana: 5,
              ficha: { entrada: "07:00", saida: "15:20", folga: false },
              escala: { entrada: "08:05", saida: "15:20", folga: false },
              efeito: "COBRA_MAIS_CEDO",
              minutosAdiantados: 65,
            },
          ],
        },
      ],
      bloqueiamEtapa2: 1,
      nomesQueBloqueiam: ["Bia"],
      ok: false,
    });
    render(<ConferenciaEscalaScreen />);

    await screen.findByText("Seriam cobrados mais cedo");
    expect(screen.getByText(/1h05 mais cedo/)).toBeTruthy();
  });

  /**
   * Separar o risco do ruído é o que faz um relatório ser lido. Uma divergência
   * que não muda a hora cobrada não pode aparecer no mesmo bloco de quem pode
   * receber falta.
   */
  it("separa a divergência que não muda a cobrança", async () => {
    escalaService.conferenciaEscala.mockResolvedValue({
      ...LIMPO,
      incoerentes: [
        {
          colaboradorId: "c2",
          nome: "Ana",
          matricula: "1002",
          fichaVazia: false,
          dias: [
            {
              diaSemana: 3,
              ficha: { entrada: "07:00", saida: "15:20", folga: false },
              escala: { entrada: "06:50", saida: "15:20", folga: false },
              efeito: "SEM_EFEITO",
              minutosAdiantados: 0,
            },
          ],
        },
      ],
      bloqueiamEtapa2: 0,
      nomesQueBloqueiam: [],
      ok: false,
    });
    render(<ConferenciaEscalaScreen />);

    await screen.findByText("Outras divergências");
    expect(screen.queryByText("Seriam cobrados mais cedo")).toBeNull();
    expect(screen.getByText(/Nenhuma pessoa seria cobrada mais cedo/)).toBeTruthy();
    expect(screen.getByText(/ficha 07:00–15:20 · escala 06:50–15:20/)).toBeTruthy();
  });

  it("aponta a ficha sem dia de folga e explica o que aconteceria", async () => {
    escalaService.conferenciaEscala.mockResolvedValue({
      ...LIMPO,
      semFolgaNaFicha: [
        {
          colaboradorId: "c3",
          nome: "Carla",
          matricula: "1003",
          diasDeFolgaNaEscala: [1],
        },
      ],
      bloqueiamEtapa2: 1,
      nomesQueBloqueiam: ["Carla"],
      ok: false,
    });
    render(<ConferenciaEscalaScreen />);

    await screen.findByText("Ficha sem dia de folga");
    expect(
      screen.getByText(/hoje descansa Seg por causa da escala semanal/),
    ).toBeTruthy();
    expect(
      screen.getByText(/ficariam escaladas todos\s+os dias/),
    ).toBeTruthy();
  });

  it("aponta quem trabalha domingo sem horário de domingo, e cita o feriado", async () => {
    escalaService.conferenciaEscala.mockResolvedValue({
      ...LIMPO,
      domingoSemHorario: [
        {
          colaboradorId: "c4",
          nome: "Duda",
          matricula: "1004",
          grupoDomingo: "G2",
          falta: "AMBAS",
        },
      ],
      ok: false,
    });
    render(<ConferenciaEscalaScreen />);

    await screen.findByText("Trabalham domingo sem horário de domingo");
    expect(screen.getByText("Duda · grupo G2")).toBeTruthy();
    expect(screen.getByText(/falta entrada e saída de domingo/)).toBeTruthy();
    expect(
      screen.getByText(/horário de domingo também é o de feriado/),
    ).toBeTruthy();
  });

  it("diz como corrigir, sem oferecer nenhum botão que altere dados", async () => {
    escalaService.conferenciaEscala.mockResolvedValue(LIMPO);
    render(<ConferenciaEscalaScreen />);

    await screen.findByText("Conferência de escala");
    expect(
      screen.getByText(/abrir a ficha do colaborador, ajustar o/),
    ).toBeTruthy();
  });
});
