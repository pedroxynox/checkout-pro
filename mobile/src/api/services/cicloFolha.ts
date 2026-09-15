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

/** Um ciclo tocado por um período, com o estado e os dias que lhe cabem. */
export interface CicloIntervalo {
  inicio: string;
  fim: string;
  /** Rótulo curto, ex.: "26/06 – 25/07". */
  rotulo: string;
  /** Dias **do período consultado** que caem neste ciclo. */
  dias: number;
  status: 'ABERTO' | 'FECHADO';
}

/** Resultado de "que ciclos de folha este período toca?". */
export interface IntervaloCiclos {
  ciclos: CicloIntervalo[];
  /** true quando o período se reparte entre mais de um ciclo. */
  atravessaCiclos: boolean;
  /** Rótulos dos ciclos fechados (vazio quando todos estão abertos). */
  fechados: string[];
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

  /**
   * Ciclos de folha tocados por um período (datas ISO `yyyy-mm-dd`), com o
   * estado de cada um. Consulta informativa: permite avisar antes de salvar que
   * o período atravessa o fechamento da folha, sem duplicar a regra do dia 26
   * no app.
   */
  intervalo(inicio: string, fim: string): Promise<IntervaloCiclos> {
    return apiClient.get<IntervaloCiclos>('/ciclo-folha/intervalo', {
      inicio,
      fim,
    });
  },
};
