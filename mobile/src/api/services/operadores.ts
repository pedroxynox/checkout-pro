/** Serviço de Operadores e Ausências (Req 6.1, 6.2, 6.3, 6.6). */
import { apiClient } from '../client';
import {
  Ausencia,
  ContagemTurno,
  ItemRelatorioAusencia,
  Operador,
  OperadorEscalaDia,
} from '../types';

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
};
