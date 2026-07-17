import { apiClient } from '../client';
import { CentralPeriodo } from './centralJornada';

/** Estado de fechamento de um ciclo de folha (26→25). */
export interface EstadoCicloFolha {
  periodo: CentralPeriodo;
  status: 'ABERTO' | 'FECHADO';
  fechadoPorNome: string | null;
  fechadoEm: string | null;
  reabertoPorNome: string | null;
  reabertoEm: string | null;
}

/** Um evento da trilha (fechamento/reabertura). */
export interface EventoCicloView {
  tipo: 'FECHADO' | 'REABERTO';
  porNome: string | null;
  em: string;
}

export const cicloFolhaService = {
  /** Estado do ciclo. `ciclo` 0 = atual, negativo = anterior. */
  status(ciclo = 0): Promise<EstadoCicloFolha> {
    return apiClient.get<EstadoCicloFolha>('/ciclo-folha/status', {
      ciclo: String(ciclo),
    });
  },

  /** Trilha de fechamentos/reaberturas do ciclo. */
  eventos(ciclo = 0): Promise<EventoCicloView[]> {
    return apiClient.get<EventoCicloView[]>('/ciclo-folha/eventos', {
      ciclo: String(ciclo),
    });
  },

  /** Fecha o ciclo (após revisão) — exige permissão de gestão. */
  fechar(ciclo = 0): Promise<EstadoCicloFolha> {
    return apiClient.post<EstadoCicloFolha>('/ciclo-folha/fechar', { ciclo });
  },

  /** Reabre um ciclo fechado — exige autorização de administrador. */
  reabrir(ciclo = 0): Promise<EstadoCicloFolha> {
    return apiClient.post<EstadoCicloFolha>('/ciclo-folha/reabrir', { ciclo });
  },
};
