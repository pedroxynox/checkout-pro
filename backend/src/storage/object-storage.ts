/**
 * Abstração de armazenamento de objetos (imagens de checklist, arquivos de
 * importação). A interface permite trocar a implementação (disco local agora;
 * S3-compatível depois) sem afetar os controllers.
 */

/** Token de injeção da implementação de `ObjectStorage`. */
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

/** Dados de um arquivo a ser persistido no armazenamento de objetos. */
export interface ArquivoParaSalvar {
  /** Conteúdo binário do arquivo. */
  conteudo: Buffer;
  /** Nome original do arquivo (usado para derivar a extensão). */
  nomeOriginal: string;
  /** Tipo MIME, quando conhecido. */
  mimeType?: string;
  /** Subpasta lógica (ex.: "checklists", "importacoes"). */
  prefixo?: string;
}

/** Resultado da persistência de um arquivo. */
export interface ArquivoSalvo {
  /** Chave/identificador do objeto armazenado. */
  chave: string;
  /** URL (ou caminho) para acesso ao objeto. */
  url: string;
}

/**
 * Contrato de armazenamento de objetos. Implementado pelo adaptador de disco
 * local (`LocalDiskStorage`) e, futuramente, por um adaptador S3.
 */
export interface ObjectStorage {
  salvar(arquivo: ArquivoParaSalvar): Promise<ArquivoSalvo>;
}
