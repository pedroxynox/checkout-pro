/**
 * Lógica de domínio **pura** do Modulo_Checklist (Req 5.1–5.3).
 *
 * Concentra a validação de imagem (Req 5.1.4), a derivação do status a partir
 * do envio de imagem (Req 5.1.2, 5.1.5), as janelas fixas de execução
 * (Req 5.2) e a regra de disparo do alerta no horário-limite (Req 5.3.1,
 * 5.3.2).
 *
 * Por serem puras e determinísticas, podem ser exercitadas por testes de
 * propriedade (fast-check) sem qualquer infraestrutura.
 */

export type TipoChecklist = 'ABERTURA' | 'FECHAMENTO';
export type StatusChecklist = 'PENDENTE' | 'FEITO';

/** Janela de execução de um checklist, em minutos a partir da meia-noite. */
export interface JanelaExecucao {
  inicioMin: number;
  fimMin: number;
}

/** Referência mínima de um arquivo enviado (tipo MIME e/ou nome). */
export interface ArquivoRef {
  mimeType?: string | null;
  nome?: string | null;
}

// Janelas fixas de execução (Req 5.2.1, 5.2.2): 08:15–09:15 e 13:15–14:15.
const JANELAS: Record<TipoChecklist, JanelaExecucao> = {
  ABERTURA: { inicioMin: 8 * 60 + 15, fimMin: 9 * 60 + 15 },
  FECHAMENTO: { inicioMin: 13 * 60 + 15, fimMin: 14 * 60 + 15 },
};

// Horários-limite do alerta (Req 5.3.1, 5.3.2): 08:55 e 13:55.
const LIMITE_ALERTA_MIN: Record<TipoChecklist, number> = {
  ABERTURA: 8 * 60 + 55,
  FECHAMENTO: 13 * 60 + 55,
};

const EXTENSOES_IMAGEM = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'heic',
  'heif',
]);

/** Minutos a partir da meia-noite (UTC) de um instante. */
export function minutosDoDia(instante: Date): number {
  return instante.getUTCHours() * 60 + instante.getUTCMinutes();
}

/** Retorna a janela de execução fixa de um tipo de checklist (Req 5.2). */
export function janela(tipo: TipoChecklist): JanelaExecucao {
  return JANELAS[tipo];
}

/**
 * Indica se um arquivo é uma imagem (Req 5.1.4). Considera o tipo MIME
 * (`image/...`) quando disponível e, na ausência dele, a extensão do nome do
 * arquivo. Retorna `false` quando não há informação suficiente.
 */
export function ehImagem(arquivo: ArquivoRef): boolean {
  const mime = arquivo.mimeType?.trim().toLowerCase();
  if (mime) {
    return mime.startsWith('image/');
  }
  const nome = arquivo.nome?.trim().toLowerCase();
  if (nome) {
    const ponto = nome.lastIndexOf('.');
    if (ponto >= 0 && ponto < nome.length - 1) {
      return EXTENSOES_IMAGEM.has(nome.slice(ponto + 1));
    }
  }
  return false;
}

/**
 * Deriva o status de um checklist (Req 5.1.2, 5.1.5): "FEITO" se e somente se
 * uma imagem válida foi enviada; caso contrário, "PENDENTE".
 */
export function statusChecklist(imagemValidaEnviada: boolean): StatusChecklist {
  return imagemValidaEnviada ? 'FEITO' : 'PENDENTE';
}

/** Resultado da tentativa de aplicar um envio de imagem a um checklist. */
export interface ResultadoEnvio {
  aceito: boolean;
  status: StatusChecklist;
}

/**
 * Aplica uma tentativa de envio de arquivo a um checklist (Req 5.1.2, 5.1.4,
 * 5.1.5): aceita e marca como "FEITO" se e somente se o arquivo for uma
 * imagem; caso contrário, rejeita e mantém o status anterior.
 */
export function aplicarEnvio(
  statusAtual: StatusChecklist,
  arquivo: ArquivoRef,
): ResultadoEnvio {
  if (ehImagem(arquivo)) {
    return { aceito: true, status: 'FEITO' };
  }
  return { aceito: false, status: statusAtual };
}

/**
 * Indica se o alerta de checklist pendente deve ser disparado (Req 5.3.1,
 * 5.3.2): verdadeiro **se e somente se** o horário-limite (08:55 para abertura,
 * 13:55 para fechamento) foi atingido e o checklist ainda está "PENDENTE".
 */
export function deveAlertar(
  tipo: TipoChecklist,
  minutos: number,
  status: StatusChecklist,
): boolean {
  return minutos >= LIMITE_ALERTA_MIN[tipo] && status === 'PENDENTE';
}
