/**
 * Lê o arquivo .txt (bloc de notas) de vendas por hora enviado diariamente.
 *
 * Como o layout pode variar, o parser localiza as colunas pelo cabeçalho:
 * uma coluna de HORA e uma de VALOR (venda/faturamento/total). Exemplos
 * aceitos de hora: "8", "08", "08:00", "08:00:00", "08h", "08 - 09".
 * O valor usa vírgula decimal (ex.: "1.234,56") e é lido por `parseValor`.
 *
 * Se não houver cabeçalho reconhecível, assume duas colunas: HORA;VALOR.
 */
import { parseValor } from '../importacoes/importacoes.parser';

export interface LinhaVendaHora {
  hora: number;
  valor: number;
}

/** Extrai a hora (0..23) de um texto como "08:00:00" ou "8h". */
function parseHora(bruto: string): number {
  const m = bruto.match(/(\d{1,2})/);
  if (!m) {
    return NaN;
  }
  const h = parseInt(m[1], 10);
  return h >= 0 && h <= 23 ? h : NaN;
}

export function parseVendasHora(conteudo: string): LinhaVendaHora[] {
  const linhas = conteudo
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (linhas.length === 0) {
    return [];
  }

  // Detecta o separador mais provável (';' ou tab ou ',').
  const separador = linhas[0].includes(';')
    ? ';'
    : linhas[0].includes('\t')
      ? '\t'
      : ',';

  let idxHora = 0;
  let idxValor = 1;
  let inicio = 0;

  const primeira = linhas[0];
  const temCabecalho = /(hora|valor|venda|faturamento|total)/i.test(primeira);
  if (temCabecalho) {
    const colunas = primeira.split(separador).map((c) => c.trim().toLowerCase());
    const fHora = colunas.findIndex((c) => c.includes('hora'));
    const fValor = colunas.findIndex(
      (c) =>
        c.includes('valor') ||
        c.includes('venda') ||
        c.includes('faturamento') ||
        c.includes('total'),
    );
    if (fHora >= 0) idxHora = fHora;
    if (fValor >= 0) idxValor = fValor;
    inicio = 1;
  }

  // Soma por hora (caso o arquivo traga mais de uma linha por hora).
  const porHora = new Map<number, number>();
  for (let i = inicio; i < linhas.length; i++) {
    const colunas = linhas[i].split(separador);
    const hora = parseHora((colunas[idxHora] ?? '').trim());
    const valor = parseValor(colunas[idxValor]);
    if (!Number.isNaN(hora) && !Number.isNaN(valor)) {
      porHora.set(hora, (porHora.get(hora) ?? 0) + valor);
    }
  }

  return Array.from(porHora.entries())
    .map(([hora, valor]) => ({ hora, valor }))
    .sort((a, b) => a.hora - b.hora);
}
