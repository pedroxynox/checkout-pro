/**
 * Serviço do rodízio de folgas do 5x2 (Centro de Controle). Espelho de
 * `backend/src/escala-domingo/rodizio-folgas.*` (spec `jornada-5x2`, Fase 3).
 *
 * Cada grupo (G1/G2/G3) folga 2 dias por semana; os dias mudam a cada semana de
 * um ciclo que começa numa segunda-feira e se repete. Dias: 0 = domingo … 6 =
 * sábado (ninguém de grupo folga no sábado).
 */
import { apiClient } from '../client';

export type GrupoRodizio = 'G1' | 'G2' | 'G3';

/** Folgas por grupo e semana do ciclo (índice 0 = semana 1). */
export type PadraoRodizio = Record<GrupoRodizio, number[][]>;

export type TipoAvisoRodizio =
  | 'DIA_SEM_GRUPO'
  | 'DIA_COM_VARIOS_GRUPOS'
  | 'DIAS_SEGUIDOS'
  | 'DOMINGOS_SEGUIDOS';

/** Aviso da configuração (não impede salvar). */
export interface AvisoRodizio {
  tipo: TipoAvisoRodizio;
  grupo: GrupoRodizio | null;
  /** Semana do ciclo, a partir de 1. */
  semana: number | null;
  diaSemana: number | null;
  mensagem: string;
}

export interface RodizioFolgasVigencia {
  /** null numa simulação. */
  id: string | null;
  /** Segunda-feira de início (yyyy-mm-dd). */
  vigenteDesde: string;
  semanasNoCiclo: number;
  padrao: PadraoRodizio;
  criadoPor: string | null;
  criadoEm: string | null;
  atualizadoPor: string | null;
  atualizadoEm: string | null;
  avisos: AvisoRodizio[];
}

export interface DiaPreviaRodizio {
  /** yyyy-mm-dd */
  data: string;
  diaSemana: number;
  grupos: GrupoRodizio[];
  /** `DOMINGO_ANTIGO` = rodízio de domingo do 6x1, antes do primeiro rodízio. */
  fonte: 'RODIZIO' | 'DOMINGO_ANTIGO' | null;
}

export interface SemanaPreviaRodizio {
  /** Segunda-feira (yyyy-mm-dd). */
  inicio: string;
  /** Semana do ciclo, a partir de 1; null antes do primeiro rodízio. */
  semanaDoCiclo: number | null;
  dias: DiaPreviaRodizio[];
}

export interface RodizioFolgasConfig {
  vigencias: RodizioFolgasVigencia[];
  vigente: RodizioFolgasVigencia | null;
  previa: SemanaPreviaRodizio[];
}

export interface SimulacaoRodizioFolgas {
  vigencia: RodizioFolgasVigencia;
  previa: SemanaPreviaRodizio[];
}

/** O que a tela manda para salvar ou conferir. */
export interface RodizioFolgasInput {
  vigenteDesde: string;
  semanasNoCiclo: number;
  padrao: PadraoRodizio;
}

export const rodizioFolgasService = {
  /** Vigências (com avisos), a vigente e a prévia das próximas semanas. */
  obter(): Promise<RodizioFolgasConfig> {
    return apiClient.get<RodizioFolgasConfig>('/config/rodizio-folgas');
  },

  /** Grava (cria ou substitui) a vigência que começa na data informada. */
  definir(input: RodizioFolgasInput): Promise<RodizioFolgasConfig> {
    return apiClient.put<RodizioFolgasConfig>('/config/rodizio-folgas', input);
  },

  /** Valida e mostra avisos e prévia, sem gravar. */
  simular(input: RodizioFolgasInput): Promise<SimulacaoRodizioFolgas> {
    return apiClient.post<SimulacaoRodizioFolgas>(
      '/config/rodizio-folgas/simular',
      input,
    );
  },
};
