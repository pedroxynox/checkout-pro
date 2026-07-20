/** Serviço de API do catálogo de PRODUTOS PESADOS (balança). */
import { Platform } from 'react-native';
import apiClient from '../client';

/** Produto do catálogo (código de balança + nome + setor). */
export interface ProdutoPesado {
  id: string;
  /** CODACESSO — o código que o operador digita na balança. */
  codigo: string;
  nome: string;
  /** Setor (ACOUGUE, PADARIA, P.A.S., FVL, ...). */
  categoria: string;
  /** Tipo do produto (CATEGORIA_NV3), quando informado. */
  tipo: string | null;
}

/** Contagem por setor. */
export interface ContagemCategoriaProduto {
  categoria: string;
  total: number;
}

/** Estado atual do catálogo (tela de carga). */
export interface StatusCatalogoProdutos {
  total: number;
  atualizadoEm: string | null;
  categorias: ContagemCategoriaProduto[];
}

/** Resultado de uma carga (substituição total). */
export interface ResultadoImportacaoProdutos {
  total: number;
  categorias: ContagemCategoriaProduto[];
}

/** Arquivo selecionado para upload (compatível com expo-document-picker). */
export interface ArquivoProdutosPesados {
  uri: string;
  name: string;
  mimeType?: string;
}

/**
 * Monta o FormData do arquivo de forma compatível com web e nativo (mesmo
 * padrão dos uploads de arrecadação/vendas).
 */
async function montarFormArquivo(
  arquivo: ArquivoProdutosPesados,
): Promise<FormData> {
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

export const produtosPesadosService = {
  /** Catálogo completo (o app baixa uma vez e busca em memória). */
  listar(): Promise<ProdutoPesado[]> {
    return apiClient.get<ProdutoPesado[]>('/produtos-pesados');
  },

  /** Total, última atualização e contagem por setor. */
  status(): Promise<StatusCatalogoProdutos> {
    return apiClient.get<StatusCatalogoProdutos>('/produtos-pesados/status');
  },

  /** Envia o arquivo .txt (todos os setores) e substitui o catálogo inteiro. */
  async upload(
    arquivo: ArquivoProdutosPesados,
  ): Promise<ResultadoImportacaoProdutos> {
    const form = await montarFormArquivo(arquivo);
    return apiClient.upload<ResultadoImportacaoProdutos>(
      '/produtos-pesados/upload',
      form,
    );
  },
};
