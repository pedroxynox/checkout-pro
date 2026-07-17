/**
 * Serviço de Tipos de Contrato de jornada (Centro de Controle).
 *
 * Permite criar/editar/ativar/desativar/remover os contratos que definem as
 * REGRAS de jornada (carga base por dia, intervalos, limites e riscos de TAC),
 * sem tocar no código. Todos os tempos são em MINUTOS.
 */
import { apiClient } from '../client';

export interface TipoContratoJornada {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  /** Contrato vigente (fallback do cálculo). Não pode ser desativado/removido. */
  padrao: boolean;
  /** Carga base em minutos por dia da semana (7 valores, índice 0=domingo). */
  cargaBaseMinPorDia: number[];
  /** Dias da semana (0=domingo) com adicional de 100%. */
  diasComAdicional100: number[];
  maxTrabalhoSemIntervaloMin: number;
  intervaloMinimoMin: number;
  intervaloMaximoMin: number;
  limiteExtrasMin: number;
  riscoTac1h30Min: number;
  riscoTac1h40Min: number;
  intervaloMinimoEntreBatidasMin: number;
  /** Quando true, encerrar a jornada sem intervalo é TAC. */
  intervaloObrigatorio: boolean;
}

/** Campos editáveis de um tipo de contrato (criar/editar). */
export interface TipoContratoInput {
  nome: string;
  descricao?: string;
  cargaBaseMinPorDia: number[];
  diasComAdicional100: number[];
  maxTrabalhoSemIntervaloMin: number;
  intervaloMinimoMin: number;
  intervaloMaximoMin: number;
  limiteExtrasMin: number;
  riscoTac1h30Min: number;
  riscoTac1h40Min: number;
  intervaloMinimoEntreBatidasMin?: number;
  intervaloObrigatorio?: boolean;
  ativo?: boolean;
}

export const tiposContratoService = {
  /** Lista os contratos. `incluirInativos` traz também os desativados. */
  listar(incluirInativos = false): Promise<TipoContratoJornada[]> {
    return apiClient.get<TipoContratoJornada[]>(
      '/tipos-contrato',
      incluirInativos ? { incluirInativos: '1' } : undefined,
    );
  },

  /** Cria um novo tipo de contrato. */
  criar(input: TipoContratoInput): Promise<TipoContratoJornada> {
    return apiClient.post<TipoContratoJornada>('/tipos-contrato', input);
  },

  /** Edita um tipo de contrato existente. */
  atualizar(
    id: string,
    input: Partial<TipoContratoInput>,
  ): Promise<TipoContratoJornada> {
    return apiClient.patch<TipoContratoJornada>(`/tipos-contrato/${id}`, input);
  },

  /** Ativa/desativa um tipo de contrato. */
  definirAtivo(id: string, ativo: boolean): Promise<TipoContratoJornada> {
    return apiClient.patch<TipoContratoJornada>(
      `/tipos-contrato/${id}/ativo`,
      { ativo },
    );
  },

  /** Remove um tipo de contrato (o padrão não pode ser removido). */
  remover(id: string): Promise<void> {
    return apiClient.delete<void>(`/tipos-contrato/${id}`);
  },
};
