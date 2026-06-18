/** Serviço de Indicadores e Painel de Vendas (Req 2.1–2.5). */
import { apiClient } from '../client';
import {
  IndicadorTipo,
  Periodo,
  RankingItem,
  StatusCor,
  TipoRankingOperador,
  VendaDiaria,
} from '../types';

export const indicadoresService = {
  /** Registra o valor de vendas de um dia (Req 2.1.1) — gerente. */
  registrarVenda(data: string, valor: number): Promise<VendaDiaria> {
    return apiClient.post<VendaDiaria>('/indicadores/vendas', { data, valor });
  },

  /** Altera o valor de vendas de um dia (Req 2.1.5) — gerente. */
  alterarVenda(data: string, valor: number): Promise<VendaDiaria> {
    return apiClient.put<VendaDiaria>('/indicadores/vendas', { data, valor });
  },

  /** Acumulado de vendas do período (Req 2.1.2, 2.1.3). */
  acumulado(data: string, periodo: Periodo): Promise<{ total: number }> {
    return apiClient.get<{ total: number }>('/indicadores/vendas/acumulado', {
      data,
      periodo,
    });
  },

  /** Indicador percentual avulso (Req 2.2.1, 2.3.1). */
  percentual(
    totalIndicador: number,
    totalVendas: number,
  ): Promise<{ percentual: number }> {
    return apiClient.post<{ percentual: number }>('/indicadores/percentual', {
      totalIndicador,
      totalVendas,
    });
  },

  /** Classificação de cor de um indicador conforme a meta (Req 2.2–2.5). */
  cor(
    indicador: IndicadorTipo,
    valor: number,
    limiteAmarelo: number,
  ): Promise<{ cor: StatusCor }> {
    return apiClient.post<{ cor: StatusCor }>('/indicadores/cor', {
      indicador,
      valor,
      limiteAmarelo,
    });
  },

  /** Ranking de operadores por tipo e período (Req 2.2.6, 2.4.6, 2.5.6). */
  rankingOperadores(
    tipo: TipoRankingOperador,
    inicio: string,
    fim: string,
  ): Promise<RankingItem[]> {
    return apiClient.get<RankingItem[]>('/indicadores/ranking/operadores', {
      tipo,
      inicio,
      fim,
    });
  },

  /** Ranking de fiscais por devoluções no período (Req 2.3.6). */
  rankingFiscais(inicio: string, fim: string): Promise<RankingItem[]> {
    return apiClient.get<RankingItem[]>('/indicadores/ranking/fiscais', {
      inicio,
      fim,
    });
  },
};
