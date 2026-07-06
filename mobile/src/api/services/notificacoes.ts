/** Serviço de Notificações in-app (Req 7.3.3): histórico do usuário. */
import { apiClient } from '../client';
import { Notificacao } from '../types';

export const notificacoesService = {
  /** Histórico de notificações do usuário autenticado (Req 7.3.3). */
  historico(): Promise<Notificacao[]> {
    return apiClient.get<Notificacao[]>('/notificacoes/historico');
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
