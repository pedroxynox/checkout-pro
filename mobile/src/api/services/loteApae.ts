/** Serviço do Lote de Sacolas APAE (Req 2.6). */
import { apiClient } from '../client';
import { LoteApae, ConfigApae, PainelApae } from '../types';

export const loteApaeService = {
  /** Registra um novo lote inicial (Req 2.6.1). */
  registrarLote(quantidadeInicial: number): Promise<LoteApae> {
    return apiClient.post<LoteApae>('/lote-apae', { quantidadeInicial });
  },

  /** Atualiza o saldo restante do lote (Req 2.6.2–2.6.4). */
  atualizarSaldo(id: string, saldoAtual: number): Promise<LoteApae> {
    return apiClient.put<LoteApae>(`/lote-apae/${id}/saldo`, { saldoAtual });
  },

  /** Reinicia o ciclo, encerrando o atual e abrindo um novo (Req 2.6.5). */
  reiniciar(
    id: string,
    novaQuantidadeInicial: number,
  ): Promise<{ encerrado: LoteApae; novo: LoteApae }> {
    return apiClient.post<{ encerrado: LoteApae; novo: LoteApae }>(
      `/lote-apae/${id}/reiniciar`,
      { novaQuantidadeInicial },
    );
  },

  /** Histórico de lotes encerrados (Req 2.6.7). */
  historico(): Promise<LoteApae[]> {
    return apiClient.get<LoteApae[]>('/lote-apae/historico');
  },

  /** Lote em andamento (status ABERTO) ou `null` se não houver. */
  ativo(): Promise<LoteApae | null> {
    return apiClient.get<LoteApae | null>('/lote-apae/ativo');
  },

  /** Remove todos os lotes encerrados do histórico (apenas gerente). */
  limparHistorico(): Promise<{ removidos: number }> {
    return apiClient.delete<{ removidos: number }>('/lote-apae/historico');
  },

  /** Configuração atual (preço da sacola e meta mensal). */
  config(): Promise<ConfigApae> {
    return apiClient.get<ConfigApae>('/lote-apae/config');
  },

  /** Atualiza preço e/ou meta mensal (apenas gestor). */
  definirConfig(dados: {
    precoSacola?: number;
    metaMensal?: number;
  }): Promise<ConfigApae> {
    return apiClient.put<ConfigApae>('/lote-apae/config', dados);
  },

  /** Painel inteligente consolidado (arrecadação, tendência, previsão). */
  painel(): Promise<PainelApae> {
    return apiClient.get<PainelApae>('/lote-apae/painel');
  },
};
