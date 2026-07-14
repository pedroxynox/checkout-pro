/** Serviço de Fiscais (controle de jornada) e Escala (Req 4.x). */
import { apiClient } from '../client';
import {
  EditarIncidenciaInput,
  EscalaEfetiva,
  FiltroIncidencias,
  IncidenciaEscala,
  ItemEscalaConsolidada,
  ItemFolgaFiscal,
  ItemHorasExtrasFiscal,
  ItemJornadaFiscal,
  ItemPainelFiscal,
  ItemPrevisaoExtras,
  ItemRankingFiscal,
  HistoricoSemanalFiscal,
  MeuResumoFiscal,
  MotivoJustificativa,
  PanoramaSancoes,
  RankingIncidencia,
  RegistrarIncidenciaInput,
  StatusFiscal,
  StatusJustificativa,
  SugestaoIncidencia,
  TipoIncidenciaEscala,
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

  /** Histórico semanal do próprio fiscal (últimos 7 dias). */
  historicoSemanal(): Promise<HistoricoSemanalFiscal | null> {
    return apiClient.get<HistoricoSemanalFiscal | null>('/fiscais/eu/historico-semanal');
  },

  /** Ranking do mês (puntualidade) — apenas gestores. */
  rankingMes(): Promise<ItemRankingFiscal[]> {
    return apiClient.get<ItemRankingFiscal[]>('/fiscais/ranking-mes');
  },

  /** Previsão de horas extras do mês — apenas gestores. */
  previsaoExtras(): Promise<ItemPrevisaoExtras[]> {
    return apiClient.get<ItemPrevisaoExtras[]>('/fiscais/previsao-extras');
  },
};

export const escalaService = {
  /**
   * Escala consolidada por dia da semana (Req 4.3.6). Passe `data` (ISO
   * yyyy-mm-dd) para que o domingo venha do rodízio de grupos dos fiscais.
   */
  consolidada(
    diaSemana: number,
    data?: string,
  ): Promise<ItemEscalaConsolidada[]> {
    const q = data ? `?data=${encodeURIComponent(data)}` : '';
    return apiClient.get<ItemEscalaConsolidada[]>(
      `/escala/consolidada/${diaSemana}${q}`,
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

  // ----- Incidências de escala (Fase 1/2 — "não retornou do intervalo") -----

  /** Registra uma incidência de escala (por colaborador, tipo e data). */
  registrarIncidencia(
    dto: RegistrarIncidenciaInput,
  ): Promise<IncidenciaEscala> {
    return apiClient.post<IncidenciaEscala>('/escala/incidencias', dto);
  },

  /** Edita os campos editáveis de uma incidência. */
  editarIncidencia(
    id: string,
    dto: EditarIncidenciaInput,
  ): Promise<IncidenciaEscala> {
    return apiClient.patch<IncidenciaEscala>(
      `/escala/incidencias/${id}`,
      dto,
    );
  },

  /** Remove uma incidência. */
  removerIncidencia(id: string): Promise<void> {
    return apiClient.delete<void>(`/escala/incidencias/${id}`);
  },

  /** Justifica/reabre/injustifica um não-retorno DEPOIS do registro (abono). */
  justificarIncidencia(
    id: string,
    dados: {
      status: StatusJustificativa;
      motivo?: MotivoJustificativa;
      observacao?: string;
    },
  ): Promise<IncidenciaEscala> {
    return apiClient.patch<IncidenciaEscala>(
      `/escala/incidencias/${id}/justificativa`,
      dados,
    );
  },

  /** Lista incidências pelos filtros informados, mais recentes primeiro. */
  listarIncidencias(
    filtros: FiltroIncidencias = {},
  ): Promise<IncidenciaEscala[]> {
    const params: Record<string, string> = {};
    if (filtros.colaboradorId) params.colaboradorId = filtros.colaboradorId;
    if (filtros.tipo) params.tipo = filtros.tipo;
    if (filtros.inicio) params.inicio = filtros.inicio;
    if (filtros.fim) params.fim = filtros.fim;
    return apiClient.get<IncidenciaEscala[]>('/escala/incidencias', params);
  },

  /** Sugestões auto-detectadas do ponto dos fiscais para uma data. */
  sugestoesIncidencias(data?: string): Promise<SugestaoIncidencia[]> {
    return apiClient.get<SugestaoIncidencia[]>(
      '/escala/incidencias/sugestoes',
      { data },
    );
  },

  /**
   * Ranking de incidências por colaborador na janela [inicio, fim]. Aceita um
   * `tipo` opcional para comparar um evento específico (senão, soma todos).
   */
  rankingIncidencias(
    inicio: string,
    fim: string,
    tipo?: TipoIncidenciaEscala,
  ): Promise<RankingIncidencia[]> {
    const params: Record<string, string> = { inicio, fim };
    if (tipo) params.tipo = tipo;
    return apiClient.get<RankingIncidencia[]>(
      '/escala/incidencias/ranking',
      params,
    );
  },

  /**
   * Panorama de sanções (advertência/suspensão) na janela [inicio, fim]:
   * contadores, tendência, suspensos hoje e resumo por colaborador com a
   * sugestão de próximo passo (disciplina progressiva).
   */
  panoramaSancoes(inicio: string, fim: string): Promise<PanoramaSancoes> {
    return apiClient.get<PanoramaSancoes>('/escala/incidencias/sancoes', {
      inicio,
      fim,
    });
  },
};
