/** Serviço de Requisições de insumos (fiscal solicita; gestor aprova/nega). */
import { apiClient } from '../client';
import { Requisicao, StatusRequisicao } from '../types';

export const requisicoesService = {
  /** Cria uma requisição de insumo (qualquer perfil com acesso a Insumos). */
  criar(
    insumoId: string,
    quantidade: number,
    observacao?: string,
  ): Promise<Requisicao> {
    return apiClient.post<Requisicao>('/requisicoes', {
      insumoId,
      quantidade,
      observacao,
    });
  },

  /** Lista as requisições, opcionalmente filtradas por status. */
  listar(status?: StatusRequisicao): Promise<Requisicao[]> {
    return apiClient.get<Requisicao[]>(
      '/requisicoes',
      status ? { status } : undefined,
    );
  },

  /** Quantidade de requisições pendentes (para o badge). */
  pendentes(): Promise<{ total: number }> {
    return apiClient.get<{ total: number }>('/requisicoes/pendentes/contagem');
  },

  /** Aprova uma requisição (gerente/supervisor). */
  aprovar(id: string): Promise<Requisicao> {
    return apiClient.post<Requisicao>(`/requisicoes/${id}/aprovar`);
  },

  /** Nega uma requisição com motivo opcional (gerente/supervisor). */
  negar(id: string, motivo?: string): Promise<Requisicao> {
    return apiClient.post<Requisicao>(`/requisicoes/${id}/negar`, { motivo });
  },
};
