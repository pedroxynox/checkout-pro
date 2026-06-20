/**
 * Serviço do assistente de IA (chat flutuante).
 *
 * Cada usuário fala com a IA pelo seu próprio login; a conversa é isolada e
 * efêmera (guardada 24h no backend para recuperação se fechar o app sem
 * querer). A chave da API fica apenas no servidor — o app só conversa com o
 * backend.
 */
import { apiClient } from '../client';
import { MensagemAssistente } from '../types';

export const assistenteService = {
  /** Indica se o assistente está configurado no servidor (chave presente). */
  status(): Promise<{ configurado: boolean }> {
    return apiClient.get<{ configurado: boolean }>('/assistente/status');
  },

  /** Recupera a conversa atual do usuário (mensagens das últimas 24h). */
  conversa(): Promise<MensagemAssistente[]> {
    return apiClient.get<MensagemAssistente[]>('/assistente/conversa');
  },

  /** Envia uma mensagem e recebe a resposta do assistente. */
  enviar(texto: string): Promise<MensagemAssistente> {
    return apiClient.post<MensagemAssistente>('/assistente/mensagem', { texto });
  },

  /** Limpa toda a conversa do usuário ("Limpar conversa"). */
  limpar(): Promise<{ removidas: number }> {
    return apiClient.delete<{ removidas: number }>('/assistente/conversa');
  },
};
