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

export type Perfil =
  | 'GERENTE'
  | 'GERENTE_DESENVOLVEDOR'
  | 'SUPERVISOR'
  | 'FISCAL'
  | 'IMPORTADOR';

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
  'INDICADORES_VISUALIZAR',
  'PAINEL_VENDAS_VISUALIZAR',
  'PAINEL_VENDAS_EDITAR',
  'INDICADOR_QUEBRA',
  'OPERADORES_AUSENCIAS',
]);

/**
 * Funcionalidades liberadas ao perfil SUPERVISOR: tudo do fiscal + cadastro de
 * operadores, gestão de requisições e o **Fechamento** (status dos arquivos do
 * dia). Permanece exclusiva do gerente a gestão de pessoas/acessos.
 */
export const FUNCIONALIDADES_SUPERVISOR: readonly string[] = Object.freeze([
  ...FUNCIONALIDADES_FISCAL,
  'OPERADORES_CRUD',
  'INSUMOS_GERENCIAR',
  'FECHAMENTO',
  // Log de jornada dos fiscais (horas trabalhadas e intervalos).
  'FISCAIS_JORNADA',
]);

/**
 * Funcionalidades do perfil IMPORTADOR: usuário dedicado, deixado no computador
 * da loja, cuja única função é **carregar os arquivos do dia** (Importações).
 * Não enxerga nenhuma outra área.
 */
export const FUNCIONALIDADES_IMPORTADOR: readonly string[] = Object.freeze([
  'IMPORTACOES',
]);

const FUNCIONALIDADES_FISCAL_SET = new Set<string>(FUNCIONALIDADES_FISCAL);
const FUNCIONALIDADES_SUPERVISOR_SET = new Set<string>(
  FUNCIONALIDADES_SUPERVISOR,
);
const FUNCIONALIDADES_IMPORTADOR_SET = new Set<string>(
  FUNCIONALIDADES_IMPORTADOR,
);

/**
 * Funcionalidades liberadas ao perfil GERENTE (comum). Pode **ver tudo** e
 * executar a operação do dia a dia, MAS não as operações de gestão estrutural
 * de dados, que ficam exclusivas do GERENTE_DESENVOLVEDOR:
 * - NÃO inclui: `LOTE_APAE_GERENCIAR` (registrar/reiniciar lote), `USUARIOS_CRUD`
 *   (gestão de pessoas), `OPERADORES_CRUD` (cadastro de operadores),
 *   `ESCALA_EDITAR` (edição de escala) e `ADMIN_DADOS` (zerar/limpar dados).
 * - A alteração de status de fiscal não é por funcionalidade: só o próprio
 *   fiscal (do seu status) ou o desenvolvedor podem alterar (ver FiscaisController).
 */
export const FUNCIONALIDADES_GERENTE: readonly string[] = Object.freeze([
  // Visualização / relatórios
  'INDICADORES_VISUALIZAR',
  'PAINEL_VENDAS_VISUALIZAR',
  'PAINEL_VENDAS_EDITAR',
  'ESCALA_VISUALIZAR',
  'NOTIFICACOES',
  'ALERTAS_FILA',
  'NORMATIVAS',
  'INDICADOR_QUEBRA',
  'FECHAMENTO',
  // Operação permitida ao gerente comum
  'INSUMOS',
  'INSUMOS_GERENCIAR',
  'LOTE_APAE',
  'CHECKLIST',
  'OPERADORES_AUSENCIAS',
  'FISCAIS_STATUS',
  // Log de jornada dos fiscais (horas trabalhadas e intervalos).
  'FISCAIS_JORNADA',
]);

const FUNCIONALIDADES_GERENTE_SET = new Set<string>(FUNCIONALIDADES_GERENTE);

/**
 * Decide, de forma pura, se um perfil está autorizado a usar uma
 * funcionalidade (Requisito 7.2).
 *
 * - GERENTE_DESENVOLVEDOR: sempre autorizado (acesso total, inclui operações
 *   que alteram dados da DB e a área administrativa).
 * - GERENTE: autorizado apenas para o conjunto de gerente (ver tudo + operação
 *   do dia a dia, sem gestão estrutural de dados).
 * - SUPERVISOR: autorizado se a funcionalidade pertencer ao conjunto do
 *   supervisor.
 * - FISCAL: autorizado **se e somente se** a funcionalidade pertencer ao
 *   conjunto operacional do fiscal — Req 7.2.3 / 7.2.4.
 */
export function decidirAutorizacao(
  perfil: Perfil,
  funcionalidade: string,
): boolean {
  if (perfil === 'GERENTE_DESENVOLVEDOR') {
    return true;
  }
  if (perfil === 'GERENTE') {
    return FUNCIONALIDADES_GERENTE_SET.has(funcionalidade);
  }
  if (perfil === 'SUPERVISOR') {
    return FUNCIONALIDADES_SUPERVISOR_SET.has(funcionalidade);
  }
  if (perfil === 'IMPORTADOR') {
    return FUNCIONALIDADES_IMPORTADOR_SET.has(funcionalidade);
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
