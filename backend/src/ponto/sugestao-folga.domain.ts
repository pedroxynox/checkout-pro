/**
 * Sugestão do NOVO dia de folga, a partir do que a pessoa realmente trabalhou.
 *
 * ## Por que isto existe
 *
 * Uma batida em dia de folga quase nunca significa "trabalhou no descanso".
 * Significa que **a folga mudou e ninguém atualizou o cadastro**. Avisar o gestor
 * de que "há uma divergência" resolve metade do problema: ele ainda tem de
 * descobrir qual é o novo dia de folga, e é justamente o passo em que se esquece
 * de novo.
 *
 * O ponto batido é a evidência. Se a pessoa trabalhou nas últimas quatro
 * segundas — o dia que o sistema diz ser a folga dela — e não apareceu em
 * nenhuma quarta, a folga virou quarta. O sistema tem os dados para dizer isso.
 *
 * ## A regra
 *
 * Olhando as semanas recentes:
 *
 *  - o dia de folga **do cadastro** foi trabalhado de forma consistente (pelo
 *    menos `MIN_SEMANAS` vezes, e em todas as semanas observadas);
 *  - existe **exatamente um** dia da semana em que a pessoa nunca apareceu;
 *  - esse dia se repetiu em todas as semanas observadas.
 *
 * Só então sugere. Qualquer ambiguidade — dois candidatos, poucas semanas, uma
 * única falta isolada — devolve `null`: um palpite errado sobre a folga de alguém
 * é pior do que não palpitar, porque o gestor pode aplicá-lo sem verificar.
 *
 * Sem efeitos colaterais — testável sem banco.
 */

/** Mínimo de semanas observadas para arriscar uma sugestão. */
export const MIN_SEMANAS_SUGESTAO = 2;

const NOMES_DIA = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
];

/** Nome do dia da semana (0 = domingo), para o texto do aviso. */
export function nomeDiaSemana(diaSemana: number): string {
  return NOMES_DIA[diaSemana] ?? String(diaSemana);
}

/** Um dia em que a pessoa comprovadamente trabalhou (tem batida). */
export interface DiaTrabalhado {
  /** Dia (00:00 UTC) em que houve batida. */
  data: Date;
}

export interface SugestaoFolga {
  /** Dia da semana que o cadastro diz ser folga, e que foi trabalhado. */
  folgaAtual: number;
  /** Dia da semana sugerido como a nova folga. */
  folgaSugerida: number;
  /** Quantas semanas sustentam a conclusão. */
  semanas: number;
}

/** Semana ISO-ish: a segunda-feira (00:00 UTC) da semana daquele dia. */
function chaveSemana(data: Date): number {
  const d = new Date(
    Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()),
  );
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.getTime();
}

/**
 * Sugere o novo dia de folga, ou `null` quando os dados não sustentam nenhuma
 * conclusão segura.
 *
 * @param folgaAtual dia da semana registrado como folga no cadastro
 * @param diasTrabalhados dias com batida (qualquer intervalo; o cálculo agrupa
 *   por semana e só considera as semanas completas observadas)
 */
export function sugerirFolgaPorBatidas(
  folgaAtual: number | null,
  diasTrabalhados: readonly DiaTrabalhado[],
): SugestaoFolga | null {
  if (folgaAtual == null) return null;
  if (diasTrabalhados.length === 0) return null;

  // Agrupa por semana: `semana -> conjunto de dias da semana trabalhados`.
  const porSemana = new Map<number, Set<number>>();
  for (const d of diasTrabalhados) {
    const k = chaveSemana(d.data);
    if (!porSemana.has(k)) porSemana.set(k, new Set());
    porSemana.get(k)!.add(d.data.getUTCDay());
  }

  const semanas = [...porSemana.values()];
  if (semanas.length < MIN_SEMANAS_SUGESTAO) return null;

  // 1. A folga do cadastro foi trabalhada em TODAS as semanas observadas? Se
  //    numa delas a pessoa descansou no dia certo, não há mudança de folga —
  //    houve uma exceção pontual, e sugerir mudança seria errado.
  const trabalhouNaFolgaSempre = semanas.every((dias) => dias.has(folgaAtual));
  if (!trabalhouNaFolgaSempre) return null;

  // 2. Qual dia a pessoa nunca trabalhou, em nenhuma das semanas? Esse é o
  //    candidato a nova folga. Domingo fica de fora: ali a escala vem do rodízio
  //    de grupos, e "não trabalhou domingo" é o normal de quem não está no grupo
  //    da semana — não indica mudança de folga fixa.
  const candidatos: number[] = [];
  for (let dow = 1; dow <= 6; dow++) {
    if (dow === folgaAtual) continue;
    if (semanas.every((dias) => !dias.has(dow))) candidatos.push(dow);
  }

  // 3. Exatamente um candidato. Com dois ou mais não se sabe qual é a folga (a
  //    pessoa pode ter faltado, estado de férias, ou a semana estar incompleta).
  if (candidatos.length !== 1) return null;

  return {
    folgaAtual,
    folgaSugerida: candidatos[0],
    semanas: semanas.length,
  };
}

/** Frase pronta para o aviso, ou string vazia quando não há sugestão. */
export function textoSugestaoFolga(sugestao: SugestaoFolga | null): string {
  if (!sugestao) return '';
  return (
    `Nas últimas ${sugestao.semanas} semanas ela trabalhou toda ` +
    `${nomeDiaSemana(sugestao.folgaAtual)} e não apareceu nenhuma ` +
    `${nomeDiaSemana(sugestao.folgaSugerida)} — a folga parece ter mudado para ` +
    `${nomeDiaSemana(sugestao.folgaSugerida)}. Confirme no cadastro.`
  );
}
