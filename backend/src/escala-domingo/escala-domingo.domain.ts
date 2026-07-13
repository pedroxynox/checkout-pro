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
 * Grupo que **folga** num domingo, dada a âncora (domingo de referência +
 * grupo que folga nele). A rotação avança G1 → G2 → G3 a cada domingo.
 */
export function grupoFolgaNoDomingo(
  dataDomingo: Date,
  ancoraData: Date,
  ancoraGrupo: GrupoDomingo,
): GrupoDomingo {
  const base = GRUPOS_DOMINGO.indexOf(ancoraGrupo);
  const n = semanasEntre(ancoraData, dataDomingo);
  const idx = (((base + n) % 3) + 3) % 3;
  return GRUPOS_DOMINGO[idx];
}

/**
 * O colaborador (do grupo informado) trabalha nesse domingo? Sem grupo (null) =
 * fora do rodízio → não trabalha aos domingos (folga fixa).
 */
export function trabalhaNoDomingo(
  grupoColaborador: string | null | undefined,
  dataDomingo: Date,
  ancoraData: Date,
  ancoraGrupo: GrupoDomingo,
): boolean {
  if (!ehGrupoValido(grupoColaborador)) return false;
  return (
    grupoFolgaNoDomingo(dataDomingo, ancoraData, ancoraGrupo) !==
    grupoColaborador
  );
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
