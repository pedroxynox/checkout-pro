/** Serviço de Insumos (Req 3.x): saldo, retirada de fardo e consumos. */
import { apiClient } from '../client';
import { CategoriaInsumo, Insumo, MovimentoEstoque } from '../types';

export const insumosService = {
  /** Cadastra um novo insumo com limite mínimo (Req 3.3.4). */
  cadastrar(
    nome: string,
    categoria: CategoriaInsumo,
    limiteMinimo: number,
    saldoInicial = 0,
  ): Promise<Insumo> {
    return apiClient.post<Insumo>('/insumos', {
      nome,
      categoria,
      limiteMinimo,
      saldoInicial,
    });
  },

  /** Saldo de estoque de um insumo em tempo real (Req 3.1.4). */
  saldo(insumoId: string): Promise<{ saldo: number }> {
    return apiClient.get<{ saldo: number }>(`/insumos/${insumoId}/saldo`);
  },

  /** Retirada de um fardo de sacolas pelo código de barras (Req 3.1.1–3.1.3). */
  retirarFardo(
    codigoBarras: string,
    insumoId: string,
    destino?: string,
  ): Promise<{ saldo: number }> {
    return apiClient.post<{ saldo: number }>('/insumos/fardos/retirada', {
      codigoBarras,
      insumoId,
      destino,
    });
  },

  /** Consumo de bobinas de um PDV (Req 3.2.2). */
  consumirBobina(
    insumoId: string,
    pdvId: string,
    quantidade: number,
  ): Promise<{ saldo: number }> {
    return apiClient.post<{ saldo: number }>('/insumos/bobinas/consumo', {
      insumoId,
      pdvId,
      quantidade,
    });
  },

  /** Consumo genérico de um insumo (Req 3.3.2). */
  consumirInsumo(
    insumoId: string,
    quantidade: number,
  ): Promise<{ saldo: number }> {
    return apiClient.post<{ saldo: number }>('/insumos/consumo', {
      insumoId,
      quantidade,
    });
  },

  /** Verifica se o estoque de um insumo está baixo (Req 3.1.5, 3.2.3, 3.3.3). */
  estoqueBaixo(insumoId: string): Promise<{ estoqueBaixo: boolean }> {
    return apiClient.get<{ estoqueBaixo: boolean }>(
      `/insumos/${insumoId}/estoque-baixo`,
    );
  },

  /** Histórico de movimentos/consumo de um insumo (Req 3.1.6, 3.2.4). */
  historico(insumoId: string): Promise<MovimentoEstoque[]> {
    return apiClient.get<MovimentoEstoque[]>(`/insumos/${insumoId}/historico`);
  },
};
