/** Serviço de Notificações in-app (Req 7.3.3): histórico do usuário. */
import { apiClient } from '../client';
import { Notificacao } from '../types';

export const notificacoesService = {
  /** Histórico de notificações do usuário autenticado (Req 7.3.3). */
  historico(): Promise<Notificacao[]> {
    return apiClient.get<Notificacao[]>('/notificacoes/historico');
  },
};
