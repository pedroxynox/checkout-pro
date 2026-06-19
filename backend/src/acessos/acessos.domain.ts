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

export type Perfil = 'GERENTE' | 'SUPERVISOR' | 'FISCAL';

/**
 * Conjunto de funcionalidades **operacionais** liberadas ao perfil FISCAL
 * (Requisito 7.2.3): rotina diária + comunicação + seções gerais. O fiscal NÃO
 * acessa relatórios de vendas/indicadores/importações (isso é do supervisor)
 * nem cadastros administrativos (gerente).
 */
export const FUNCIONALIDADES_FISCAL: readonly string[] = Object.freeze([
  'LOTE_APAE',
  'INSUMOS',
  'FISCAIS_STATUS',
  'ESCALA_VISUALIZAR',
  'CHECKLIST',
  'NOTIFICACOES',
  'ALERTAS_FILA',
  'NORMATIVAS',
  'IMPORTACOES',
  'INDICADORES_VISUALIZAR',
  'PAINEL_VENDAS_VISUALIZAR',
  'INDICADOR_QUEBRA',
  'OPERADORES_AUSENCIAS',
]);

/**
 * Funcionalidades liberadas ao perfil SUPERVISOR: tudo do fiscal + o cadastro
 * de operadores. Permanece exclusiva do gerente a gestão de pessoas/acessos
 * (USUARIOS_CRUD).
 */
export const FUNCIONALIDADES_SUPERVISOR: readonly string[] = Object.freeze([
  ...FUNCIONALIDADES_FISCAL,
  'OPERADORES_CRUD',
]);

const FUNCIONALIDADES_FISCAL_SET = new Set<string>(FUNCIONALIDADES_FISCAL);
const FUNCIONALIDADES_SUPERVISOR_SET = new Set<string>(
  FUNCIONALIDADES_SUPERVISOR,
);

/**
 * Decide, de forma pura, se um perfil está autorizado a usar uma
 * funcionalidade (Requisito 7.2).
 *
 * - GERENTE: sempre autorizado (acesso total) — Req 7.2.2.
 * - SUPERVISOR: autorizado se a funcionalidade pertencer ao conjunto do
 *   supervisor.
 * - FISCAL: autorizado **se e somente se** a funcionalidade pertencer ao
 *   conjunto operacional do fiscal — Req 7.2.3 / 7.2.4.
 */
export function decidirAutorizacao(
  perfil: Perfil,
  funcionalidade: string,
): boolean {
  if (perfil === 'GERENTE') {
    return true;
  }
  if (perfil === 'SUPERVISOR') {
    return FUNCIONALIDADES_SUPERVISOR_SET.has(funcionalidade);
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
