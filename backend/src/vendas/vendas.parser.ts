/**
 * Lê o arquivo .txt (bloc de notas) de vendas por hora enviado diariamente.
 *
 * O relatório tem muitas colunas separadas por ';'. O parser localiza:
 *  - a HORA, que vem dentro da coluna "Empresa : Hora"
 *    (ex.: "35-STOK 35 : 06:00 a 06:59" -> hora 6);
 *  - o VALOR LÍQUIDO, preferindo a coluna que tem "liq" + "valor"
 *    (ex.: "Valor Total Liq"); se não houver, usa a coluna de valor/venda.
 *
 * A linha de TOTAL é ignorada (o total é a soma das horas). O valor usa
 * vírgula decimal (ex.: "1.234,56") e é lido por `parseValor`.
 */
import { parseValor } from '../importacoes/importacoes.parser';

export interface LinhaVendaHora {
  hora: number;
  valor: number;
}

/**
 * Extrai a hora (0..23). Prioriza o padrão de horário "HH:MM" (ex.: "06:00 a
 * 06:59" -> 6); aceita "8h"; por fim, uma célula que seja só um número.
 */
function parseHora(bruto: string): number {
  const texto = bruto.trim();
  const tempo = texto.match(/(\d{1,2}):\d{2}/);
  if (tempo) {
    const h = parseInt(tempo[1], 10);
    return h >= 0 && h <= 23 ? h : NaN;
  }
  const comH = texto.match(/(\d{1,2})\s*h/i);
  if (comH) {
    const h = parseInt(comH[1], 10);
    return h >= 0 && h <= 23 ? h : NaN;
  }
  if (/^\d{1,2}$/.test(texto)) {
    const h = parseInt(texto, 10);
    return h >= 0 && h <= 23 ? h : NaN;
  }
  return NaN;
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
  const temCabecalho = /(hora|valor|venda|faturamento|total|liq)/i.test(
    primeira,
  );
  if (temCabecalho) {
    const colunas = primeira
      .split(separador)
      .map((c) => c.trim().toLowerCase());
    const fHora = colunas.findIndex((c) => c.includes('hora'));
    // Preferir a venda líquida ("liq" + "valor"); senão valor/venda/total.
    let fValor = colunas.findIndex(
      (c) => c.includes('liq') && c.includes('valor'),
    );
    if (fValor < 0) {
      fValor = colunas.findIndex(
        (c) =>
          c.includes('valor') ||
          c.includes('venda') ||
          c.includes('faturamento') ||
          c.includes('total'),
      );
    }
    if (fHora >= 0) idxHora = fHora;
    if (fValor >= 0) idxValor = fValor;
    inicio = 1;
  }

  // Soma por hora (caso o arquivo traga mais de uma linha por hora).
  const porHora = new Map<number, number>();
  for (let i = inicio; i < linhas.length; i++) {
    const colunas = linhas[i].split(separador);
    const celulaHora = (colunas[idxHora] ?? '').trim();
    // Ignora a linha de totais/resumo.
    if (/total/i.test(celulaHora)) {
      continue;
    }
    const hora = parseHora(celulaHora);
    const valor = parseValor(colunas[idxValor]);
    if (!Number.isNaN(hora) && !Number.isNaN(valor)) {
      porHora.set(hora, (porHora.get(hora) ?? 0) + valor);
    }
  }

  return Array.from(porHora.entries())
    .map(([hora, valor]) => ({ hora, valor }))
    .sort((a, b) => a.hora - b.hora);
}
