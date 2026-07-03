/**
 * Arredonda para 2 casas decimais (valores monetários/percentuais). Fonte única
 * — antes esta função estava duplicada em vários serviços.
 */
export function arredondar(n: number): number {
  return Math.round(n * 100) / 100;
}
