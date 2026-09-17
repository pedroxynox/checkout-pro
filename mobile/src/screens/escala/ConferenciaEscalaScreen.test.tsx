/**
 * Conferência de escala (ADR 0026).
 *
 * O que estes testes travam é o propósito da tela, e ele mudou junto com a ADR.
 * Antes a pergunta era "dá para mover a cobrança de ponto para a ficha, e quem
 * seria afetado?" — a tela respondeu (sete pessoas, em produção) e a troca foi
 * feita. Agora a hora cobrada é a da ficha, e uma diferença com a cópia semanal
 * não afeta mais ninguém.
 *
 * Então o que se trava aqui é o novo assunto: as **lacunas da ficha**, que agora
 * não têm nada por baixo para as cobrir, e a separação entre elas e o resquício
 * informativo da cópia semanal. O teste mais importante é o quarto: a cópia
 * desatualizada não pode voltar a ser apresentada como um problema de cobrança.
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
  fichasComLacuna: 0,
  nomesComLacuna: [],
  ok: true,
};

describe("ConferenciaEscalaScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sem lacunas, diz que o controle de ponto cobre a equipe inteira", async () => {
    escalaService.conferenciaEscala.mockResolvedValue(LIMPO);
    render(<ConferenciaEscalaScreen />);

    await screen.findByText("Conferência de escala");
    expect(screen.getByText("6 fiscais ativos · 6 sem divergência")).toBeTruthy();
    expect(
      screen.getByText(/Todas as fichas têm horário completo/),
    ).toBeTruthy();
    expect(
      screen.getByText("Fichas completas e cópia semanal em dia. Nada a ajustar."),
    ).toBeTruthy();
  });

  /**
   * O caso mais grave depois da troca de fonte: sem horário na ficha não há hora
   * esperada, e sem hora esperada a pessoa não entra na equipe do dia — nunca
   * aparece atrasada, nunca recebe falta. Antes a cópia sobrevivente do seed
   * escondia esse vazio cobrando um horário que ninguém tinha revisado.
   */
  it("aponta a ficha sem horário e diz que a pessoa não é esperada", async () => {
    escalaService.conferenciaEscala.mockResolvedValue({
      ...LIMPO,
      incoerentes: [
        {
          colaboradorId: "c1",
          nome: "Bia",
          matricula: "1001",
          fichaVazia: true,
          dias: [
            {
              diaSemana: 2,
              ficha: null,
              escala: { entrada: "07:25", saida: "15:20", folga: false },
              minutosDeDiferenca: 0,
            },
          ],
        },
      ],
      coerentes: 5,
      fichasComLacuna: 1,
      nomesComLacuna: ["Bia"],
      ok: false,
    });
    render(<ConferenciaEscalaScreen />);

    await screen.findByText("Ficha sem horário");
    expect(screen.getByText(/1 ficha\(s\) com informação faltando/)).toBeTruthy();
    expect(screen.getByText(/não é esperada em dia nenhum/)).toBeTruthy();
    expect(
      screen.getByText(/a cópia semanal ainda guarda 07:25–15:20/),
    ).toBeTruthy();
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
              minutosDeDiferenca: 65,
            },
          ],
        },
      ],
      ok: false,
    });
    render(<ConferenciaEscalaScreen />);

    await screen.findByText("Cópia semanal desatualizada");
    expect(screen.getByText(/1h05 de diferença/)).toBeTruthy();
  });

  /**
   * A diferença com a cópia semanal é informação, não problema — e a tela tem de
   * dizer isso com todas as letras. Se ela voltar a apresentá-la como algo a
   * corrigir, a gestão gasta tempo com uma lista que não muda nada.
   */
  it("apresenta a cópia desatualizada como informação, sem nada a fazer", async () => {
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
              minutosDeDiferenca: 10,
            },
          ],
        },
      ],
      ok: false,
    });
    render(<ConferenciaEscalaScreen />);

    await screen.findByText("Cópia semanal desatualizada");
    expect(screen.queryByText("Ficha sem horário")).toBeNull();
    // Nenhuma lacuna de ficha: o resumo segue verde.
    expect(
      screen.getByText(/Todas as fichas têm horário completo/),
    ).toBeTruthy();
    expect(
      screen.getByText(/ficha 07:00–15:20 · cópia 06:50–15:20/),
    ).toBeTruthy();
    expect(
      screen.getByText(/estas diferenças não afetam ninguém/),
    ).toBeTruthy();
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
      fichasComLacuna: 1,
      nomesComLacuna: ["Carla"],
      ok: false,
    });
    render(<ConferenciaEscalaScreen />);

    await screen.findByText("Ficha sem dia de folga");
    expect(
      screen.getByText(/hoje descansa Seg por causa da cópia semanal/),
    ).toBeTruthy();
    expect(screen.getByText(/ficariam escaladas todos\s+os dias/)).toBeTruthy();
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
      fichasComLacuna: 1,
      nomesComLacuna: ["Duda"],
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
