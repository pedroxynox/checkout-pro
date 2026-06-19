/**
 * Serviço de Importações (Req 1.x): upload, status, pendentes e histórico.
 *
 * NOTA (manutenção): este é o fluxo ANTIGO de importação (CSV/XLSX dos 4 tipos).
 * A UI atual de "Importações" usa `arrecadacaoService` (arquivos .txt dos
 * indicadores). Este cliente é mantido pois os endpoints `/importacoes/*` ainda
 * existem no backend, mas hoje NENHUMA tela o utiliza.
 */
import { apiClient } from '../client';
import {
  RegistroImportacao,
  ResultadoImportacao,
  StatusDia,
  TipoArquivo,
} from '../types';

/** Arquivo selecionado para upload (compatível com expo-document-picker). */
export interface ArquivoSelecionado {
  uri: string;
  name: string;
  mimeType?: string;
}

export const importacoesService = {
  /** Faz o upload e parsing de um arquivo de importação (Req 1.1). */
  upload(
    tipo: TipoArquivo,
    arquivo: ArquivoSelecionado,
    dataReferencia?: string,
  ): Promise<ResultadoImportacao> {
    const form = new FormData();
    form.append('file', {
      uri: arquivo.uri,
      name: arquivo.name,
      type: arquivo.mimeType ?? 'text/csv',
    } as unknown as Blob);
    return apiClient.upload<ResultadoImportacao>('/importacoes/upload', form, {
      tipo,
      dataReferencia,
    });
  },

  /** Status (importado/pendente) de cada tipo no dia (Req 1.2). */
  statusDoDia(data: string): Promise<StatusDia> {
    return apiClient.get<StatusDia>('/importacoes/status', { data });
  },

  /** Tipos ainda pendentes no dia (Req 1.4.1). */
  pendentes(data: string): Promise<TipoArquivo[]> {
    return apiClient.get<TipoArquivo[]>('/importacoes/pendentes', { data });
  },

  /** Histórico, opcionalmente filtrado por intervalo (Req 1.3). */
  historico(inicio?: string, fim?: string): Promise<RegistroImportacao[]> {
    return apiClient.get<RegistroImportacao[]>('/importacoes/historico', {
      inicio,
      fim,
    });
  },
};
