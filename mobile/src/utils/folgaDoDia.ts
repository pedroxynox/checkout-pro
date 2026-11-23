/**
 * Folga do dia na aba Escalas (spec `jornada-5x2`, R5.1): os grupos que folgam
 * em qualquer dia e o motivo da folga de cada pessoa no 5x2.
 */
import type { ColaboradorDia, DiaOperadores } from '../api/types';

const GRUPOS = ['G1', 'G2', 'G3'];

/**
 * Grupos que folgam no dia: o campo novo (`gruposFolga`), em qualquer dia; com
 * backend antigo, o grupo do domingo.
 */
export function gruposFolgaDoDia(
  dados:
    Pick<DiaOperadores, 'gruposFolga' | 'grupoFolgaDomingo'> | null | undefined,
): string[] {
  if (!dados) return [];
  if (dados.gruposFolga) return dados.gruposFolga;
  return dados.grupoFolgaDomingo ? [dados.grupoFolgaDomingo] : [];
}

/** Os grupos que trabalham quando `folgam` estão de folga ("G2 e G3"). */
export function gruposQueTrabalham(folgam: readonly string[]): string {
  return GRUPOS.filter((g) => !folgam.includes(g)).join(' e ');
}

/** Rótulo da folga: "Folga · G1", "Folga fixa" (5x2) ou "Folga" (6x1). */
export function rotuloFolga(
  c: Pick<ColaboradorDia, 'motivoFolga' | 'grupoFolga'>,
): string {
  if (c.motivoFolga === 'GRUPO' && c.grupoFolga) {
    return `Folga · ${c.grupoFolga}`;
  }
  if (c.motivoFolga === 'FOLGA_FIXA') return 'Folga fixa';
  return 'Folga';
}
