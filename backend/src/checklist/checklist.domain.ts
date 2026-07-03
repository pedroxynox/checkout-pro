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

/** Status visual (derivado) para a UI: pontualidade e pendência. */
export type StatusVisual =
  | 'FEITO_NO_PRAZO'
  | 'ATRASADO'
  | 'PENDENTE'
  | 'NAO_FEITO';

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

// Lembrete 5 min ANTES do início da janela (08:10 / 13:10).
const LEMBRETE_INICIO_MIN: Record<TipoChecklist, number> = {
  ABERTURA: 8 * 60 + 10,
  FECHAMENTO: 13 * 60 + 10,
};

// Alerta de pendência 15 min ANTES do limite (fim da janela): 09:00 / 14:00.
const ALERTA_PENDENTE_MIN: Record<TipoChecklist, number> = {
  ABERTURA: 9 * 60,
  FECHAMENTO: 14 * 60,
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

/** Formata minutos do dia em "HH:mm". */
function hhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Janela de execução em texto "HH:mm" (para a UI). */
export function janelaTexto(tipo: TipoChecklist): {
  inicio: string;
  fim: string;
} {
  const j = JANELAS[tipo];
  return { inicio: hhmm(j.inicioMin), fim: hhmm(j.fimMin) };
}

/** Indica se um instante (em minutos do dia) está dentro da janela. */
export function dentroDaJanela(tipo: TipoChecklist, minutos: number): boolean {
  const j = JANELAS[tipo];
  return minutos >= j.inicioMin && minutos <= j.fimMin;
}

/**
 * Deriva o status visual para a UI a partir do status, da pontualidade e do
 * horário atual:
 *  - FEITO_NO_PRAZO: enviado e dentro da janela;
 *  - ATRASADO: enviado fora da janela (noPrazo === false);
 *  - NAO_FEITO: ainda pendente e o limite (fim da janela) já passou;
 *  - PENDENTE: ainda pendente, antes/dentro da janela.
 */
export function derivarStatusVisual(
  status: StatusChecklist,
  noPrazo: boolean | null,
  minutosAgora: number,
  tipo: TipoChecklist,
): StatusVisual {
  if (status === 'FEITO') {
    return noPrazo === false ? 'ATRASADO' : 'FEITO_NO_PRAZO';
  }
  return minutosAgora > JANELAS[tipo].fimMin ? 'NAO_FEITO' : 'PENDENTE';
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
 * Indica se o alerta de checklist pendente deve ser disparado: verdadeiro **se
 * e somente se** o horário de alerta (15 min antes do limite: 09:00 para
 * abertura, 14:00 para fechamento) foi atingido e o checklist ainda está
 * "PENDENTE".
 */
export function deveAlertar(
  tipo: TipoChecklist,
  minutos: number,
  status: StatusChecklist,
): boolean {
  return minutos >= ALERTA_PENDENTE_MIN[tipo] && status === 'PENDENTE';
}

/**
 * Indica se o lembrete de início (5 min antes da janela abrir: 08:10/13:10)
 * deve ser disparado e o checklist ainda não foi feito.
 */
export function deveLembrarInicio(
  tipo: TipoChecklist,
  minutos: number,
  status: StatusChecklist,
): boolean {
  return minutos >= LEMBRETE_INICIO_MIN[tipo] && status === 'PENDENTE';
}
