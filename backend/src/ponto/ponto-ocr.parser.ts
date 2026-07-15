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

/**
 * Como cada campo foi encontrado — usado para estimar a confiança da leitura.
 *  - ROTULO: casou pelo rótulo (`HORA:`/`DATA:`/`NOME:`) com dígitos limpos.
 *  - ROTULO_CORRIGIDO: casou pelo rótulo, mas precisou corrigir letras que o
 *    OCR trocou por dígitos (ex.: "1S:34" → "15:34") — um pouco menos seguro.
 *  - GENERICA: casou sem rótulo (varredura), mais sujeito a engano.
 *  - FALLBACK: nome deduzido pela "maior linha que parece nome" (sem rótulo).
 */
export type FonteCampo =
  | 'ROTULO'
  | 'ROTULO_CORRIGIDO'
  | 'GENERICA'
  | 'FALLBACK';

/** Confiança (0–1) por campo lido + uma confiança geral ponderada. */
export interface ConfiancaComprovante {
  nome: number;
  data: number;
  hora: number;
  /** Combinação ponderada (hora e nome pesam mais que a data). */
  geral: number;
}

export interface ComprovanteInterpretado {
  /** Texto bruto lido (para auditoria/depuração). */
  texto: string;
  /** Nome do colaborador, se identificado (em maiúsculas). */
  nome: string | null;
  /** Data da batida no formato yyyy-mm-dd, se identificada. */
  data: string | null;
  /** Hora da batida no formato HH:mm, se identificada. */
  hora: string | null;
  /** Confiança estimada da leitura, por campo e geral. */
  confianca: ConfiancaComprovante;
}

/** Resultado de uma extração: o valor e COMO ele foi encontrado. */
interface CampoExtraido {
  valor: string | null;
  fonte: FonteCampo | null;
}

// Confiança por origem do dado. Ancorado no rótulo = alto; corrigido = médio;
// varredura genérica = mais baixo; fallback do nome = baixo.
const CONFIANCA_HORA: Record<FonteCampo, number> = {
  ROTULO: 0.95,
  ROTULO_CORRIGIDO: 0.82,
  GENERICA: 0.6,
  FALLBACK: 0,
};
const CONFIANCA_DATA: Record<FonteCampo, number> = {
  ROTULO: 0.95,
  ROTULO_CORRIGIDO: 0.82,
  GENERICA: 0.55,
  FALLBACK: 0,
};
const CONFIANCA_NOME: Record<FonteCampo, number> = {
  ROTULO: 0.9,
  ROTULO_CORRIGIDO: 0.9,
  GENERICA: 0.6,
  FALLBACK: 0.5,
};

/** Arredonda para 2 casas (mantém a confiança legível). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** true se o trecho tem letras (ou seja, o OCR trocou dígito por letra). */
function precisouCorrigir(...trechos: string[]): boolean {
  return /[^0-9]/.test(trechos.join(''));
}

// "Dígito" tolerante ao OCR: além de 0-9, aceita as letras que o leitor mais
// confunde com números (O/Q/D→0, I/L→1, Z→2, S→5, G→6, B→8). Só é usada nos
// VALORES de hora/data — sempre ancorados nos rótulos HORA:/DATA: e validados
// por faixa depois —, então não vira falso positivo em CNPJ/PIS.
const D = '[0-9OQDILZSBG]';
// Hora pelo rótulo, tolerante: casa "HORA:15:34", "HORA 07H56", "HORA:1S:34"
// (S lido no lugar do 5) e até sem separador ("HORA 1534"). Aceita a etiqueta
// levemente distorcida (H0RA, HOR4).
const RE_HORA_ROTULO = new RegExp(
  `H\\s*[O0]\\s*R\\s*[A4][\\s:.=-]*(${D}{1,2})[\\s:.H=-]*(${D}{2})`,
);
// Hora genérica (só ":" ou "H" — sem ".", que apareceria em CNPJ/PIS).
const RE_HORA = /\b([01]?\d|2[0-3])[:H]([0-5]\d)\b/;
// Data pelo rótulo, tolerante a OCR: "DATA:13/07/2026", "DATA 12-07-26".
const RE_DATA_ROTULO = new RegExp(
  `[D0]\\s*[A4]\\s*T\\s*[A4][\\s:.=-]*(${D}{2})[/.\\s-](${D}{2})[/.\\s-](${D}{2,4})`,
);
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

/**
 * Corrige as trocas mais comuns do OCR em um trecho que DEVERIA ser numérico
 * (valor de hora/data já ancorado no rótulo). Letras não previstas ficam como
 * estão e reprovam na validação de faixa — evitando falso positivo.
 */
function corrigirDigitos(s: string): string {
  return s
    .replace(/[OQD]/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/Z/g, '2')
    .replace(/S/g, '5')
    .replace(/G/g, '6')
    .replace(/B/g, '8');
}

