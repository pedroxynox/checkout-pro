/** Serviço de Fechamento do dia (resumo inteligente). */
import { apiClient } from '../client';
import { ResumoFechamento } from '../types';

export const fechamentoService = {
  /** Resumo inteligente do dia: itens, pendências e alertas. Padrão: hoje. */
  resumo(data?: string): Promise<ResumoFechamento> {
    return apiClient.get<ResumoFechamento>(
      '/fechamento/resumo',
      data ? { data } : undefined,
    );
  },
};
