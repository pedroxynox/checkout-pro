/**
 * Reconstrução do texto do comprovante a partir da GEOMETRIA do OCR.
 *
 * O ML Kit devolve, além do texto, ONDE cada linha está na imagem (posição e
 * tamanho). Quando a foto sai torta ou o texto vem fora de ordem, o `.text`
 * "cru" pode embaralhar rótulos e valores (ex.: separar "HORA:" do "13:18").
 *
 * Aqui reagrupamos as linhas por FAIXA horizontal (mesma altura ≈ mesma linha
 * do papel) e, dentro de cada faixa, ordenamos da esquerda para a direita.
 * Assim o rótulo e o valor ficam na MESMA linha do texto, ajudando o
 * interpretador do servidor a ancorar `HORA:`/`DATA:`/`NOME:` corretamente.
 *
 * Função pura (sem dependências nativas) — fácil de testar.
 */

/** Uma linha reconhecida pelo OCR, com sua posição/tamanho na imagem. */
export interface LinhaOcr {
  texto: string;
  /** Coordenada horizontal do canto (esquerda). */
  x: number;
  /** Coordenada vertical do canto (topo). */
  y: number;
  /** Altura da linha (usada para agrupar por faixa). */
  altura: number;
}

/**
 * Duas linhas estão na MESMA faixa quando seus centros verticais estão a menos
 * de ~60% da altura típica de distância — tolera pequenas variações de
 * alinhamento sem juntar linhas diferentes.
 */
function mesmaFaixa(centroA: number, centroB: number, altura: number): boolean {
  const tolerancia = Math.max(1, altura * 0.6);
  return Math.abs(centroA - centroB) <= tolerancia;
}

/**
 * Monta o texto (várias linhas) a partir das linhas posicionadas do OCR.
 * Agrupa por faixa horizontal (de cima para baixo) e ordena cada faixa da
 * esquerda para a direita. Retorna string vazia se não houver linhas úteis.
 */
export function montarTextoDeLinhas(linhas: LinhaOcr[]): string {
  const uteis = linhas.filter((l) => l.texto && l.texto.trim());
  if (uteis.length === 0) return '';

  // Ordena por topo (y) para varrer de cima para baixo.
  const ordenadas = [...uteis].sort((a, b) => a.y - b.y);

  const faixas: { centro: number; altura: number; itens: LinhaOcr[] }[] = [];
  for (const linha of ordenadas) {
    const centro = linha.y + linha.altura / 2;
    const faixa = faixas.find((f) => mesmaFaixa(f.centro, centro, f.altura));
    if (faixa) {
      faixa.itens.push(linha);
      // Média móvel simples do centro/altura, para faixas mais estáveis.
      faixa.centro = (faixa.centro + centro) / 2;
      faixa.altura = Math.max(faixa.altura, linha.altura);
    } else {
      faixas.push({ centro, altura: linha.altura, itens: [linha] });
    }
  }

  return faixas
    .map((f) =>
      f.itens
        .sort((a, b) => a.x - b.x)
        .map((l) => l.texto.trim())
        .join(' '),
    )
    .join('\n');
}

/** Forma tolerante de um retângulo do ML Kit (varia entre versões/plataformas). */
interface RetanguloMLKit {
  left?: number;
  top?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  origin?: { x?: number; y?: number };
  size?: { width?: number; height?: number };
}

/** Bloco/linha do ML Kit (só o que usamos), tolerante a variações de forma. */
interface ItemMLKit {
  text?: string;
  frame?: RetanguloMLKit | null;
  boundingBox?: RetanguloMLKit | null;
  lines?: ItemMLKit[];
}

/** Lê x/y/altura de um retângulo do ML Kit de forma tolerante. */
function lerRetangulo(
  r: RetanguloMLKit | null | undefined,
): { x: number; y: number; altura: number } | null {
  if (!r) return null;
  const x = r.left ?? r.x ?? r.origin?.x;
  const y = r.top ?? r.y ?? r.origin?.y;
  const altura = r.height ?? r.size?.height;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  return { x, y, altura: typeof altura === 'number' ? altura : 1 };
}

/**
 * Converte o resultado do ML Kit em texto reconstruído pela geometria. Usa as
 * LINHAS (mais finas que os blocos). Se a geometria não estiver disponível,
 * devolve null para o chamador cair no `.text` cru.
 */
export function textoPelaGeometria(resultado: {
  blocks?: ItemMLKit[];
}): string | null {
  const blocos = resultado?.blocks;
  if (!blocos || blocos.length === 0) return null;

  const linhas: LinhaOcr[] = [];
  for (const bloco of blocos) {
    const itens =
      bloco.lines && bloco.lines.length > 0 ? bloco.lines : [bloco];
    for (const item of itens) {
      const texto = item.text?.trim();
      if (!texto) continue;
      const ret = lerRetangulo(item.frame ?? item.boundingBox);
      if (!ret) continue;
      linhas.push({ texto, x: ret.x, y: ret.y, altura: ret.altura });
    }
  }

  if (linhas.length === 0) return null;
  return montarTextoDeLinhas(linhas);
}
