/**
 * Arredonda para 2 casas decimais (valores monetários/percentuais). Fonte única
 * — antes esta função estava duplicada em vários serviços.
 */
export function arredondar(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Converte um valor monetário textual em número de reais. Aceita tanto o
 * formato brasileiro ("1.234,56") quanto o formato com ponto decimal
 * ("1234.56"). Retorna `NaN` quando não é possível interpretar.
 *
 * Reaproveitada pelos parsers de arrecadação e de vendas. (Antes vivia em
 * `importacoes/importacoes.parser.ts`, único resquício do fluxo ANTIGO de
 * importação CSV/XLSX — já removido.)
 */
export function parseValor(bruto: unknown): number {
  if (typeof bruto === 'number') {
    return bruto;
  }
  if (bruto === null || bruto === undefined) {
    return NaN;
  }
  let texto = String(bruto).trim();
  if (texto === '') {
    return NaN;
  }
  // Remove símbolo de moeda e espaços.
  texto = texto.replace(/r\$\s*/i, '').replace(/\s/g, '');
  // Formato brasileiro: vírgula como separador decimal.
  if (texto.includes(',')) {
    texto = texto.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(texto);
  return Number.isNaN(n) ? NaN : n;
}
