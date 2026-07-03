/**
 * Conversão de valores monetários em R$ do Modulo_Importacoes.
 *
 * O fluxo ANTIGO de leitura de arquivos CSV/XLSX foi removido (código morto e
 * dependências vulneráveis). Deste parser resta apenas `parseValor`, a função
 * de conversão de valores monetários, reaproveitada pelos parsers ATUAIS de
 * arrecadação e de vendas.
 */

/**
 * Converte um valor monetário textual em número de reais. Aceita tanto o
 * formato brasileiro ("1.234,56") quanto o formato com ponto decimal
 * ("1234.56"). Retorna `NaN` quando não é possível interpretar.
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
