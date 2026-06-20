/**
 * Serviço de Arrecadação por operador (indicadores).
 *
 * Os arquivos .txt (bloc de notas) que o fiscal sobe em Importações alimentam
 * os indicadores: Troco Solidário, Recargas de Celular, Cancelamento de Itens,
 * Cancelamento de Cupom e Devoluções. Este serviço faz o upload do arquivo de
 * um tipo e consulta os totais (dia/semana/mês) e o ranking por operador.
 */
import { Platform } from 'react-native';
import { apiClient } from '../client';
import {
  DetalheArrecadacao,
  ItemRankingArrecadacao,
  ResultadoUploadArrecadacao,
  ResumoArrecadacao,
  StatusArrecadacao,
  TipoArrecadacao,
} from '../types';

/** Arquivo selecionado para upload (compatível com expo-document-picker). */
export interface ArquivoArrecadacao {
  uri: string;
  name: string;
  mimeType?: string;
}

/**
 * Monta o FormData do arquivo de forma compatível com web e nativo.
 *
 * No nativo (APK), o React Native aceita o objeto { uri, name, type }. Na web,
 * é preciso anexar um Blob real — por isso buscamos o conteúdo da URI e o
 * anexamos com o nome do arquivo.
 */
async function montarFormArquivo(arquivo: ArquivoArrecadacao): Promise<FormData> {
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

export const arrecadacaoService = {
  /** Envia o arquivo .txt de um tipo, importando as linhas do dia informado. */
  async upload(
    tipo: TipoArrecadacao,
    arquivo: ArquivoArrecadacao,
    data?: string,
  ): Promise<ResultadoUploadArrecadacao> {
    const form = await montarFormArquivo(arquivo);
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

  /** Status (enviado/sem movimento/pendente) de cada tipo no dia. */
  status(data: string): Promise<StatusArrecadacao> {
    return apiClient.get<StatusArrecadacao>('/arrecadacao/status', { data });
  },

  /** Marca um tipo como "sem movimento" no dia (carga — perfil IMPORTADOR). */
  marcarSemMovimento(tipo: TipoArrecadacao, data: string): Promise<void> {
    return apiClient.post<void>('/arrecadacao/sem-movimento', { tipo, data });
  },

  /** Remove a marca de "sem movimento" (correção). */
  removerSemMovimento(tipo: TipoArrecadacao, data: string): Promise<void> {
    return apiClient.delete<void>('/arrecadacao/sem-movimento', { tipo, data });
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

  /** Detalhe de cada lançamento (operador, autorização, motivo, valor). */
  detalhes(
    tipo: TipoArrecadacao,
    inicio: string,
    fim: string,
  ): Promise<DetalheArrecadacao[]> {
    return apiClient.get<DetalheArrecadacao[]>('/arrecadacao/detalhes', {
      tipo,
      inicio,
      fim,
    });
  },
};
