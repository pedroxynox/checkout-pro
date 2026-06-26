/** Serviço do Cadastro Unificado de Colaboradores (Fase 4/8 do spec). */
import { apiClient } from '../client';
import {
  Colaborador,
  ColaboradorDetalhe,
  ColaboradorInput,
  FuncaoColaborador,
  LoginColaborador,
  PerfilColaborador,
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

  /** Detalhe de um colaborador (inclui os identificadores: matrícula/login). */
  obter(id: string): Promise<ColaboradorDetalhe> {
    return apiClient.get<ColaboradorDetalhe>(`/colaboradores/${id}`);
  },

  /** Contas de acesso (logins) disponíveis para vincular, com seu uso atual. */
  logins(): Promise<LoginColaborador[]> {
    return apiClient.get<LoginColaborador[]>('/colaboradores/logins');
  },

  /** Perfil inteligente do colaborador (score, indicadores, faltas, etc.). */
  perfil(
    id: string,
    periodo: { inicio?: string; fim?: string } = {},
  ): Promise<PerfilColaborador> {
    const params: Record<string, string> = {};
    if (periodo.inicio) params.inicio = periodo.inicio;
    if (periodo.fim) params.fim = periodo.fim;
    return apiClient.get<PerfilColaborador>(
      `/colaboradores/${id}/perfil`,
      params,
    );
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
