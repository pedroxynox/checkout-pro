/**
 * Interpretação do texto do comprovante do relógio de ponto — Fase B.
 *
 * Função pura (sem I/O), fácil de testar: recebe o texto extraído (por OCR no
 * app Android com ML Kit, ou pelo OCR do nosso servidor na web) e tenta achar
 * o **nome**, a **data** e a **hora** da batida.
 *
 * Ajustado ao formato real do relógio (ex.: IDCLASS BIO PROX — "COMPROVANTE DE
 * REGISTRO DE PONTO DO TRABALHADOR"), que traz rótulos `NOME:`, `DATA:` e
 * `HORA:`. Dois cuidados importantes desse formato:
 *  - o **nome** pode ser quebrado em duas linhas (ex.: "...CASTELLANO RE" +
 *    "YES" = "REYES"), então juntamos a continuação;
 *  - há muitos números com pontos (CNPJ, PIS), então a data/hora são buscadas
 *    prioritariamente **pelos rótulos** `DATA:`/`HORA:` para não confundir.
 * A data e a hora são determinísticas; o nome é heurístico (o usuário confirma).
 */

export interface ComprovanteInterpretado {
  /** Texto bruto lido (para auditoria/depuração). */
  texto: string;
  /** Nome do colaborador, se identificado (em maiúsculas). */
  nome: string | null;
  /** Data da batida no formato yyyy-mm-dd, se identificada. */
  data: string | null;
  /** Hora da batida no formato HH:mm, se identificada. */
  hora: string | null;
}

// Hora pelo rótulo (após normalizar, "HORA:13:18" ou "HORA 07:56").
const RE_HORA_ROTULO = /HORA\s*:?\s*([01]?\d|2[0-3])[:H]([0-5]\d)/;
// Hora genérica (só ":" ou "H" — sem ".", que apareceria em CNPJ/PIS).
const RE_HORA = /\b([01]?\d|2[0-3])[:H]([0-5]\d)\b/;
// Data pelo rótulo ("DATA:10/07/2026" ou "DATA 12/07/2026").
const RE_DATA_ROTULO = /DATA\s*:?\s*(\d{2})\/(\d{2})\/(\d{2,4})/;
// Data genérica (fallback), varrida com validação para pular CNPJ etc.
const RE_DATA = /(\d{2})[/.\-](\d{2})[/.\-](\d{2,4})/g;
// Rótulos que antecedem o nome do trabalhador.
const RE_ROTULO_NOME = /^(?:NOME|FUNCIONARIO|COLABORADOR)\s*:?\s*(.+)$/;

// Palavras de cabeçalho que NÃO são o nome do trabalhador.
const CABECALHOS = [
  'CNPJ',
  'CPF',
  'PIS',
  'NSR',
  'CEI',
  'CAEPF',
  'NREP',
  'MODELO',
  'IDCLASS',
  'BIO',
  'PROX',
  'RSOCIAL',
  'RAZAO',
  'SOCIAL',
  'LOCAL',
  'BAIRRO',
  'EMPREGADOR',
  'EMPRESA',
  'COMPROVANTE',
  'REGISTRO',
  'ELETRONICO',
  'TRABALHADOR',
  'PONTO',
  'INSCRICAO',
  'HORA',
  'DATA',
  'NUMERO',
  'LTDA',
  'EPP',
];

/** Remove acentos, deixa em maiúsculas e colapsa espaços. */
export function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Monta yyyy-mm-dd a partir de [_, dd, mm, aa(aa)] se for uma data plausível. */
function montarData(m: RegExpMatchArray): string | null {
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  let ano = Number(m[3]);
  if (m[3].length === 2) ano += 2000;
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** true se a linha contém alguma palavra de cabeçalho. */
function temCabecalho(linhaNormalizada: string): boolean {
  return linhaNormalizada.split(' ').some((t) => CABECALHOS.includes(t));
}

/** Só letras (com acento) e espaços, 2+ palavras, sem cabeçalho. */
function pareceNome(linha: string): boolean {
  const limpa = linha.trim();
  if (limpa.length < 5) return false;
  if (!/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]+$/.test(limpa)) return false;
  const palavras = limpa.split(/\s+/).filter((p) => p.length >= 2);
  if (palavras.length < 2) return false;
  return !temCabecalho(normalizarTexto(limpa));
}

/** Extrai a hora (HH:mm): primeiro pelo rótulo `HORA:`, depois genérica. */
export function extrairHora(texto: string): string | null {
  const norm = normalizarTexto(texto);
  const m = RE_HORA_ROTULO.exec(norm) ?? RE_HORA.exec(norm);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/** Extrai a data (yyyy-mm-dd): primeiro pelo rótulo `DATA:`, depois a 1ª válida. */
export function extrairData(texto: string): string | null {
  const norm = normalizarTexto(texto);
  const rot = RE_DATA_ROTULO.exec(norm);
  if (rot) {
    const d = montarData(rot);
    if (d) return d;
  }
  for (const m of norm.matchAll(RE_DATA)) {
    const d = montarData(m);
    if (d) return d;
  }
  return null;
}

/**
 * Extrai o nome do trabalhador. Usa o rótulo `NOME:`/`FUNCIONÁRIO:` e junta a
 * continuação quando o nome quebra de linha (ex.: "...RE" + "YES" = "REYES").
 */
export function extrairNome(texto: string): string | null {
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (let i = 0; i < linhas.length; i++) {
    const m = RE_ROTULO_NOME.exec(normalizarTexto(linhas[i]));
    if (!m || !m[1]) continue;

    let nome = m[1].trim();
    // Continuação: linhas seguintes só com letras (nome quebrado no meio da
    // palavra), até chegar num rótulo/dado numérico (ex.: "PIS:...").
    for (let j = i + 1; j < linhas.length; j++) {
      const cont = normalizarTexto(linhas[j]);
      if (!cont || /[:0-9]/.test(cont)) break;
      if (!/^[A-Z ]+$/.test(cont) || temCabecalho(cont)) break;
      nome += cont; // junta sem espaço (o relógio quebra no meio da palavra)
      if (nome.length > 60) break;
    }
    nome = normalizarTexto(nome);
    if (pareceNome(nome)) return nome;
  }

  // Fallback: a maior linha que "parece nome".
  const candidatas = linhas.filter(pareceNome);
  if (candidatas.length === 0) return null;
  candidatas.sort((a, b) => b.length - a.length);
  return normalizarTexto(candidatas[0]);
}

/** Interpreta o comprovante: nome + data + hora. */
export function interpretarComprovante(texto: string): ComprovanteInterpretado {
  return {
    texto,
    nome: extrairNome(texto),
    data: extrairData(texto),
    hora: extrairHora(texto),
  };
}
