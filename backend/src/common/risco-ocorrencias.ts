/**
 * Puntuação de risco **partilhada** por faltas (`operadores`) e não-retornos
 * (`incidencias`). Antes cada domínio repetia os mesmos limiares e o mesmo
 * mapa pontos→nível; aqui ficam como fonte única, deixando cada domínio somar
 * apenas os seus sinais específicos (ex.: faltas em emenda, reincidência).
 *
 * Funções puras/determinísticas (sem Nest nem Prisma).
 */

/** Nível de risco no semáforo do painel (comum a faltas e não-retornos). */
export type NivelRisco = 'BAIXO' | 'MEDIO' | 'ALTO';

/**
 * Mapa final pontos→nível (idêntico nos dois domínios):
 *  - 4+ pontos → ALTO;
 *  - 2–3 pontos → MEDIO;
 *  - 0–1 ponto → BAIXO.
 */
export function nivelPorPontos(pontos: number): NivelRisco {
  if (pontos >= 4) return 'ALTO';
  if (pontos >= 2) return 'MEDIO';
  return 'BAIXO';
}

/** Pontos pela taxa/percentual (%) de ocorrências: 20%+ → 2, 10%+ → 1. */
export function pontosPorTaxa(percentual: number): number {
  if (percentual >= 20) return 2;
  if (percentual >= 10) return 1;
  return 0;
}

/** Pontos pela quantidade de ocorrências no período: 4+ → 2, 2+ → 1. */
export function pontosPorQuantidade(quantidade: number): number {
  if (quantidade >= 4) return 2;
  if (quantidade >= 2) return 1;
  return 0;
}

/** Pontos pela maior sequência de dias consecutivos: 2+ → 1. */
export function pontosPorSequencia(sequenciaMax: number): number {
  return sequenciaMax >= 2 ? 1 : 0;
}
