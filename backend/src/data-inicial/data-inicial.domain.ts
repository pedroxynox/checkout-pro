/**
 * Lógica de domínio **pura** do Modulo_DataInicial.
 *
 * Estas funções não dependem do Nest, do Prisma nem de qualquer infraestrutura.
 * Concentram a regra de "data ≥ Data_Inicial_Sistema", de modo que possam ser
 * testadas de forma determinística (incluindo por testes de propriedade) sem
 * banco de dados.
 *
 * Requisitos: 6.1 (rejeitar data anterior), 6.2 (aceitar data igual/posterior),
 * 8.1 (domínio puro testável).
 */

/**
 * Início do dia (UTC) expresso em milissegundos desde a época — normaliza uma
 * data para o começo do seu dia, permitindo comparar POR DIA (e não por hora),
 * independentemente do horário informado.
 */
export function inicioDoDiaUTC(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Verdadeiro se `data` é IGUAL ou POSTERIOR à `dataInicial`, comparando por dia
 * (UTC). Fronteira: `data == dataInicial` é PERMITIDA; um dia antes é REJEITADA.
 *
 * Requisitos 6.1, 6.2.
 */
export function dataPermitida(data: Date, dataInicial: Date): boolean {
  return inicioDoDiaUTC(data) >= inicioDoDiaUTC(dataInicial);
}
