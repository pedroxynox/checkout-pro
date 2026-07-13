/**
 * Interpretação do texto do comprovante do relógio de ponto — Fase B.
 *
 * Função pura (sem I/O), fácil de testar: recebe o texto extraído (por OCR no
 * app Android com ML Kit, ou pelo OCR do nosso servidor na web) e tenta achar
 * o **nome**, a **data** e a **hora** da batida. A hora e a data são
 * determinísticas (regex); o nome é uma heurística tolerante — o usuário sempre
 * confirma/corrige, e o nome é apenas usado para sugerir o colaborador.
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

// Hora: 07:56, 7:56, 07h56, 07.56 ...
const RE_HORA = /\b([01]?\d|2[0-3])[:hH.]([0-5]\d)\b/;
// Data: 12/07/2026, 12-07-26, 12.07.2026 ...
const RE_DATA = /\b(\d{2})[/.\-](\d{2})[/.\-](\d{2,4})\b/;
// Rótulos que costumam anteceder o nome do funcionário no comprovante.
const RE_ROTULO_NOME = /(NOME|FUNCIONARIO|COLABORADOR)\s*:?\s*(.+)/;
// Palavras de cabeçalho que NÃO são o nome do funcionário.
const CABECALHOS = [
  'CNPJ',
  'CPF',
  'PIS',
  'NSR',
  'CEI',
  'CAEPF',
  'EMPREGADOR',
  'EMPRESA',
  'RAZAO',
  'SOCIAL',
  'COMPROVANTE',
  'REGISTRO',
  'ELETRONICO',
  'PONTO',
  'INSCRICAO',
  'HORA',
  'DATA',
  'NUMERO',
  'LTDA',
  'ME',
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

/** Só letras (com acento) e espaços — candidato a nome de pessoa. */
function pareceNome(linha: string): boolean {
  const limpa = linha.trim();
  if (limpa.length < 5) return false;
  if (!/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.]+$/.test(limpa)) return false;
  const palavras = limpa.split(/\s+/).filter((p) => p.length >= 2);
  if (palavras.length < 2) return false;
  // Não pode ser uma linha de cabeçalho (empresa, rótulos etc.).
  const norm = normalizarTexto(limpa);
  const tokens = norm.split(' ');
  const cabecalho = tokens.filter((t) => CABECALHOS.includes(t)).length;
  return cabecalho === 0;
}

/** Extrai a hora (HH:mm) do texto, se houver. */
export function extrairHora(texto: string): string | null {
  const m = RE_HORA.exec(texto);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/** Extrai a data (yyyy-mm-dd) do texto, se houver e for plausível. */
export function extrairData(texto: string): string | null {
  const m = RE_DATA.exec(texto);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  let ano = Number(m[3]);
  if (m[3].length === 2) ano += 2000;
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  const dd = String(dia).padStart(2, '0');
  const mm = String(mes).padStart(2, '0');
  return `${ano}-${mm}-${dd}`;
}

/** Extrai o nome do colaborador (heurística tolerante). */
export function extrairNome(texto: string): string | null {
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // 1) Linha com rótulo explícito ("Nome: ...", "Funcionário: ...").
  for (const linha of linhas) {
    const m = RE_ROTULO_NOME.exec(normalizarTexto(linha));
    if (m && m[2] && pareceNome(m[2])) {
      return normalizarTexto(m[2]);
    }
  }

  // 2) Sem rótulo: a maior linha que "parece nome" (2+ palavras, sem cabeçalho).
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
