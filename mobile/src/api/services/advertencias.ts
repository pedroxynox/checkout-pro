/**
 * Serviço de solicitações automáticas de advertência (por falta não
 * justificada). O gerente lista as pendentes e decide: aprovar (lança a
 * advertência em Sanções) ou cancelar (ex.: a falta já foi justificada).
 */
import { apiClient } from '../client';
import { SolicitacaoAdvertencia } from '../types';

export const advertenciasService = {
  /** Solicitações pendentes de decisão (o backend limpa as já justificadas). */
  listarPendentes(): Promise<SolicitacaoAdvertencia[]> {
    return apiClient.get<SolicitacaoAdvertencia[]>(
      '/advertencias/solicitacoes/pendentes',
    );
  },

  /** Aprova: lança a advertência em Sanções. */
  aprovar(id: string): Promise<SolicitacaoAdvertencia> {
    return apiClient.post<SolicitacaoAdvertencia>(
      `/advertencias/solicitacoes/${id}/aprovar`,
    );
  },

  /** Cancela a solicitação (não lança advertência). */
  cancelar(id: string, motivo?: string): Promise<SolicitacaoAdvertencia> {
    return apiClient.post<SolicitacaoAdvertencia>(
      `/advertencias/solicitacoes/${id}/cancelar`,
      { motivo },
    );
  },
};
