/**
 * Serviço de Tipos de Contrato de jornada (Centro de Controle).
 *
 * Permite criar/editar/ativar/desativar/remover/duplicar os contratos que
 * definem as REGRAS de jornada (carga base por dia, feriado, intervalos, limites
 * e avisos de TAC, teto diário, folgas), sem tocar no código. Todos os tempos
 * são em MINUTOS. Espelho de `backend/src/tipos-contrato` (spec `jornada-5x2`,
 * Fase 2).
 */
import { apiClient } from '../client';

export interface TipoContratoJornada {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  /** Contrato padrão (fallback do cálculo). Não pode ser desativado/removido. */
  padrao: boolean;
  /** Carga base em minutos por dia da semana (7 valores, índice 0=domingo). */
  cargaBaseMinPorDia: number[];
  /** Dias da semana (0=domingo) com adicional de 100%. */
  diasComAdicional100: number[];
  maxTrabalhoSemIntervaloMin: number;
  intervaloMinimoMin: number;
  intervaloMaximoMin: number;
  limiteExtrasMin: number;
  /** 1º aviso preventivo de TAC (minutos de extra). Nome mantido pela API. */
  riscoTac1h30Min: number;
  /** 2º aviso preventivo de TAC (minutos de extra). Nome mantido pela API. */
  riscoTac1h40Min: number;
  intervaloMinimoEntreBatidasMin: number;
  /** Quando true, encerrar a jornada sem intervalo é TAC. */
  intervaloObrigatorio: boolean;
  /** Regime legado (6x1): se participa do rodízio de domingo (2x1). */
  trabalhaDomingo: boolean;
  /** Carga do feriado (minutos), própria do contrato. */
  cargaFeriadoMin: number;
  /** O feriado paga 100% (chip "Feriado" nos dias com adicional). */
  feriadoAdicional100: boolean;
  /** Teto de horas trabalhadas no dia (minutos); null = sem teto. */
  limiteTrabalhoDiaMin: number | null;
  /** Folgas por semana (6x1 = 1; 5x2 = 2). */
  folgasPorSemana: number;
  /** Folgas de quem não tem grupo e deixou a ficha vazia (0=domingo). */
  folgasFixasPadrao: number[];
  /** O sábado pode ser folga fixa (só para quem não tem grupo). */
  permiteFolgaSabado: boolean;
  /**
   * Alguma ficha ou vigência usa o contrato, ou ele é o padrão. Com `emUso`, as
   * regras de cálculo ficam travadas (só nome, descrição e ativo mudam). Vem
   * só na lista.
   */
  emUso?: boolean;
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
  trabalhaDomingo?: boolean;
  cargaFeriadoMin?: number;
  feriadoAdicional100?: boolean;
  limiteTrabalhoDiaMin?: number | null;
  folgasPorSemana?: number;
  folgasFixasPadrao?: number[];
  permiteFolgaSabado?: boolean;
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

  /**
   * Edita um tipo de contrato existente. Num contrato em uso, mudar uma regra
   * de cálculo é recusado (409); nome, descrição e ativo passam.
   */
  atualizar(
    id: string,
    input: Partial<TipoContratoInput>,
  ): Promise<TipoContratoJornada> {
    return apiClient.patch<TipoContratoJornada>(`/tipos-contrato/${id}`, input);
  },

  /** Ativa/desativa um tipo de contrato. */
  definirAtivo(id: string, ativo: boolean): Promise<TipoContratoJornada> {
    return apiClient.patch<TipoContratoJornada>(`/tipos-contrato/${id}/ativo`, {
      ativo,
    });
  },

  /** Torna o contrato o padrão (precisa estar ativo). */
  definirPadrao(id: string): Promise<TipoContratoJornada> {
    return apiClient.patch<TipoContratoJornada>(
      `/tipos-contrato/${id}/padrao`,
      {},
    );
  },

  /** Cria uma cópia inativa e editável (nome "… (cópia)"). */
  duplicar(id: string): Promise<TipoContratoJornada> {
    return apiClient.post<TipoContratoJornada>(
      `/tipos-contrato/${id}/duplicar`,
      {},
    );
  },

  /** Remove um tipo de contrato (o padrão não pode ser removido). */
  remover(id: string): Promise<void> {
    return apiClient.delete<void>(`/tipos-contrato/${id}`);
  },
};
