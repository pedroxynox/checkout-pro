/** Serviço do Cadastro Unificado de Colaboradores (Fase 4/8 do spec). */
import { apiClient } from '../client';
import {
  Colaborador,
  ColaboradorInput,
  FuncaoColaborador,
  TurnoColaborador,
} from '../types';

export interface FiltroColaboradores {
  busca?: string;
  funcao?: FuncaoColaborador;
  turno?: TurnoColaborador;
  ativo?: boolean;
}

export const colaboradoresService = {
  /** Lista os colaboradores (busca/filtros). */
  listar(filtro: FiltroColaboradores = {}): Promise<Colaborador[]> {
    const params: Record<string, string> = {};
    if (filtro.busca) params.busca = filtro.busca;
    if (filtro.funcao) params.funcao = filtro.funcao;
    if (filtro.turno) params.turno = filtro.turno;
    if (filtro.ativo !== undefined) params.ativo = String(filtro.ativo);
    return apiClient.get<Colaborador[]>('/colaboradores', params);
  },

  /** Detalhe de um colaborador. */
  obter(id: string): Promise<Colaborador> {
    return apiClient.get<Colaborador>(`/colaboradores/${id}`);
  },

  /** Cadastra um colaborador (operador por padrão). */
  cadastrar(input: ColaboradorInput): Promise<Colaborador> {
    return apiClient.post<Colaborador>('/colaboradores', input);
  },

  /** Edita um colaborador. */
  editar(id: string, input: Partial<ColaboradorInput>): Promise<Colaborador> {
    return apiClient.patch<Colaborador>(`/colaboradores/${id}`, input);
  },

  /** Inativa um colaborador (preserva histórico). */
  inativar(id: string): Promise<Colaborador> {
    return apiClient.post<Colaborador>(`/colaboradores/${id}/inativar`, {});
  },

  /** Reativa um colaborador. */
  reativar(id: string): Promise<Colaborador> {
    return apiClient.post<Colaborador>(`/colaboradores/${id}/reativar`, {});
  },
};
