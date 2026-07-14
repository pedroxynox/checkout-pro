/**
 * Rodízio de domingo (função pura, fácil de testar).
 *
 * O domingo funciona por rodízio de 3 grupos (G1, G2, G3): a cada domingo um
 * grupo **folga** e os outros dois trabalham. A rotação avança um grupo por
 * domingo, na ordem G1 → G2 → G3 → G1…, de modo que cada grupo trabalha 2
 * domingos e folga 1.
 *
 * Para "ancorar" o rodízio à realidade basta UM ponto de partida: um domingo de
 * referência e qual grupo folga nele. A partir daí o grupo que folga em
 * qualquer outro domingo é determinístico.
 */

export type GrupoDomingo = 'G1' | 'G2' | 'G3';
export const GRUPOS_DOMINGO: GrupoDomingo[] = ['G1', 'G2', 'G3'];

const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

/** Normaliza para meia-noite UTC (ignora hora, evita erros de fuso). */
function meiaNoiteUTC(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

/** true se `data` é um domingo (UTC). */
export function ehDomingo(data: Date): boolean {
  return data.getUTCDay() === 0;
}

/** Número de semanas (domingos) entre duas datas — pode ser negativo. */
function semanasEntre(de: Date, ate: Date): number {
  return Math.round(
    (meiaNoiteUTC(ate).getTime() - meiaNoiteUTC(de).getTime()) / SEMANA_MS,
  );
}

/** É um grupo válido (G1/G2/G3)? */
export function ehGrupoValido(g: string | null | undefined): g is GrupoDomingo {
  return g === 'G1' || g === 'G2' || g === 'G3';
}

/**
 * A ORDEM do ciclo é a sequência de grupos que folga em cada domingo do ciclo
 * (ex.: ['G1','G3','G2'] = 1º domingo folga G1, 2º folga G3, 3º folga G2, e
 * repete). Deve ser uma permutação dos 3 grupos (cada um folga uma vez por
 * ciclo).
 */
export function ordemValida(
  ordem: readonly string[] | null | undefined,
): ordem is GrupoDomingo[] {
  if (!ordem || ordem.length !== 3) return false;
  return GRUPOS_DOMINGO.every((g) => ordem.filter((x) => x === g).length === 1);
}

/**
 * Grupo que **folga** num domingo, dada a referência (1º domingo do ciclo) e a
 * ORDEM do ciclo. A sequência não é fixa: segue exatamente a ordem informada e
 * repete a cada 3 domingos. Ex.: ref=19/07 e ordem=['G1','G3','G2'] → 19/07
 * folga G1, 26/07 folga G3, 02/08 folga G2, 09/08 folga G1 de novo.
 */
export function grupoFolgaNoDomingo(
  dataDomingo: Date,
  refData: Date,
  ordem: readonly GrupoDomingo[],
): GrupoDomingo {
  const n = semanasEntre(refData, dataDomingo);
  const idx = ((n % ordem.length) + ordem.length) % ordem.length;
  return ordem[idx];
}

/**
 * O colaborador (do grupo informado) trabalha nesse domingo? Sem grupo (null) =
 * fora do rodízio → não trabalha aos domingos (folga fixa).
 */
export function trabalhaNoDomingo(
  grupoColaborador: string | null | undefined,
  dataDomingo: Date,
  refData: Date,
  ordem: readonly GrupoDomingo[],
): boolean {
  if (!ehGrupoValido(grupoColaborador)) return false;
  return grupoFolgaNoDomingo(dataDomingo, refData, ordem) !== grupoColaborador;
}

/** O primeiro domingo >= `apartir` (o próprio dia se já for domingo). */
export function proximoDomingo(apartir: Date): Date {
  const base = meiaNoiteUTC(apartir);
  const add = (7 - base.getUTCDay()) % 7;
  base.setUTCDate(base.getUTCDate() + add);
  return base;
}

/** Os próximos `n` domingos a partir de uma data (inclui o dia se for domingo). */
export function proximosDomingos(apartir: Date, n: number): Date[] {
  const primeiro = proximoDomingo(apartir);
  const out: Date[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(primeiro);
    d.setUTCDate(d.getUTCDate() + 7 * i);
    out.push(d);
  }
  return out;
}
