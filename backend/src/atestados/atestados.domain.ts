/**
 * Lógica **pura** dos atestados médicos (sem Nest/Prisma): normalização de CID,
 * busca no catálogo CID-10, contagem de dias e a **regra do INSS**.
 *
 * Regra do INSS (Brasil): atestados com o **mesmo CID** que, somados, passam de
 * **15 dias** dentro de uma **janela de 60 dias** devem ser encaminhados ao
 * INSS (auxílio-doença) — até o 15º dia o afastamento é responsabilidade do
 * empregador. Estas funções calculam esse total e sinalizam quando o limite é
 * ultrapassado, de forma determinística e testável.
 */
import { EntradaCid } from './cid10.catalogo';

/** Janela (em dias) na qual os dias de atestado do mesmo CID são somados. */
export const JANELA_INSS_DIAS = 60;
/** Limite (em dias) de atestado com o mesmo CID pago pelo empregador. */
export const LIMITE_INSS_DIAS = 15;

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/** Minúsculas e sem acentos — para uma busca tolerante no catálogo. */
function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Normaliza um CID informado: maiúsculas, sem espaços, apenas letras/dígitos e
 * ponto (ex.: " m54.5 " → "M54.5"). Devolve `null` para entrada vazia.
 */
export function normalizarCid(cid: string | null | undefined): string | null {
  if (!cid) return null;
  const limpo = cid
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9.]/g, '');
  return limpo.length > 0 ? limpo : null;
}

/**
 * Busca no catálogo por código OU descrição (tolerante a acentos/caixa).
 * Prioriza os que começam pelo termo (código), depois os demais. Limita o
 * resultado a `limite`.
 */
export function buscarCid(
  catalogo: readonly EntradaCid[],
  termo: string,
  limite = 20,
): EntradaCid[] {
  const t = semAcento(termo);
  if (!t) return catalogo.slice(0, limite);
  const tCodigo = t.replace(/\s+/g, '');
  const comeca: EntradaCid[] = [];
  const contem: EntradaCid[] = [];
  for (const e of catalogo) {
    const cod = e.codigo.toLowerCase();
    const desc = semAcento(e.descricao);
    if (cod.startsWith(tCodigo)) {
      comeca.push(e);
    } else if (cod.includes(tCodigo) || desc.includes(t)) {
      contem.push(e);
    }
  }
  return [...comeca, ...contem].slice(0, limite);
}

/** Total de dias corridos (inclusive) de um período [inicio, fim]. */
export function contarDiasCorridos(inicio: Date, fim: Date): number {
  const d0 = Date.UTC(
    inicio.getUTCFullYear(),
    inicio.getUTCMonth(),
    inicio.getUTCDate(),
  );
  const d1 = Date.UTC(
    fim.getUTCFullYear(),
    fim.getUTCMonth(),
    fim.getUTCDate(),
  );
  if (d1 < d0) return 0;
  return Math.round((d1 - d0) / UM_DIA_MS) + 1;
}

/** Episódio de atestado reduzido ao necessário para a regra do INSS. */
export interface EpisodioAtestado {
  cid: string | null;
  inicio: Date;
  dias: number;
}

/** Resultado da avaliação da regra do INSS para um CID. */
export interface AvaliacaoInss {
  cid: string | null;
  totalDias: number;
  janelaDias: number;
  limiteDias: number;
  /** true quando o total ultrapassa o limite do empregador (encaminhar ao INSS). */
  ultrapassaInss: boolean;
}

/**
 * Soma os dias dos episódios com o **mesmo CID** cujo início cai na janela de
 * `janelaDias` que termina em `referenciaFim` (inclusive), e indica se o total
 * ultrapassa `LIMITE_INSS_DIAS`. Atestados **sem CID** (`cid === null`) não são
 * agrupados: a regra depende do mesmo CID, então o resultado é sempre
 * `ultrapassaInss = false`.
 */
export function avaliarRegraInss(params: {
  episodios: readonly EpisodioAtestado[];
  cid: string | null;
  referenciaFim: Date;
  janelaDias?: number;
  limiteDias?: number;
}): AvaliacaoInss {
  const janelaDias = params.janelaDias ?? JANELA_INSS_DIAS;
  const limiteDias = params.limiteDias ?? LIMITE_INSS_DIAS;
  const cid = normalizarCid(params.cid);
  if (!cid) {
    return {
      cid: null,
      totalDias: 0,
      janelaDias,
      limiteDias,
      ultrapassaInss: false,
    };
  }
  const fimJanela = Date.UTC(
    params.referenciaFim.getUTCFullYear(),
    params.referenciaFim.getUTCMonth(),
    params.referenciaFim.getUTCDate(),
  );
  const inicioJanela = fimJanela - (janelaDias - 1) * UM_DIA_MS;
  let totalDias = 0;
  for (const ep of params.episodios) {
    if (normalizarCid(ep.cid) !== cid) continue;
    const ini = Date.UTC(
      ep.inicio.getUTCFullYear(),
      ep.inicio.getUTCMonth(),
      ep.inicio.getUTCDate(),
    );
    if (ini >= inicioJanela && ini <= fimJanela) {
      totalDias += ep.dias;
    }
  }
  return {
    cid,
    totalDias,
    janelaDias,
    limiteDias,
    ultrapassaInss: totalDias > limiteDias,
  };
}

/**
 * Indica se um novo atestado FEZ o total cruzar o limite do INSS agora (o total
 * anterior estava dentro do limite e o novo total o ultrapassa). Serve para
 * avisar a gestão **uma única vez**, no momento em que o limite é cruzado.
 */
export function cruzouLimiteInss(
  totalAntes: number,
  totalDepois: number,
  limiteDias = LIMITE_INSS_DIAS,
): boolean {
  return totalAntes <= limiteDias && totalDepois > limiteDias;
}
