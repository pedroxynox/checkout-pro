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
import type { AvisoJornada, JornadaInput } from './jornadaColaborador';

/**
 * Cadastro com a primeira vigência da jornada (spec `jornada-5x2`, R4.7). Sem
 * `aPartirDe` no bloco, vale a data de admissão; sem o bloco, a pessoa fica no
 * 6x1 da ficha.
 */
export type CadastroColaboradorInput = ColaboradorInput & {
  jornada?: Omit<JornadaInput, 'aPartirDe'> & { aPartirDe?: string };
};

/** Resposta do cadastro: com o bloco `jornada`, os avisos dela. */
export type ColaboradorCadastrado = Colaborador & {
  avisosJornada?: AvisoJornada[];
};

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
  cadastrar(input: CadastroColaboradorInput): Promise<ColaboradorCadastrado> {
    return apiClient.post<ColaboradorCadastrado>('/colaboradores', input);
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

  /**
   * Associa um código solto (matrícula do arquivo, "não reconhecido") a um
   * colaborador. Resolve o histórico retroativamente. Apenas gestor.
   */
  adicionarIdentificador(id: string, valor: string): Promise<{ ok: true }> {
    return apiClient.post<{ ok: true }>(
      `/colaboradores/${id}/identificadores`,
      { valor },
    );
  },
};
