/**
 * Serviço da COMPENSAÇÃO DE HORAS (ADR 0021) — seção da Central de Jornada.
 *
 * Espelha 1:1 os tipos do backend (`compensacao-horas.service.ts`). O app não
 * recalcula nada: as sugestões, as justificativas e os números chegam prontos,
 * para a tela e o servidor nunca contarem histórias diferentes.
 */
import { apiClient } from "../client";
import type { FuncaoPessoa } from "./centralJornada";

/** Funções que entram em escala (gerência não é escalada, logo não compensa). */
export type FuncaoCompensavel = "OPERADOR" | "FISCAL" | "SUPERVISOR";

/** De onde veio a previsão de movimento de uma data. */
export type FonteMovimento = "ESTIMATIVA" | "HISTORICO";

export interface PeriodoCompensacao {
  inicio: string;
  fim: string;
  rotulo: string;
  deslocamento: number;
  /** Dias do ciclo que ainda podem receber compensação. */
  diasRestantes: number;
}

/** Resumo da carteira de 50% do time no ciclo. */
export interface ResumoCarteira {
  totalSaldoMs: number;
  pessoasComSaldo: number;
  /** Pessoas com saldo abaixo do mínimo de 3h (ainda não sugeríveis). */
  pessoasAbaixoDoMinimo: number;
  totalCoberturaMs: number;
  totalLiberacaoMs: number;
  /**
   * Horas de 50% que **não couberam** nos dias que restam do ciclo. É o número
   * que interessa: como compensar no ciclo seguinte é proibido, estas horas
   * serão pagas — e saber disso no dia 12 permite agir.
   */
  naoAlocadoMs: number;
  datasDisponiveis: number;
}

/** Uma data do ciclo disponível, com o movimento previsto. */
export interface DataFracaView {
  data: string;
  diaSemana: number;
  nomeDia: string;
  rotulo: string;
  movimentoPrevisto: number;
  fonte: FonteMovimento;
  amostras: number;
  disponiveis: { funcao: FuncaoCompensavel; total: number }[];
}

/** Uma liberação sugerida (dia futuro em que a pessoa trabalha menos). */
export interface LiberacaoView {
  colaboradorId: string;
  nome: string;
  funcao: FuncaoCompensavel;
  data: string;
  diaSemana: number;
  rotuloDia: string;
  cargaMs: number;
  compensarMs: number;
  /** Zero = dia inteiro livre. */
  trabalharMs: number;
  semIntervalo: boolean;
  horaInicio: string | null;
  horaFim: string | null;
  ponta: "INICIO" | "FIM" | null;
  saldoAntesMs: number;
  saldoDepoisMs: number;
  movimentoPrevisto: number;
  fonteMovimento: FonteMovimento;
  amostras: number;
  /** Quanto o dia está abaixo da média do ciclo (0..1). */
  abaixoDaMedia: number | null;
  coberturaNoDia: number;
  diasTac: number;
  justificativa: string;
}

/** Uma cobertura de falta sugerida (o botão "Débito" que já existe). */
export interface CoberturaView {
  ausenciaId: string;
  colaboradorId: string;
  nome: string;
  funcao: FuncaoCompensavel;
  data: string;
  diaSemana: number;
  rotuloDia: string;
  cargaMs: number;
  saldoAntesMs: number;
  saldoDepoisMs: number;
  status: "PENDENTE" | "INJUSTIFICADA";
  justificativa: string;
}

export type StatusCompensacao = "APROVADA" | "RECUSADA" | "CANCELADA";

/** Uma compensação já decidida (gravada). */
export interface CompensacaoView {
  id: string;
  colaboradorId: string;
  nome: string;
  data: string;
  diaSemana: number;
  rotuloDia: string;
  minutosCompensados: number;
  minutosTrabalhados: number;
  horaInicio: string | null;
  horaFim: string | null;
  semIntervalo: boolean;
  status: StatusCompensacao;
  origem: "SUGESTAO" | "MANUAL";
  motivo: string | null;
  decididoPorNome: string | null;
  decididoEm: string | null;
}

/**
 * Por que não houve sugestões. `SEM_DADO_DE_VENDA` é deliberado: sem estimativa
 * nem histórico suficiente, a seção diz que não sabe em vez de palpitar.
 */
export type BloqueioSugestao =
  | "CICLO_PASSADO"
  | "CICLO_FECHADO"
  | "SEM_DATA_DISPONIVEL"
  | "SEM_DADO_DE_VENDA";

export interface CompensacaoPainel {
  periodo: PeriodoCompensacao;
  carteira: ResumoCarteira;
  datasFracas: DataFracaView[];
  liberacoes: LiberacaoView[];
  coberturas: CoberturaView[];
  decididas: CompensacaoView[];
  bloqueio: BloqueioSugestao | null;
}

/** O que a tela manda ao conceder uma compensação. */
export interface AprovarCompensacao {
  colaboradorId: string;
  /** Dia (ISO). */
  data: string;
  minutosCompensados: number;
  horaInicio?: string;
  horaFim?: string;
  origem?: "SUGESTAO" | "MANUAL";
  motivo?: string;
  vendaPrevista?: number;
  fonteVendaPrevista?: FonteMovimento;
  coberturaNoDia?: number;
}

export const compensacaoHorasService = {
  /** Painel da seção. `ciclo` 0 = atual (o único que recebe sugestões). */
  painel(ciclo = 0): Promise<CompensacaoPainel> {
    return apiClient.get<CompensacaoPainel>("/compensacao-horas", {
      ciclo: String(ciclo),
    });
  },

  /** Concede uma compensação (o servidor revalida tudo antes de gravar). */
  aprovar(dados: AprovarCompensacao): Promise<CompensacaoView> {
    return apiClient.post<CompensacaoView>("/compensacao-horas/aprovar", dados);
  },

  /** Descarta uma sugestão, para ela não voltar na próxima consulta. */
  recusar(
    colaboradorId: string,
    data: string,
    motivo?: string,
  ): Promise<CompensacaoView> {
    return apiClient.post<CompensacaoView>("/compensacao-horas/recusar", {
      colaboradorId,
      data,
      motivo,
    });
  },

  /** Desfaz uma compensação concedida (a linha fica no histórico). */
  cancelar(id: string): Promise<CompensacaoView> {
    return apiClient.post<CompensacaoView>(
      `/compensacao-horas/${id}/cancelar`,
      {},
    );
  },
};

/** Rótulo curto da função, igual ao usado na Central. */
export function rotuloFuncaoCompensavel(funcao: FuncaoPessoa): string {
  switch (funcao) {
    case "OPERADOR":
      return "Operador(a) de caixa";
    case "FISCAL":
      return "Fiscal de caixa";
    case "SUPERVISOR":
      return "Supervisor(a)";
    default:
      return "Gestão";
  }
}
