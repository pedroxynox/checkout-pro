/** Serviço de Operadores e Ausências (Req 6.1, 6.2, 6.3, 6.6). */
import { apiClient } from '../client';
import {
  Ausencia,
  AusenciaDetalhada,
  ContagemTurno,
  AnaliticaFaltas,
  AoVivoOperadores,
  DiaOperadores,
  GradeOperadores,
  ItemRelatorioAusencia,
  MotivoJustificativa,
  OperadorEscalaDia,
  OperadorTurno,
  StatusJustificativa,
} from '../types';

export const operadoresService = {
  /** Registra uma ausência de uma pessoa numa data (Req 6.2.1–6.2.3). */
  registrarAusencia(pessoaId: string, data: string): Promise<Ausencia> {
    return apiClient.post<Ausencia>('/operadores/ausencias', {
      pessoaId,
      data,
    });
  },

  /** Remove uma ausência registrada (Req 6.2.4). */
  removerAusencia(id: string): Promise<void> {
    return apiClient.delete<void>(`/operadores/ausencias/${id}`);
  },

  /**
   * Ausência a prazo: ausenta um colaborador por um período, criando faltas
   * JUSTIFICADAS em CADA dia corrido do intervalo (inclusive a folga). Retorna
   * quantos dias foram marcados.
   */
  registrarAusenciaPeriodo(input: {
    pessoaId: string;
    inicio: string;
    fim: string;
    motivo: MotivoJustificativa;
    observacao?: string;
  }): Promise<{
    dias: number;
    criadas: number;
    atualizadas: number;
  }> {
    return apiClient.post('/operadores/ausencias/periodo', input);
  },

  /**
   * Lista as faltas de um período com nome + justificativa (estado, motivo,
   * quem justificou). `pendentes=true` traz só as pendentes de análise.
   */
  listarAusencias(
    inicio: string,
    fim: string,
    pendentes = false,
  ): Promise<AusenciaDetalhada[]> {
    const params: Record<string, string> = { inicio, fim };
    if (pendentes) params.pendentes = 'true';
    return apiClient.get<AusenciaDetalhada[]>('/operadores/ausencias', params);
  },

  /** Justifica/reabre/injustifica uma falta DEPOIS do registro (abono). */
  justificarAusencia(
    id: string,
    dados: {
      status: StatusJustificativa;
      motivo?: MotivoJustificativa;
      observacao?: string;
    },
  ): Promise<Ausencia> {
    return apiClient.patch<Ausencia>(
      `/operadores/ausencias/${id}/justificativa`,
      dados,
    );
  },

  /** Relatório de ausências por pessoa, filtrado e ordenado (Req 6.3). */
  relatorioAusencias(
    inicio: string,
    fim: string,
  ): Promise<ItemRelatorioAusencia[]> {
    return apiClient.get<ItemRelatorioAusencia[]>(
      '/operadores/ausencias/relatorio',
      { inicio, fim },
    );
  },

  /** Contagem de operadores por turno no dia informado (Req 6.6.5–6.6.7). */
  contagemPorTurno(operadores: OperadorEscalaDia[]): Promise<ContagemTurno> {
    return apiClient.post<ContagemTurno>('/operadores/contagem-turno', {
      operadores,
    });
  },

  // ----- Quadro de Operadores (escala fixa visual) -----

  /** Grade semanal (Seg–Sáb) com status por dia e cobertura. */
  grade(data?: string): Promise<GradeOperadores> {
    return apiClient.get<GradeOperadores>(
      '/quadro-operadores/grade',
      data ? { data } : undefined,
    );
  },

  /** Roster de um único dia (ordenado por entrada, folga ao fim). */
  dia(data?: string): Promise<DiaOperadores> {
    return apiClient.get<DiaOperadores>(
      '/quadro-operadores/dia',
      data ? { data } : undefined,
    );
  },

  /** Tablero "ao vivo": quem deveria estar no caixa agora. */
  aoVivo(): Promise<AoVivoOperadores> {
    return apiClient.get<AoVivoOperadores>('/quadro-operadores/ao-vivo');
  },

  /** Analítica de faltas num período (ranking + dia que mais se falta). */
  analiticaFaltas(inicio: string, fim: string): Promise<AnaliticaFaltas> {
    return apiClient.get<AnaliticaFaltas>('/quadro-operadores/faltas/analitica', {
      inicio,
      fim,
    });
  },

  /**
   * Analítica de "não retorno do intervalo" num período — mesma inteligência
   * (ranking, risco/semáforo, dia recorrente e tendência) que as faltas.
   */
  analiticaNaoRetornos(inicio: string, fim: string): Promise<AnaliticaFaltas> {
    return apiClient.get<AnaliticaFaltas>(
      '/quadro-operadores/nao-retornos/analitica',
      { inicio, fim },
    );
  },

  /** Lista os operadores (escala derivada do Cadastro de Colaboradores). */
  listarTurnos(): Promise<OperadorTurno[]> {
    return apiClient.get<OperadorTurno[]>('/quadro-operadores/turnos');
  },
};
