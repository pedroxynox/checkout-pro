/** Serviço de Fiscais e Escala (Req 4.x). */
import { apiClient } from '../client';
import {
  EscalaEfetiva,
  ItemEscalaConsolidada,
  SessaoFiscal,
  StatusFiscal,
} from '../types';

export const fiscaisService = {
  /** Altera o status atual de um fiscal (Req 4.1.1–4.1.3). */
  alterarStatus(fiscalId: string, status: StatusFiscal): Promise<SessaoFiscal> {
    return apiClient.post<SessaoFiscal>(`/fiscais/${fiscalId}/status`, {
      status,
    });
  },

  /** Check-in de um fiscal (Req 4.2.1, 4.2.3). */
  checkIn(fiscalId: string): Promise<SessaoFiscal> {
    return apiClient.post<SessaoFiscal>(`/fiscais/${fiscalId}/check-in`);
  },

  /** Check-out de um fiscal (Req 4.2.2). */
  checkOut(fiscalId: string): Promise<SessaoFiscal> {
    return apiClient.post<SessaoFiscal>(`/fiscais/${fiscalId}/check-out`);
  },

  /** Histórico de sessões de um fiscal (Req 4.2.4). */
  historicoSessoes(fiscalId: string): Promise<SessaoFiscal[]> {
    return apiClient.get<SessaoFiscal[]>(`/fiscais/${fiscalId}/sessoes`);
  },
};

export const escalaService = {
  /** Escala consolidada por dia da semana (Req 4.3.6). */
  consolidada(diaSemana: number): Promise<ItemEscalaConsolidada[]> {
    return apiClient.get<ItemEscalaConsolidada[]>(
      `/escala/consolidada/${diaSemana}`,
    );
  },

  /** Escala efetiva de um funcionário num dia (Req 4.3.5). */
  efetiva(
    funcionarioId: string,
    diaSemana: number,
  ): Promise<{ efetiva: EscalaEfetiva }> {
    return apiClient.get<{ efetiva: EscalaEfetiva }>(
      `/escala/${funcionarioId}/efetiva`,
      { diaSemana },
    );
  },
};
