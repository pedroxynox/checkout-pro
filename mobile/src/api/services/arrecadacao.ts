/**
 * Serviço de Arrecadação por operador (indicadores).
 *
 * Os arquivos .txt (bloc de notas) que o fiscal sobe em Importações alimentam
 * os indicadores: Troco Solidário, Recargas de Celular, Cancelamento de Itens,
 * Cancelamento de Cupom e Devoluções. Este serviço faz o upload do arquivo de
 * um tipo e consulta os totais (dia/semana/mês) e o ranking por operador.
 */
import { apiClient } from '../client';
import {
  ItemRankingArrecadacao,
  ResultadoUploadArrecadacao,
  ResumoArrecadacao,
  TipoArrecadacao,
} from '../types';

/** Arquivo selecionado para upload (compatível com expo-document-picker). */
export interface ArquivoArrecadacao {
  uri: string;
  name: string;
  mimeType?: string;
}

export const arrecadacaoService = {
  /** Envia o arquivo .txt de um tipo, importando as linhas do dia informado. */
  upload(
    tipo: TipoArrecadacao,
    arquivo: ArquivoArrecadacao,
    data?: string,
  ): Promise<ResultadoUploadArrecadacao> {
    const form = new FormData();
    form.append('file', {
      uri: arquivo.uri,
      name: arquivo.name,
      type: arquivo.mimeType ?? 'text/plain',
    } as unknown as Blob);
    return apiClient.upload<ResultadoUploadArrecadacao>(
      '/arrecadacao/upload',
      form,
      { tipo, data },
    );
  },

  /** Totais do dia/semana/mês de um tipo na data informada (+ meta e %). */
  resumo(tipo: TipoArrecadacao, data: string): Promise<ResumoArrecadacao> {
    return apiClient.get<ResumoArrecadacao>('/arrecadacao/resumo', {
      tipo,
      data,
    });
  },

  /** Ranking de operadores por valor no intervalo [início, fim]. */
  ranking(
    tipo: TipoArrecadacao,
    inicio: string,
    fim: string,
  ): Promise<ItemRankingArrecadacao[]> {
    return apiClient.get<ItemRankingArrecadacao[]>('/arrecadacao/ranking', {
      tipo,
      inicio,
      fim,
    });
  },
};