/** Monta "HH:mm" validando faixa (00–23 / 00–59); null se implausível. */
function montarHora(hh: string, mm: string): string | null {
  const h = Number(hh);
  const m = Number(mm);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Monta yyyy-mm-dd a partir de dd, mm, aa(aa); null se implausível. */
function montarDataDeGrupos(dd: string, mm: string, aa: string): string | null {
  const dia = Number(dd);
  const mes = Number(mm);
  let ano = Number(aa);
  if (
    !Number.isInteger(dia) ||
    !Number.isInteger(mes) ||
    !Number.isInteger(ano)
  ) {
    return null;
  }
  if (aa.length === 2) ano += 2000;
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Monta a data a partir de um match [_, dd, mm, aa(aa)] (dígitos puros). */
function montarData(m: RegExpMatchArray): string | null {
  return montarDataDeGrupos(m[1], m[2], m[3]);
}

/** true se a linha contém alguma palavra de cabeçalho. */
function temCabecalho(linhaNormalizada: string): boolean {
  return linhaNormalizada.split(' ').some((t) => CABECALHOS.includes(t));
}

/**
 * Só letras (com acento) e espaços, sem cabeçalho, e com pelo menos DUAS
 * palavras "de verdade" (3+ letras). Isso evita que ruído do OCR (ex.: "WINS
 * NT", "VA RAL") seja mostrado como se fosse um nome — nesses casos é melhor
 * não sugerir nada e deixar o usuário buscar.
 */
function pareceNome(linha: string): boolean {
  const limpa = linha.trim();
  if (limpa.length < 6) return false;
  if (!/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]+$/.test(limpa)) return false;
  const palavras = limpa.split(/\s+/).filter((p) => p.length >= 3);
  if (palavras.length < 2) return false;
  return !temCabecalho(normalizarTexto(limpa));
}

/**
 * Extrai a hora (HH:mm) e diz COMO a encontrou. Primeiro pelo rótulo `HORA:`
 * (tolerante a OCR: corrige letras trocadas por dígitos e aceita separador
 * ausente), depois genérica.
 */
export function extrairHoraDetalhe(texto: string): CampoExtraido {
  const norm = normalizarTexto(texto);
  const rot = RE_HORA_ROTULO.exec(norm);
  if (rot) {
    const h = montarHora(corrigirDigitos(rot[1]), corrigirDigitos(rot[2]));
    if (h) {
      const fonte = precisouCorrigir(rot[1], rot[2])
        ? 'ROTULO_CORRIGIDO'
        : 'ROTULO';
      return { valor: h, fonte };
    }
  }
  const g = RE_HORA.exec(norm);
  if (g) {
    const h = montarHora(g[1], g[2]);
    if (h) return { valor: h, fonte: 'GENERICA' };
  }
  return { valor: null, fonte: null };
}

/** Extrai a hora (HH:mm). Mantido para compatibilidade. */
export function extrairHora(texto: string): string | null {
  return extrairHoraDetalhe(texto).valor;
}

/**
 * Extrai a data (yyyy-mm-dd) e diz COMO a encontrou: primeiro pelo rótulo
 * `DATA:`, depois a 1ª válida por varredura.
 */
export function extrairDataDetalhe(texto: string): CampoExtraido {
  const norm = normalizarTexto(texto);
  const rot = RE_DATA_ROTULO.exec(norm);
  if (rot) {
    const d = montarDataDeGrupos(
      corrigirDigitos(rot[1]),
      corrigirDigitos(rot[2]),
      corrigirDigitos(rot[3]),
    );
    if (d) {
      const fonte = precisouCorrigir(rot[1], rot[2], rot[3])
        ? 'ROTULO_CORRIGIDO'
        : 'ROTULO';
      return { valor: d, fonte };
    }
  }
  for (const m of norm.matchAll(RE_DATA)) {
    const d = montarData(m);
    if (d) return { valor: d, fonte: 'GENERICA' };
  }
  return { valor: null, fonte: null };
}

/** Extrai a data (yyyy-mm-dd). Mantido para compatibilidade. */
export function extrairData(texto: string): string | null {
  return extrairDataDetalhe(texto).valor;
}

/**
 * Extrai o nome do trabalhador e diz COMO o encontrou. Usa o rótulo `NOME:`/
 * `FUNCIONÁRIO:` e junta a continuação quando o nome quebra de linha (ex.:
 * "...RE" + "YES" = "REYES"). Se não houver rótulo, cai no FALLBACK (a maior
 * linha que "parece nome").
 */
export function extrairNomeDetalhe(texto: string): CampoExtraido {
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
    if (pareceNome(nome)) return { valor: nome, fonte: 'ROTULO' };
  }

  // Fallback: a maior linha que "parece nome".
  const candidatas = linhas.filter(pareceNome);
  if (candidatas.length === 0) return { valor: null, fonte: null };
  candidatas.sort((a, b) => b.length - a.length);
  return { valor: normalizarTexto(candidatas[0]), fonte: 'FALLBACK' };
}

/** Extrai o nome do trabalhador. Mantido para compatibilidade. */
export function extrairNome(texto: string): string | null {
  return extrairNomeDetalhe(texto).valor;
}

/** Confiança de um campo a partir da fonte (0 quando não foi encontrado). */
function confiancaDe(
  tabela: Record<FonteCampo, number>,
  fonte: FonteCampo | null,
): number {
  return fonte ? tabela[fonte] : 0;
}

/** Interpreta o comprovante: nome + data + hora + confiança da leitura. */
export function interpretarComprovante(texto: string): ComprovanteInterpretado {
  const hora = extrairHoraDetalhe(texto);
  const data = extrairDataDetalhe(texto);
  const nome = extrairNomeDetalhe(texto);

  const cHora = confiancaDe(CONFIANCA_HORA, hora.fonte);
  const cData = confiancaDe(CONFIANCA_DATA, data.fonte);
  const cNome = confiancaDe(CONFIANCA_NOME, nome.fonte);
  // Hora e nome são os mais importantes para registrar a batida certa; a data
  // pesa menos (quase sempre é hoje e o usuário vê o dia selecionado).
  const geral = round2(cHora * 0.45 + cNome * 0.4 + cData * 0.15);

  return {
    texto,
    nome: nome.valor,
    data: data.valor,
    hora: hora.valor,
    confianca: { nome: cNome, data: cData, hora: cHora, geral },
  };
}
