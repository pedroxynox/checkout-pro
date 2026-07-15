/**
 * Comparação de nomes tolerante a erros do OCR — Fase B (leitor de ponto).
 *
 * O nome lido do comprovante pode vir com pequenos erros do OCR (uma letra
 * trocada, um pedaço faltando). Uma comparação literal (igual/contém) erra
 * nesses casos e ainda gera falso positivo com pedaços curtos (ex.: "ANA"
 * dentro de "MARIANA"). Aqui usamos SIMILARIDADE por token (distância de
 * edição), casando cada palavra do nome lido com a palavra mais parecida do
 * candidato e dando mais peso aos sobrenomes (as últimas palavras), que
 * distinguem melhor as pessoas.
 *
 * Função pura, sem I/O — fácil de testar. Devolve um score de 0 a 1.
 */

/** Distância de edição (Levenshtein) entre duas strings. */
export function distanciaLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Uma linha da matriz por vez (economiza memória).
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  let atual = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    atual[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(
        anterior[j] + 1, // remoção
        atual[j - 1] + 1, // inserção
        anterior[j - 1] + custo, // substituição
      );
    }
    [anterior, atual] = [atual, anterior];
  }
  return anterior[b.length];
}

/** Similaridade [0,1] entre duas palavras (1 = iguais). */
export function similaridadePalavra(a: string, b: string): number {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - distanciaLevenshtein(a, b) / maxLen;
}

// Abaixo deste valor, consideramos que duas palavras NÃO casam (evita que
// pedaços curtos casem por acaso: "ANA" x "MARIANA" ≈ 0,43 → não casa).
const LIMIAR_PALAVRA = 0.7;

/** Quebra o nome (já normalizado) em palavras "de verdade" (2+ letras). */
function palavras(nomeNormalizado: string): string[] {
  return nomeNormalizado.split(' ').filter((p) => p.length >= 2);
}

/**
 * Score [0,1] de quão parecido o nome lido (`alvo`) é com um `candidato`.
 * Ambos devem vir JÁ NORMALIZADOS (maiúsculas, sem acento, espaços colapsados).
 *
 * Regras:
 *  - Igualdade exata → 1.
 *  - Senão, para cada palavra do alvo, pega a melhor similaridade com alguma
 *    palavra do candidato (acima do limiar); calcula a média PONDERADA dando
 *    mais peso às últimas palavras (sobrenomes).
 */
export function scoreNome(alvo: string, candidato: string): number {
  if (!alvo || !candidato) return 0;
  if (alvo === candidato) return 1;

  const tokensAlvo = palavras(alvo);
  const tokensCand = palavras(candidato);
  if (tokensAlvo.length === 0 || tokensCand.length === 0) {
    return similaridadePalavra(alvo, candidato);
  }

  let somaPesos = 0;
  let somaScore = 0;
  tokensAlvo.forEach((token, i) => {
    // Peso cresce nas últimas palavras (sobrenomes distinguem mais): 1 → 2.
    const peso = 1 + i / Math.max(1, tokensAlvo.length - 1);
    let melhor = 0;
    for (const c of tokensCand) {
      const s = similaridadePalavra(token, c);
      if (s > melhor) melhor = s;
    }
    if (melhor < LIMIAR_PALAVRA) melhor = 0; // não casou nada bom
    somaPesos += peso;
    somaScore += peso * melhor;
  });

  return somaPesos > 0 ? somaScore / somaPesos : 0;
}
