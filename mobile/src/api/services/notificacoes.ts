/** Serviço de Notificações in-app (Req 7.3.3): histórico do usuário. */
import { apiClient } from '../client';
import { Notificacao } from '../types';

export const notificacoesService = {
  /** Histórico de notificações do usuário autenticado (Req 7.3.3). */
  historico(): Promise<Notificacao[]> {
    return apiClient.get<Notificacao[]>('/notificacoes/historico');
  },

  /**
   * Limpa o centro de notificações do usuário logado. Apaga só as dele (o
   * servidor usa o usuário do token), então não afeta mais ninguém.
   */
  limpar(): Promise<{ removidas: number }> {
    return apiClient.delete<{ removidas: number }>('/notificacoes');
  },

  /** Registra o token de push (Expo) do aparelho para o usuário logado. */
  registrarPushToken(token: string, plataforma?: string): Promise<void> {
    return apiClient.post<void>('/notificacoes/push-token', {
      token,
      plataforma,
    });
  },

  /** Remove o token de push do aparelho (logout). */
  removerPushToken(token: string): Promise<void> {
    return apiClient.post<void>('/notificacoes/push-token/remover', { token });
  },
};
