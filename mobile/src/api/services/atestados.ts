/** Serviço de API dos ATESTADOS médicos (documento + CID + regra do INSS). */
import apiClient from '../client';

/** Entrada do catálogo CID-10 (autocompletar). */
export interface EntradaCid {
  codigo: string;
  descricao: string;
}

/** Atestado enriquecido (listagem). */
export interface AtestadoDetalhado {
  id: string;
  colaboradorId: string;
  nome: string;
  inicio: string;
  fim: string;
  dias: number;
  cid: string | null;
  cidDescricao: string | null;
  semCid: boolean;
  observacao: string | null;
  registradaPorNome: string | null;
  criadoEm: string;
  /** Dias que voltam a ser falta se o atestado for excluído. */
  diasQueVoltamAFalta: number;
}

/** Resumo do que foi desfeito ao excluir um atestado. */
export interface ResultadoExclusaoAtestado {
  atestadoId: string;
  nome: string | null;
  inicio: string;
  fim: string;
  cid: string | null;
  /** Dias apagados (existiam só por causa do atestado). */
  diasRemovidos: number;
  /** Dias que voltaram a ser falta PENDENTE (já eram falta antes). */
  diasVoltaramAFalta: number;
}

/** Agrupamento por CID no histórico de um colaborador. */
export interface HistoricoCidItem {
  cid: string | null;
  cidDescricao: string | null;
  episodios: number;
  totalDias: number;
  totalDiasJanela: number;
  ultrapassaInss: boolean;
}

/** Resultado do lançamento de um atestado. */
export interface ResultadoAtestado {
  atestadoId: string;
  dias: number;
  cid: string | null;
  semCid: boolean;
  totalDiasMesmoCid: number;
  ultrapassaInss: boolean;
}

/** Dados para lançar um atestado. */
export interface LancarAtestadoInput {
  colaboradorId: string;
  inicio: string;
  fim: string;
  cid?: string;
  semCid?: boolean;
  observacao?: string;
}

export const atestadosService = {
  /** Autocompletar do CID-10 (por código ou descrição). */
  buscarCid(busca: string): Promise<EntradaCid[]> {
    return apiClient.get<EntradaCid[]>('/atestados/cid', { busca });
  },

  /** Lança um atestado (documento + faltas justificadas do período). */
  lancar(input: LancarAtestadoInput): Promise<ResultadoAtestado> {
    return apiClient.post<ResultadoAtestado>('/atestados', input);
  },

  /** Lista os atestados que intersectam o período. */
  listar(inicio: string, fim: string): Promise<AtestadoDetalhado[]> {
    return apiClient.get<AtestadoDetalhado[]>('/atestados', { inicio, fim });
  },

  /** Histórico de atestados de um colaborador, agrupado por CID. */
  historicoColaborador(colaboradorId: string): Promise<HistoricoCidItem[]> {
    return apiClient.get<HistoricoCidItem[]>(
      `/atestados/colaborador/${colaboradorId}`,
    );
  },

  /**
   * Exclui um atestado lançado por engano e as faltas diárias vinculadas.
   * Só gerente, supervisor ou administrador. Devolve o resumo do que foi
   * desfeito (dias apagados e dias que voltaram a ser falta).
   */
  remover(id: string): Promise<ResultadoExclusaoAtestado> {
    return apiClient.delete<ResultadoExclusaoAtestado>(`/atestados/${id}`);
  },
};
