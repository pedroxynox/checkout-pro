/** Serviço de Operadores e Ausências (Req 6.1, 6.2, 6.3, 6.6). */
import { apiClient } from '../client';
import {
  Ausencia,
  ContagemTurno,
  AnaliticaFaltas,
  AoVivoOperadores,
  GradeOperadores,
  ItemRelatorioAusencia,
  Operador,
  OperadorEscalaDia,
  OperadorTurno,
} from '../types';

/** Dados de um turno fixo de operador (criar/editar). */
export interface TurnoOperadorInput {
  nome: string;
  entradaSemana: string;
  saidaSemana: string;
  entradaFds: string;
  saidaFds: string;
  folgaDiaSemana: number;
}

export const operadoresService = {
  /** Cadastra um operador por nome (Req 6.1.1–6.1.3). */
  cadastrar(nome: string): Promise<Operador> {
    return apiClient.post<Operador>('/operadores', { nome });
  },

  /** Lista os operadores cadastrados (Req 6.1.5). */
  listar(): Promise<Operador[]> {
    return apiClient.get<Operador[]>('/operadores');
  },

  /** Edita o nome de um operador (Req 6.1.4). */
  editarNome(id: string, nome: string): Promise<Operador> {
    return apiClient.patch<Operador>(`/operadores/${id}`, { nome });
  },

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

  /** Lista os turnos fixos dos operadores. */
  listarTurnos(): Promise<OperadorTurno[]> {
    return apiClient.get<OperadorTurno[]>('/quadro-operadores/turnos');
  },

  /** Cria ou atualiza (por nome) um turno de operador (gestor). */
  salvarTurno(dados: TurnoOperadorInput): Promise<OperadorTurno> {
    return apiClient.post<OperadorTurno>('/quadro-operadores/turnos', dados);
  },

  /** Importa em massa turnos (gestor). */
  importarTurnos(
    turnos: TurnoOperadorInput[],
  ): Promise<{ salvos: number }> {
    return apiClient.post<{ salvos: number }>(
      '/quadro-operadores/turnos/importar',
      { turnos },
    );
  },

  /** Inativa um operador do quadro (gestor). */
  removerTurno(id: string): Promise<void> {
    return apiClient.delete<void>(`/quadro-operadores/turnos/${id}`);
  },
};
