/**
 * Serviço das Metas mensais (Centro de Controle ▸ Metas).
 *
 * Lista as metas dos indicadores para um mês (período mensal "AAAA-MM") e
 * permite definir/atualizar cada uma. Apenas o gestor (OPERADORES_CRUD).
 */
import { apiClient } from '../client';
import { MetaMensal, TipoMeta } from '../types';

export const metasService = {
  /** Lista as metas dos indicadores para o mês informado (AAAA-MM). */
  listar(anoMes: string): Promise<MetaMensal[]> {
    return apiClient.get<MetaMensal[]>('/metas', { anoMes });
  },

  /** Define (cria/atualiza) a meta de um indicador no mês. */
  definir(tipo: TipoMeta, anoMes: string, meta: number): Promise<MetaMensal> {
    return apiClient.post<MetaMensal>('/metas', { tipo, anoMes, meta });
  },
};
