/**
 * Parser PURO do arquivo .txt de produtos pesados (balança).
 *
 * O arquivo é exportado do ERP com TODOS os setores juntos, colunas separadas
 * por TABULAÇÃO, no layout:
 *
 *   SEQPRODUTO | DESCCOMPLETA | CODACESSO | CATEGORIA_NV2 | CATEGORIA_NV3
 *
 * Interessam quatro colunas: o nome (DESCCOMPLETA), o CÓDIGO DE BALANÇA
 * (CODACESSO — o que o operador digita), o setor (CATEGORIA_NV2) e o tipo
 * (CATEGORIA_NV3). A primeira coluna (SEQPRODUTO, id interno) é ignorada.
 *
 * O parser tolera:
 *  - presença ou ausência da linha de cabeçalho (detecta pelos nomes das
 *    colunas e, quando existe, mapeia os índices por nome);
 *  - separador por tabulação (padrão) ou ';';
 *  - linhas em branco e espaços sobrando.
 *
 * É determinístico e sem dependências de infraestrutura (Nest/Prisma), portanto
 * testável isoladamente (ADR 0003 — domínio puro).
 */

/** Uma linha de produto lida do arquivo (ainda sem o nome normalizado). */
export interface LinhaProdutoPesado {
  /** CODACESSO — código de balança digitado pelo operador. */
  codigo: string;
  /** DESCCOMPLETA — nome do produto. */
  nome: string;
  /** CATEGORIA_NV2 — setor (ACOUGUE, PADARIA, P.A.S., FVL, ...). */
  categoria: string;
  /** CATEGORIA_NV3 — tipo do produto (opcional). */
  tipo: string | null;
}

/** Minúsculas e sem acentos — usado na detecção de cabeçalho e na busca. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Detecta o separador mais provável da linha (tabulação por padrão). */
function detectarSeparador(linha: string): string {
  if (linha.includes('\t')) return '\t';
  if (linha.includes(';')) return ';';
  return '\t';
}

/**
 * Lê o conteúdo do arquivo e devolve a lista de produtos. Linhas inválidas
 * (sem nome, sem código ou sem setor) são descartadas silenciosamente.
 */
export function parseProdutosPesados(conteudo: string): LinhaProdutoPesado[] {
  const linhas = conteudo
    .split(/\r?\n/)
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim().length > 0);
  if (linhas.length === 0) {
    return [];
  }

  const separador = detectarSeparador(linhas[0]);

  // Índices padrão do layout do ERP (usados quando não há cabeçalho).
  let idxNome = 1;
  let idxCodigo = 2;
  let idxCategoria = 3;
  let idxTipo = 4;
  let inicio = 0;

  const colunasCabecalho = linhas[0]
    .split(separador)
    .map((c) => normalizarTexto(c));
  const temCabecalho = colunasCabecalho.some(
    (c) =>
      c.includes('codacesso') ||
      c.includes('desccompleta') ||
      c.includes('seqproduto') ||
      c.includes('categoria'),
  );
  if (temCabecalho) {
    const acha = (pred: (c: string) => boolean): number =>
      colunasCabecalho.findIndex(pred);
    const fNome = acha(
      (c) =>
        c.includes('desccompleta') || c.includes('descricao') || c === 'nome',
    );
    const fCodigo = acha((c) => c.includes('codacesso') || c === 'codigo');
    const fCategoria = acha(
      (c) =>
        c.includes('categoria_nv2') ||
        (c.includes('categoria') && !c.includes('nv3')),
    );
    const fTipo = acha((c) => c.includes('categoria_nv3'));
    if (fNome >= 0) idxNome = fNome;
    if (fCodigo >= 0) idxCodigo = fCodigo;
    if (fCategoria >= 0) idxCategoria = fCategoria;
    if (fTipo >= 0) idxTipo = fTipo;
    inicio = 1;
  }

  const resultado: LinhaProdutoPesado[] = [];
  for (let i = inicio; i < linhas.length; i++) {
    const cols = linhas[i].split(separador);
    const nome = (cols[idxNome] ?? '').trim();
    const codigo = (cols[idxCodigo] ?? '').trim();
    // Setor em MAIÚSCULAS para agrupar de forma consistente.
    const categoria = (cols[idxCategoria] ?? '').trim().toUpperCase();
    const tipoBruto = (cols[idxTipo] ?? '').trim();
    if (!nome || !codigo || !categoria) {
      continue;
    }
    resultado.push({ codigo, nome, categoria, tipo: tipoBruto || null });
  }
  return resultado;
}
