/**
 * Lógica de domínio pura do Cadastro de Colaboradores.
 *
 * Normalização dos identificadores para comparação/armazenamento consistente:
 * - matrícula: sem espaços nas pontas (mantém zeros à esquerda, é um código).
 * - login/código de operador: minúsculo e sem espaços (case-insensitive).
 */

/** Normaliza uma matrícula (trim; preserva o formato do código). */
export function normalizarMatricula(valor: string): string {
  return valor.trim();
}

/** Normaliza um login/código de operador (minúsculo, sem espaços nas pontas). */
export function normalizarLogin(valor: string): string {
  return valor.trim().toLowerCase();
}
