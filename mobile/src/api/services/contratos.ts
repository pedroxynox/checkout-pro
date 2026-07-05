/** Serviço da seção Contratos de experiência (45 + 45 dias). */
import { apiClient } from '../client';
import {
  ContratoCard,
  MarcoContrato,
  ResultadoDecisao,
  ResumoCarteiraContratos,
  ResumoContratoColaborador,
} from '../types';

export interface FiltroContratos {
  busca?: string;
  etiqueta?: string;
  incluirSemAdmissao?: boolean;
}

export const contratosService = {
  /** Lista os cards de contrato dos operadores (com filtros). */
  listar(filtro: FiltroContratos = {}): Promise<ContratoCard[]> {
    const params: Record<string, string> = {};
    if (filtro.busca) params.busca = filtro.busca;
    if (filtro.etiqueta) params.etiqueta = filtro.etiqueta;
    if (filtro.incluirSemAdmissao !== undefined) {
      params.incluirSemAdmissao = String(filtro.incluirSemAdmissao);
    }
    return apiClient.get<ContratoCard[]>('/contratos', params);
  },

  /** Contagens agregadas para o resumo do topo da seção. */
  resumo(): Promise<ResumoCarteiraContratos> {
    return apiClient.get<ResumoCarteiraContratos>('/contratos/resumo');
  },

  /** Resumo do contrato de um colaborador (detalhe/tempo de casa). */
  doColaborador(colaboradorId: string): Promise<ResumoContratoColaborador> {
    return apiClient.get<ResumoContratoColaborador>(
      `/contratos/${colaboradorId}`,
    );
  },

  /** Define/atualiza a data de admissão de um colaborador. */
  definirAdmissao(
    colaboradorId: string,
    dataAdmissao: string,
  ): Promise<ContratoCard> {
    return apiClient.patch<ContratoCard>(
      `/contratos/${colaboradorId}/admissao`,
      { dataAdmissao },
    );
  },

  /** Registra (ou regrava) a decisão de um marco (aprovar/reprovar). */
  decidir(
    colaboradorId: string,
    marco: MarcoContrato,
    resultado: ResultadoDecisao,
    observacao?: string,
  ): Promise<ContratoCard> {
    return apiClient.post<ContratoCard>(`/contratos/${colaboradorId}/decisao`, {
      marco,
      resultado,
      observacao,
    });
  },
};
