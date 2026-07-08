/** Serviço de Insumos (Req 3.x): saldo, retirada de fardo e consumos. */
import { apiClient } from '../client';
import {
  CategoriaInsumo,
  EntradaInsumo,
  Insumo,
  InsumoProativo,
  InsumoResumo,
  MovimentoEstoque,
  SugestaoPedido,
} from '../types';

export const insumosService = {
  /** Lista os insumos ativos com o resumo de estoque (painel do almoxarifado). */
  listar(): Promise<InsumoResumo[]> {
    return apiClient.get<InsumoResumo[]>('/insumos');
  },

  /** Painel proativo: insumos com predicción, nível, sugestão de reposição. */
  listarProativo(): Promise<InsumoProativo[]> {
    return apiClient.get<InsumoProativo[]>('/insumos/proativo');
  },

  /** Lista as entradas recentes de estoque (Controle de requisição). */
  entradas(): Promise<EntradaInsumo[]> {
    return apiClient.get<EntradaInsumo[]>('/insumos/entradas');
  },

  /** Consumo simplificado em embalagens inteiras (1 fardo, 1 caixa, 1 galão). */
  consumirEmbalagem(insumoId: string, embalagens: number): Promise<{ saldo: number }> {
    return apiClient.post<{ saldo: number }>('/insumos/consumo-embalagem', {
      insumoId,
      embalagens,
    });
  },

  // ----- Pedidos Recorrentes -----

  /** Sugestões de pedido pendentes (card "Pedido da semana"). */
  sugestoesPendentes(): Promise<SugestaoPedido[]> {
    return apiClient.get<SugestaoPedido[]>('/insumos/pedidos-recorrentes/sugestoes');
  },

  /** Próximo pedido quinzenal (sacolas): dias restantes. */
  proximoQuinzenal(): Promise<{ diasRestantes: number } | null> {
    return apiClient.get<{ diasRestantes: number } | null>('/insumos/pedidos-recorrentes/proximo-quinzenal');
  },

  /** Confirmar sugestões de pedido (dá entrada no estoque). */
  confirmarSugestoes(ids: string[], ajustes?: Record<string, number>): Promise<{ confirmadas: number }> {
    return apiClient.post<{ confirmadas: number }>('/insumos/pedidos-recorrentes/confirmar', { ids, ajustes });
  },

  /** Ignorar sugestões de pedido. */
  ignorarSugestoes(ids: string[]): Promise<void> {
    return apiClient.post<void>('/insumos/pedidos-recorrentes/ignorar', { ids });
  },

  /**
   * Registra uma entrada de estoque (Controle de requisição). `quantidade` já
   * em unidade base. Apenas gerente/supervisor.
   */
  registrarEntrada(
    insumoId: string,
    quantidade: number,
    origem?: string,
    data?: string,
  ): Promise<{ saldo: number }> {
    return apiClient.post<{ saldo: number }>(`/insumos/${insumoId}/entrada`, {
      quantidade,
      origem,
      data,
    });
  },

  /** Zera o estoque de todos os insumos (administrativo, apenas gerente). */
  zerarEstoque(): Promise<{ removidos: number }> {
    return apiClient.delete<{ removidos: number }>('/insumos/movimentos');
  },

  /** Zera o estoque de UM insumo (administrativo, apenas gerente). */
  zerarEstoqueInsumo(insumoId: string): Promise<{ removidos: number }> {
    return apiClient.delete<{ removidos: number }>(
      `/insumos/${insumoId}/movimentos`,
    );
  },

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
