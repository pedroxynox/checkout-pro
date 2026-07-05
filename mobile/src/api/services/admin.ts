/**
 * Serviço administrativo de dados (operações destrutivas — apenas gestor).
 *
 * Reúne as ações de "zerar/limpar" globais expostas ao perfil com a
 * funcionalidade `ADMIN_DADOS`. Hoje: o reinício operacional, que apaga os
 * dados de movimento (vendas, arrecadação, estoque em movimento, sacolas APAE,
 * jornada/escala por data, notificações, checklists, fluxos legados) e zera o
 * saldo dos insumos numa única transação no backend, conservando os cadastros.
 */
import { apiClient } from '../client';

/**
 * Resumo do reinício: contagem de registros apagados por entidade
 * (chave = nome da tabela no backend). Ex.: `{ vendas_diarias: 120, ... }`.
 */
export type ResumoReinicio = Record<string, number>;

export const adminService = {
  /**
   * Dispara o reinício operacional (`POST /admin/reset-operacional`). Exige o
   * marcador de confirmação explícita `confirmacao: 'ZERAR'`. Devolve o resumo
   * com a contagem apagada por entidade.
   */
  zerarDados(dados: { confirmacao: 'ZERAR' }): Promise<ResumoReinicio> {
    return apiClient.post<ResumoReinicio>('/admin/reset-operacional', dados);
  },
};
