/** Serviço de Feriados (nacionais automáticos + estaduais/municipais manuais). */
import { apiClient } from '../client';

export type AmbitoFeriado = 'NACIONAL' | 'ESTADUAL' | 'MUNICIPAL';

export interface Feriado {
  /** id no banco; null nos nacionais automáticos (não removíveis). */
  id: string | null;
  data: string;
  nome: string;
  ambito: AmbitoFeriado;
  automatico: boolean;
  removivel: boolean;
}

export const feriadosService = {
  /** Lista os feriados do ano (nacionais + manuais). */
  listar(ano?: number): Promise<Feriado[]> {
    return apiClient.get<Feriado[]>(
      '/feriados',
      ano ? { ano: String(ano) } : undefined,
    );
  },

  /** Cadastra um feriado manual (estadual/municipal). */
  criar(input: {
    data: string;
    nome: string;
    ambito: 'ESTADUAL' | 'MUNICIPAL';
  }): Promise<Feriado> {
    return apiClient.post<Feriado>('/feriados', input);
  },

  /** Remove um feriado manual. */
  remover(id: string): Promise<void> {
    return apiClient.delete<void>(`/feriados/${id}`);
  },
};
