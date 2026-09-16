/**
 * Card "Compensação de horas" (ADR 0021).
 *
 * Os testes cobrem o que a tela promete e o que ela precisa NÃO fazer: mostrar a
 * carteira com as horas que não cabem no ciclo, explicar a ausência de sugestões
 * em vez de exibir uma lista vazia, avisar que cobrir uma falta não a apaga,
 * pedir confirmação antes de qualquer gravação e desaparecer para quem não tem
 * permissão de conceder.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { CartaoCompensacao } from "./CartaoCompensacao";

jest.mock("../../api/services", () => ({
  compensacaoHorasService: {
    painel: jest.fn(),
    aprovar: jest.fn(),
    recusar: jest.fn(),
    cancelar: jest.fn(),
  },
  centralJornadaService: { marcarDebito: jest.fn() },
}));

jest.mock("../../utils/dialogos", () => ({
  confirmar: jest.fn(),
  notificar: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { compensacaoHorasService, centralJornadaService } = require("../../api/services");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { confirmar } = require("../../utils/dialogos");

const H = 3_600_000;

const CARTEIRA_VAZIA = {
  totalSaldoMs: 0,
  pessoasComSaldo: 0,
  pessoasAbaixoDoMinimo: 0,
  totalCoberturaMs: 0,
  totalLiberacaoMs: 0,
  naoAlocadoMs: 0,
  datasDisponiveis: 0,
};

const PERIODO = {
  inicio: "2026-08-26T00:00:00.000Z",
  fim: "2026-09-25T00:00:00.000Z",
  rotulo: "26/08 – 25/09",
  deslocamento: 0,
  diasRestantes: 9,
};

const LIBERACAO = {
  colaboradorId: "c1",
  nome: "Ana Souza",
  funcao: "OPERADOR" as const,
  data: "2026-09-23T00:00:00.000Z",
  diaSemana: 3,
  rotuloDia: "quarta 23/09",
  cargaMs: 7 * H,
  compensarMs: 5 * H,
  trabalharMs: 2 * H,
  semIntervalo: true,
  horaInicio: "08:00",
  horaFim: "10:00",
  ponta: "INICIO" as const,
  saldoAntesMs: 5 * H,
  saldoDepoisMs: 0,
  movimentoPrevisto: 41_200,
  fonteMovimento: "HISTORICO" as const,
  amostras: 8,
  abaixoDaMedia: 0.23,
  coberturaNoDia: 23,
  diasTac: 0,
  justificativa:
    "quarta 23/09 é um dia fraco. Ana trabalha 2h (08:00–10:00), sem intervalo e compensa 5h. Zera o saldo de 50%. Ficam 23 na função.",
};

const COBERTURA = {
  ausenciaId: "a1",
  colaboradorId: "c2",
  nome: "Bruno Lima",
  funcao: "OPERADOR" as const,
  data: "2026-09-02T00:00:00.000Z",
  diaSemana: 3,
  rotuloDia: "quarta 02/09",
  cargaMs: 7 * H,
  saldoAntesMs: 10 * H,
  saldoDepoisMs: 3 * H,
  status: "INJUSTIFICADA" as const,
  justificativa:
    "Bruno Lima tem uma falta não justificada em quarta 02/09 (7h) e 10h de 50% disponíveis. Debitar cobre o dia com horas já trabalhadas, em vez de descontar em folha. Não apaga a falta.",
};

const DATA_FRACA = {
  data: "2026-09-23T00:00:00.000Z",
  diaSemana: 3,
  nomeDia: "quarta",
  rotulo: "quarta 23/09",
  movimentoPrevisto: 41_200,
  fonte: "HISTORICO" as const,
  amostras: 8,
  disponiveis: [
    { funcao: "OPERADOR" as const, total: 24 },
    { funcao: "FISCAL" as const, total: 4 },
    { funcao: "SUPERVISOR" as const, total: 2 },
  ],
};

function painel(over: Record<string, unknown> = {}) {
  return {
    periodo: PERIODO,
    carteira: CARTEIRA_VAZIA,
    datasFracas: [],
    liberacoes: [],
    coberturas: [],
    decididas: [],
    bloqueio: null,
    ...over,
  };
}

describe("CartaoCompensacao", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    confirmar.mockResolvedValue(true);
  });

  it("não aparece para quem não pode conceder", () => {
    compensacaoHorasService.painel.mockResolvedValue(painel());
    render(
      <CartaoCompensacao ciclo={0} podeConceder={false} aoMudar={() => {}} />,
    );
    expect(screen.queryByText("Compensação de horas")).toBeNull();
    expect(compensacaoHorasService.painel).not.toHaveBeenCalled();
  });

  it("mostra a carteira, com destaque para o que NÃO cabe no ciclo", async () => {
    compensacaoHorasService.painel.mockResolvedValue(
      painel({
        carteira: {
          ...CARTEIRA_VAZIA,
          totalSaldoMs: 32 * H,
          pessoasComSaldo: 5,
          totalLiberacaoMs: 21 * H,
          naoAlocadoMs: 11 * H,
          datasDisponiveis: 4,
        },
      }),
    );
    render(
      <CartaoCompensacao ciclo={0} podeConceder aoMudar={() => {}} />,
    );

    await screen.findByText("50% em aberto");
    expect(screen.getByText("32h 00min")).toBeTruthy();
    expect(screen.getByText("Não cabe no ciclo")).toBeTruthy();
    expect(screen.getByText("11h 00min")).toBeTruthy();
    expect(screen.getByText("será pago")).toBeTruthy();
  });

  it("explica POR QUE não há sugestões em vez de mostrar lista vazia", async () => {
    compensacaoHorasService.painel.mockResolvedValue(
      painel({ bloqueio: "SEM_DADO_DE_VENDA" }),
    );
    render(<CartaoCompensacao ciclo={0} podeConceder aoMudar={() => {}} />);

    await waitFor(() =>
      expect(
        screen.getByText(/Ainda não há venda suficiente/),
      ).toBeTruthy(),
    );
  });

  it("avisa que um ciclo passado não recebe compensação", async () => {
    compensacaoHorasService.painel.mockResolvedValue(
      painel({ bloqueio: "CICLO_PASSADO" }),
    );
    render(<CartaoCompensacao ciclo={-1} podeConceder aoMudar={() => {}} />);

    await waitFor(() =>
      expect(
        screen.getByText(/cada ciclo é independente em horas/i),
      ).toBeTruthy(),
    );
  });

  it("mostra a liberação com o dia, as horas e a justificativa", async () => {
    compensacaoHorasService.painel.mockResolvedValue(
      painel({ liberacoes: [LIBERACAO], datasFracas: [DATA_FRACA] }),
    );
    render(<CartaoCompensacao ciclo={0} podeConceder aoMudar={() => {}} />);

    await screen.findByText("Ana Souza");
    expect(screen.getByText("08:00–10:00")).toBeTruthy();
    expect(screen.getByText("Compensa 5h 00min")).toBeTruthy();
    expect(screen.getByText("Trabalha 2h 00min")).toBeTruthy();
    expect(screen.getByText("Sem intervalo")).toBeTruthy();
    expect(screen.getByText("Zera as 50%")).toBeTruthy();
    expect(screen.getByText(LIBERACAO.justificativa)).toBeTruthy();
    // A régua que sustenta a sugestão fica à vista.
    expect(screen.getByText("R$ 41,2 mil")).toBeTruthy();
    expect(screen.getByText("24 no caixa")).toBeTruthy();
  });

  it("concede a liberação só depois de confirmar, com os minutos certos", async () => {
    compensacaoHorasService.painel.mockResolvedValue(
      painel({ liberacoes: [LIBERACAO] }),
    );
    compensacaoHorasService.aprovar.mockResolvedValue({});
    const aoMudar = jest.fn();
    render(<CartaoCompensacao ciclo={0} podeConceder aoMudar={aoMudar} />);

    fireEvent.press(await screen.findByText("Conceder"));

    await waitFor(() =>
      expect(compensacaoHorasService.aprovar).toHaveBeenCalledWith(
        expect.objectContaining({
          colaboradorId: "c1",
          data: LIBERACAO.data,
          minutosCompensados: 300,
          horaInicio: "08:00",
          horaFim: "10:00",
          origem: "SUGESTAO",
        }),
      ),
    );
    expect(confirmar).toHaveBeenCalled();
    // A Central precisa recarregar: o saldo do time mudou.
    expect(aoMudar).toHaveBeenCalled();
  });

  it("não grava nada quando a confirmação é negada", async () => {
    confirmar.mockResolvedValue(false);
    compensacaoHorasService.painel.mockResolvedValue(
      painel({ liberacoes: [LIBERACAO] }),
    );
    render(<CartaoCompensacao ciclo={0} podeConceder aoMudar={() => {}} />);

    fireEvent.press(await screen.findByText("Conceder"));
    await waitFor(() => expect(confirmar).toHaveBeenCalled());
    expect(compensacaoHorasService.aprovar).not.toHaveBeenCalled();
  });

  it("descartar registra a recusa (para a sugestão não voltar)", async () => {
    compensacaoHorasService.painel.mockResolvedValue(
      painel({ liberacoes: [LIBERACAO] }),
    );
    compensacaoHorasService.recusar.mockResolvedValue({});
    render(<CartaoCompensacao ciclo={0} podeConceder aoMudar={() => {}} />);

    fireEvent.press(await screen.findByText("Descartar"));

    await waitFor(() =>
      expect(compensacaoHorasService.recusar).toHaveBeenCalledWith(
        "c1",
        LIBERACAO.data,
      ),
    );
  });

  it("cobrir falta usa o débito que já existe e avisa que a falta fica", async () => {
    compensacaoHorasService.painel.mockResolvedValue(
      painel({ coberturas: [COBERTURA] }),
    );
    centralJornadaService.marcarDebito.mockResolvedValue({});
    render(<CartaoCompensacao ciclo={0} podeConceder aoMudar={() => {}} />);

    await screen.findByText("Bruno Lima");
    expect(
      screen.getByText(/Não apaga a falta nem o registro para advertência/),
    ).toBeTruthy();

    fireEvent.press(screen.getByText("Cobrir com horas"));

    await waitFor(() =>
      expect(centralJornadaService.marcarDebito).toHaveBeenCalledWith("a1", true),
    );
    // O texto da confirmação também tem de dizer que a falta permanece.
    expect(confirmar).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("NÃO apaga a falta"),
      expect.any(String),
    );
  });

  it("lista o que já foi concedido e permite desfazer", async () => {
    compensacaoHorasService.painel.mockResolvedValue(
      painel({
        decididas: [
          {
            id: "k1",
            colaboradorId: "c1",
            nome: "Ana Souza",
            data: LIBERACAO.data,
            diaSemana: 3,
            rotuloDia: "quarta 23/09",
            minutosCompensados: 300,
            minutosTrabalhados: 120,
            horaInicio: "08:00",
            horaFim: "10:00",
            semIntervalo: true,
            status: "APROVADA",
            origem: "SUGESTAO",
            motivo: null,
            decididoPorNome: "Gerente",
            decididoEm: "2026-09-16T12:00:00.000Z",
          },
        ],
      }),
    );
    compensacaoHorasService.cancelar.mockResolvedValue({});
    render(<CartaoCompensacao ciclo={0} podeConceder aoMudar={() => {}} />);

    await screen.findByText("Já concedidas neste ciclo");
    expect(screen.getByText(/compensa 5h 00min/)).toBeTruthy();

    fireEvent.press(screen.getByText("Desfazer"));
    await waitFor(() =>
      expect(compensacaoHorasService.cancelar).toHaveBeenCalledWith("k1"),
    );
  });

  it("avisa quando há gente com menos de 3h (ainda não vale mexer na escala)", async () => {
    compensacaoHorasService.painel.mockResolvedValue(
      painel({
        carteira: {
          ...CARTEIRA_VAZIA,
          totalSaldoMs: 2 * H,
          pessoasComSaldo: 1,
          pessoasAbaixoDoMinimo: 1,
        },
      }),
    );
    render(<CartaoCompensacao ciclo={0} podeConceder aoMudar={() => {}} />);

    await waitFor(() =>
      expect(screen.getByText(/menos de 3h/)).toBeTruthy(),
    );
  });
});
