/**
 * Serviço de Vendas por hora (Painel de Vendas).
 *
 * As vendas são enviadas diariamente por arquivo .txt (qualquer usuário pode
 * enviar). Não há ajuste manual. Fornece os totais por período e a distribuição
 * por hora para os gráficos.
 */
import { Platform } from 'react-native';
import { apiClient } from '../client';
import {
  ConfigVendas,
  EstimativasMes,
  PainelVendas,
  PainelVendasResumo,
  ResultadoUploadVendas,
  ResumoVendas,
  StatusVendas,
  VendasPorHora,
} from '../types';

export interface ArquivoVendas {
  uri: string;
  name: string;
  mimeType?: string;
}

async function montarFormArquivo(arquivo: ArquivoVendas): Promise<FormData> {
  const form = new FormData();
  const tipoMime = arquivo.mimeType ?? 'text/plain';
  if (Platform.OS === 'web') {
    const resposta = await fetch(arquivo.uri);
    const blob = await resposta.blob();
    form.append('file', blob, arquivo.name);
  } else {
    form.append('file', {
      uri: arquivo.uri,
      name: arquivo.name,
      type: tipoMime,
    } as unknown as Blob);
  }
  return form;
}

export const vendasService = {
  /** Envia o arquivo .txt de vendas por hora, importando o dia informado. */
  async upload(
    arquivo: ArquivoVendas,
    data?: string,
  ): Promise<ResultadoUploadVendas> {
    const form = await montarFormArquivo(arquivo);
    return apiClient.upload<ResultadoUploadVendas>('/vendas/upload', form, {
      data,
    });
  },

  /** Totais do dia/semana/mês para a data informada. */
  resumo(data: string): Promise<ResumoVendas> {
    return apiClient.get<ResumoVendas>('/vendas/resumo', { data });
  },

  /** Distribuição por hora + total no intervalo [início, fim]. */
  porHora(inicio: string, fim: string): Promise<VendasPorHora> {
    return apiClient.get<VendasPorHora>('/vendas/por-hora', { inicio, fim });
  },

  /** Status (enviado/pendente) das vendas no dia. */
  status(data: string): Promise<StatusVendas> {
    return apiClient.get<StatusVendas>('/vendas/status', { data });
  },

  /** Painel inteligente (projeção, comparativos, tendência, curva, lotação). */
  painel(data?: string): Promise<PainelVendas> {
    return apiClient.get<PainelVendas>('/vendas/painel', data ? { data } : undefined);
  },

  /**
   * Resumo do painel (caminho rápido): meta, projeção e comparativos, sem os
   * perfis típicos de ~90 dias. Usado pela Home (Resumo do Dia e contagens)
   * para carregar bem mais rápido.
   */
  painelResumo(data?: string): Promise<PainelVendasResumo> {
    return apiClient.get<PainelVendasResumo>(
      '/vendas/painel-resumo',
      data ? { data } : undefined,
    );
  },

  /** Configuração do painel (meta mensal). */
  config(): Promise<ConfigVendas> {
    return apiClient.get<ConfigVendas>('/vendas/config');
  },

  /** Atualiza a meta mensal de faturamento. */
  definirConfig(dados: { metaMensal?: number }): Promise<ConfigVendas> {
    return apiClient.put<ConfigVendas>('/vendas/config', dados);
  },

  /** Estimativas de venda por dia de um mês (+ total do mês). */
  listarEstimativas(anoMes: string): Promise<EstimativasMes> {
    return apiClient.get<EstimativasMes>('/vendas/estimativas', { anoMes });
  },

  /** Define as estimativas de venda por dia de um mês (Central de Vendas). */
  definirEstimativas(
    anoMes: string,
    dias: { data: string; valor: number }[],
  ): Promise<EstimativasMes> {
    return apiClient.put<EstimativasMes>('/vendas/estimativas', {
      anoMes,
      dias,
    });
  },
};
