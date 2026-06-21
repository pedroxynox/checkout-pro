/** Serviço de Fiscais (controle de jornada) e Escala (Req 4.x). */
import { apiClient } from '../client';
import {
  EscalaEfetiva,
  ItemEscalaConsolidada,
  ItemFolgaFiscal,
  ItemHorasExtrasFiscal,
  ItemJornadaFiscal,
  ItemPainelFiscal,
  MeuResumoFiscal,
  StatusFiscal,
} from '../types';

export const fiscaisService = {
  /** Painel de todos os fiscais com o status atual. */
  painel(): Promise<ItemPainelFiscal[]> {
    return apiClient.get<ItemPainelFiscal[]>('/fiscais/painel');
  },

  /** Resumo do próprio fiscal (status + jornada); null se o usuário não for fiscal. */
  meuResumo(): Promise<MeuResumoFiscal | null> {
    return apiClient.get<MeuResumoFiscal | null>('/fiscais/eu');
  },

  /** O fiscal define o próprio status (auto-identificado pelo login). */
  definirStatus(status: StatusFiscal): Promise<MeuResumoFiscal> {
    return apiClient.post<MeuResumoFiscal>('/fiscais/eu/status', { status });
  },

  /** O fiscal informa a própria falta do dia atual. */
  informarFalta(): Promise<void> {
    return apiClient.post<void>('/fiscais/eu/falta');
  },

  /** Log de jornada do dia (tempos por fiscal) — apenas gestores. */
  jornada(data?: string): Promise<ItemJornadaFiscal[]> {
    return apiClient.get<ItemJornadaFiscal[]>('/fiscais/jornada', { data });
  },

  /** Acumulado de horas extras do mês por fiscal — apenas gestores. */
  horasExtrasMes(mes?: string): Promise<ItemHorasExtrasFiscal[]> {
    return apiClient.get<ItemHorasExtrasFiscal[]>('/fiscais/horas-extras-mes', { mes });
  },

  /** Lista de fiscais de folga hoje. */
  folgaHoje(): Promise<ItemFolgaFiscal[]> {
    return apiClient.get<ItemFolgaFiscal[]>('/fiscais/folga-hoje');
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
