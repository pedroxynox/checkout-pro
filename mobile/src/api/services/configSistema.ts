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

/** Um domingo do preview com o grupo que folga nele. */
export interface DomingoPreview {
  data: string;
  grupoFolga: 'G1' | 'G2' | 'G3';
}

/** Configuração do rodízio de domingo (âncora + preview dos próximos). */
export interface EscalaDomingoConfig {
  ancoraData: string | null;
  ancoraGrupo: 'G1' | 'G2' | 'G3' | null;
  proximos: DomingoPreview[];
}

export const configSistemaService = {
  /** Lê a Data_Inicial_Sistema vigente (`GET /config/data-inicial`). */
  obterDataInicial(): Promise<DataInicialResposta> {
    return apiClient.get<DataInicialResposta>('/config/data-inicial');
  },

  /** Lê o rodízio de domingo (âncora + próximos domingos). */
  obterEscalaDomingo(): Promise<EscalaDomingoConfig> {
    return apiClient.get<EscalaDomingoConfig>('/config/escala-domingo');
  },

  /** Define o ponto de partida do rodízio de domingo (apenas gestor). */
  definirEscalaDomingo(
    ancoraData: string,
    ancoraGrupo: 'G1' | 'G2' | 'G3',
  ): Promise<EscalaDomingoConfig> {
    return apiClient.put<EscalaDomingoConfig>('/config/escala-domingo', {
      ancoraData,
      ancoraGrupo,
    });
  },
};
