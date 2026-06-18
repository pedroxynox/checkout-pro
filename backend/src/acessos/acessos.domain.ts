/**
 * Lógica de domínio **pura** do Modulo_Acessos.
 *
 * Estas funções não dependem do Nest, do banco de dados, de bcrypt ou de JWT.
 * Elas concentram as decisões de autenticação, autorização e unicidade de
 * login, de modo que possam ser testadas de forma determinística (incluindo
 * por testes de propriedade) sem qualquer infraestrutura.
 *
 * Requisitos: 7.1 (login individual e exclusivo) e 7.2 (perfis de acesso).
 */

export type Perfil = 'GERENTE' | 'FISCAL';

/**
 * Conjunto de funcionalidades **operacionais** liberadas ao perfil FISCAL
 * (Requisito 7.2.3). O gerente possui acesso total (Requisito 7.2.2); qualquer
 * funcionalidade fora deste conjunto é considerada restrita ao gerente
 * (Requisito 7.2.4).
 *
 * A lista reflete as áreas operacionais do produto que um fiscal utiliza no
 * dia a dia (importações, indicadores/painel de vendas, lote APAE, insumos,
 * fiscais/escala, checklist e notificações). Operações administrativas —
 * cadastro de operadores, gestão de ausências, configuração de metas, cadastro
 * de escala e gestão de acessos — permanecem exclusivas do gerente.
 */
export const FUNCIONALIDADES_FISCAL: readonly string[] = Object.freeze([
  'IMPORTACOES',
  'INDICADORES_VISUALIZAR',
  'PAINEL_VENDAS_VISUALIZAR',
  'LOTE_APAE',
  'INSUMOS',
  'FISCAIS_STATUS',
  'ESCALA_VISUALIZAR',
  'CHECKLIST',
  'NOTIFICACOES',
]);

const FUNCIONALIDADES_FISCAL_SET = new Set<string>(FUNCIONALIDADES_FISCAL);

/**
 * Decide, de forma pura, se um perfil está autorizado a usar uma
 * funcionalidade (Requisito 7.2).
 *
 * - GERENTE: sempre autorizado (acesso total) — Req 7.2.2.
 * - FISCAL: autorizado **se e somente se** a funcionalidade pertencer ao
 *   conjunto de funcionalidades operacionais liberadas — Req 7.2.3 / 7.2.4.
 */
export function decidirAutorizacao(
  perfil: Perfil,
  funcionalidade: string,
): boolean {
  if (perfil === 'GERENTE') {
    return true;
  }
  return FUNCIONALIDADES_FISCAL_SET.has(funcionalidade);
}

/** Representa um usuário e a sua credencial (forma resolvida/abstrata). */
export interface CredencialUsuario {
  login: string;
  /** Segredo verificável (na produção é o hash; aqui é abstrato/puro). */
  senha: string;
  perfil: Perfil;
}

/** Resultado puro da decisão de autenticação. */
export type ResultadoAutenticacao =
  | { concedido: true; perfil: Perfil }
  | { concedido: false };

/**
 * Função verificadora de senha. Recebe a senha informada e o segredo
 * armazenado do candidato e retorna se conferem. Permite injetar a comparação
 * (ex.: bcrypt na produção, igualdade simples nos testes puros).
 */
export type VerificadorSenha = (
  informada: string,
  armazenada: string,
) => boolean;

const igualdadeEstrita: VerificadorSenha = (a, b) => a === b;

/**
 * Decide, de forma pura, se o acesso deve ser concedido a partir de um
 * conjunto de usuários cadastrados e de um par de credenciais (Req 7.1.2,
 * 7.1.3, 7.1.5).
 *
 * O acesso é concedido — com o perfil associado — **se e somente se** existir
 * um usuário cujo `login` é exatamente o informado e cuja senha confere. A
 * autenticação ocorre sempre pelo login individual do próprio usuário: somente
 * o usuário dono daquele login pode autenticar com ele.
 *
 * @param usuarios conjunto de credenciais cadastradas (logins únicos).
 * @param login login informado.
 * @param senha senha informada.
 * @param verificar comparador de senha (default: igualdade estrita, puro).
 */
export function decidirAutenticacao(
  usuarios: readonly CredencialUsuario[],
  login: string,
  senha: string,
  verificar: VerificadorSenha = igualdadeEstrita,
): ResultadoAutenticacao {
  const candidato = usuarios.find((u) => u.login === login);
  if (candidato && verificar(senha, candidato.senha)) {
    return { concedido: true, perfil: candidato.perfil };
  }
  return { concedido: false };
}

/**
 * Indica se um login está disponível em relação a um conjunto de usuários já
 * existentes — ou seja, se nenhum usuário cadastrado já o utiliza
 * (Requisitos 7.1.4 e 7.1.6).
 */
export function loginDisponivelEntre(
  loginsExistentes: readonly string[],
  login: string,
): boolean {
  return !loginsExistentes.includes(login);
}

/**
 * Verifica, de forma pura, a invariante de unicidade de login: não existem
 * dois usuários distintos com o mesmo login (Requisitos 7.1.4 e 7.1.6).
 */
export function loginsSaoUnicos(logins: readonly string[]): boolean {
  return new Set(logins).size === logins.length;
}
