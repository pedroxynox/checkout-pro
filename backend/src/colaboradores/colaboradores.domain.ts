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


/**
 * A função dá acesso ao app? (ADR 0023)
 *
 * Operador **não entra no app**: ele não tem login. Fiscal, supervisor e gestor
 * têm. É a mesma regra que `perfilDaFuncao` já usava para decidir se cria uma
 * conta na promoção — só que ela vivia privada dentro do serviço de cadastro, e
 * por isso o **login** nunca a consultava.
 *
 * O efeito de ela não ser consultada: descer um fiscal a operador não tirava o
 * acesso dele. `perfilDaFuncao('OPERADOR')` é nulo, a atualização do usuário só
 * atribui o perfil quando há um perfil novo, e o antigo (`FISCAL`) ficava. A
 * pessoa seguia entrando no app com os poderes que já não lhe cabiam.
 *
 * Vive aqui, no domínio puro, para que o módulo de Acessos possa usá-la sem
 * depender do serviço de cadastro — que depende dele, e fecharia um ciclo.
 */
export function funcaoTemAcessoAoApp(funcao: string): boolean {
  return funcao === 'FISCAL' || funcao === 'SUPERVISOR' || funcao === 'GESTOR';
}
