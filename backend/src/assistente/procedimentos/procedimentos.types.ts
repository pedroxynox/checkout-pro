/**
 * Tipos dos "procedimentos guiados" — passo a passo ilustrado extraído das
 * normativas (PDFs) da loja. Cada procedimento é uma sequência de blocos
 * (texto e imagens) na ordem de leitura do documento original.
 */

/** Um bloco do passo a passo: um trecho de texto OU uma foto. */
export interface BlocoProcedimento {
  tipo: 'texto' | 'imagem';
  /** Conteúdo do texto (quando tipo = 'texto'). */
  conteudo?: string;
  /** Caminho relativo da imagem servida pelo backend (quando tipo = 'imagem'). */
  imagem?: string;
  /** Largura original (para calcular a proporção na exibição). */
  w?: number;
  /** Altura original. */
  h?: number;
}

/** Um procedimento operacional completo, com seus passos e fotos. */
export interface ProcedimentoGuiado {
  /** Identificador (slug) usado na tag [PROC:<id>]. */
  id: string;
  titulo: string;
  /** Palavras-chave para ajudar o modelo a reconhecer o procedimento. */
  palavrasChave: string[];
  /** Resumo curto (início do texto) para contexto. */
  resumo: string;
  /** Texto completo (para fundamentar as respostas / busca futura). */
  texto: string;
  /** Passo a passo na ordem do documento. */
  blocos: BlocoProcedimento[];
}
