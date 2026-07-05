/**
 * Serviço da configuração global do sistema (singleton).
 *
 * Hoje expõe a leitura da Data_Inicial_Sistema: a data a partir da qual os
 * registros podem ser cadastrados/editados e a partir da qual começam os
 * calendários do app. A fonte de verdade da validação é sempre o backend; o app
 * usa esta data apenas para limitar os seletores (UX).
 */
import { apiClient } from '../client';

/** Resposta da leitura da data inicial (ISO `yyyy-mm-dd`). */
export interface DataInicialResposta {
  dataInicial: string;
}

export const configSistemaService = {
  /** Lê a Data_Inicial_Sistema vigente (`GET /config/data-inicial`). */
  obterDataInicial(): Promise<DataInicialResposta> {
    return apiClient.get<DataInicialResposta>('/config/data-inicial');
  },
};
