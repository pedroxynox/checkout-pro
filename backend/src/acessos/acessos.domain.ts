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
  | 'ADMINISTRADOR'
  | 'SUPERVISOR'
  | 'FISCAL'
  | 'IMPORTADOR';

/**
 * ============================================================================
 * FONTE ÚNICA DE VERDADE das permissões do sistema.
 * ============================================================================
 *
 * `TODAS_FUNCIONALIDADES` é o catálogo completo de funcionalidades existentes.
 * Toda a regra de acesso (abaixo) e o app móvel derivam deste catálogo, de modo
 * que:
 *  - o perfil ADMINISTRADOR enxerga **absolutamente tudo** — inclusive
 *    qualquer funcionalidade nova que for adicionada aqui no futuro, sem
 *    precisar mexer na regra (ver `decidirAutorizacao`);
 *  - o tipo `Funcionalidade` garante, em tempo de compilação, que as listas de
 *    cada perfil só contenham funcionalidades que realmente existem.
 *
 * IMPORTANTE (manutenção): o app móvel mantém um **espelho** deste arquivo em
 * `mobile/src/auth/funcionalidades.ts`. Os dois pacotes (backend NestJS e app
 * Expo) são compilados separadamente e não compartilham código, então ao
 * alterar qualquer permissão aqui é preciso refletir a mesma mudança lá. A
 * autorização que vale de verdade é sempre a do backend (guards); a do app
 * apenas decide o que aparece na tela.
 */
export const TODAS_FUNCIONALIDADES = [
  // Carga e fechamento do dia
  'IMPORTACOES',
  'FECHAMENTO',
  // Leitura do status de carga do dia (somente leitura, SEM área de menu):
  // permite ao fiscal ver o tema "carga" no Briefing sem liberar as seções de
  // Importações/Fechamento no menu dele.
  'CARGA_STATUS_VISUALIZAR',
  // Indicadores e vendas
  'INDICADORES_VISUALIZAR',
  'PAINEL_VENDAS_VISUALIZAR',
  'PAINEL_VENDAS_EDITAR',
  // Sacolas APAE
  'LOTE_APAE',
  'LOTE_APAE_GERENCIAR',
  // Insumos / almoxarifado
  'INSUMOS',
  'INSUMOS_GERENCIAR',
  // Fiscais
  'FISCAIS_STATUS',
  'FISCAIS_JORNADA',
  // Central de Jornada (portal gerencial do ciclo de folha 26→25).
  'CENTRAL_JORNADA',
  'ESCALA_VISUALIZAR',
  'ESCALA_EDITAR',
  // Registro de Ponto (leitor de comprovante): PONTO_REGISTRAR = registrar
  // batidas novas (todos os perfis); PONTO_EDITAR = corrigir/remover batidas já
  // registradas (só gestão); PONTO_VISUALIZAR = ver o painel de jornada.
  'PONTO_REGISTRAR',
  'PONTO_EDITAR',
  'PONTO_VISUALIZAR',
  // Operação diária
  'CHECKLIST',
  'OPERADORES_AUSENCIAS',
  'OPERADORES_CRUD',
  // Decisão de solicitações automáticas de advertência (gerente/supervisor)
  'ADVERTENCIAS_DECIDIR',
  // Contratos de experiência (tempo de casa + marcos 45/90)
  'CONTRATOS_VISUALIZAR',
  'CONTRATOS_GERIR',
  // Feedforward (acompanhamento de desenvolvimento no perfil do colaborador)
  'FEEDFORWARD_VISUALIZAR',
  'FEEDFORWARD_GERIR',
  // Pessoas e avisos
  'USUARIOS_CRUD',
  'NOTIFICACOES',
  // Áreas ainda em construção (mantidas no catálogo para o controle de acesso)
  'ALERTAS_FILA',
  'NORMATIVAS',
  'INDICADOR_QUEBRA',
  // Administração de dados (zerar/limpar) — só desenvolvedor
  'ADMIN_DADOS',
] as const;

/** Uma funcionalidade válida do sistema (qualquer item do catálogo acima). */
export type Funcionalidade = (typeof TODAS_FUNCIONALIDADES)[number];

/**
 * Conjunto de funcionalidades **operacionais** liberadas ao perfil FISCAL
 * (Requisito 7.2.3): rotina diária + comunicação + seções gerais. O fiscal NÃO
 * acessa relatórios de vendas/indicadores/importações (isso é do supervisor)
 * nem cadastros administrativos (gerente).
 */
export const FUNCIONALIDADES_FISCAL: readonly Funcionalidade[] = Object.freeze([
  'LOTE_APAE',
  'INSUMOS',
  'FISCAIS_STATUS',
  // Jornada da equipe (horas trabalhadas e intervalos). O fiscal acompanha,
  // mas NÃO a Central de Jornada (portal gerencial do ciclo de folha).
  'FISCAIS_JORNADA',
  'ESCALA_VISUALIZAR',
  'CHECKLIST',
  'NOTIFICACOES',
  'ALERTAS_FILA',
  'NORMATIVAS',
  'INDICADORES_VISUALIZAR',
  'INDICADOR_QUEBRA',
  'OPERADORES_AUSENCIAS',
  // Registro de ponto: o fiscal registra batidas novas de qualquer colaborador
  // e vê o painel de jornada, mas NÃO corrige/remove batidas já registradas
  // (isso exige PONTO_EDITAR, restrito à gestão).
  'PONTO_REGISTRAR',
  'PONTO_VISUALIZAR',
  // Somente leitura do status de carga do dia, para o Briefing ter a MESMA
  // nota de saúde de gerentes/supervisores. Não abre nenhuma seção no menu do
  // fiscal (não há área associada a esta funcionalidade).
  'CARGA_STATUS_VISUALIZAR',
]);

/**
 * Funcionalidades liberadas ao perfil SUPERVISOR: tudo do fiscal + cadastro de
 * operadores, gestão de requisições e o **Fechamento** (status dos arquivos do
 * dia). Permanece exclusiva do gerente a gestão de pessoas/acessos.
 */
export const FUNCIONALIDADES_SUPERVISOR: readonly Funcionalidade[] =
  Object.freeze([
    ...FUNCIONALIDADES_FISCAL,
    // Painel de vendas: o supervisor visualiza (o fiscal não vê mais). A edição
    // (PAINEL_VENDAS_EDITAR) permanece exclusiva de gerente/administrador.
    'PAINEL_VENDAS_VISUALIZAR',
    'OPERADORES_CRUD',
    'INSUMOS_GERENCIAR',
    'FECHAMENTO',
    // Edição da escala (o fiscal só visualiza).
    'ESCALA_EDITAR',
    // Correção/remoção de batidas já registradas (o fiscal só registra novas).
    'PONTO_EDITAR',
    // Central de Jornada: portal gerencial do ciclo de folha (26→25).
    'CENTRAL_JORNADA',
    // Contratos: o supervisor acompanha (visualiza), mas não decide os marcos.
    'CONTRATOS_VISUALIZAR',
    // Feedforward: supervisor cria/edita e acompanha.
    'FEEDFORWARD_VISUALIZAR',
    'FEEDFORWARD_GERIR',
    // Decide as solicitações de advertência por falta não justificada.
    'ADVERTENCIAS_DECIDIR',
  ]);

/**
 * Funcionalidades do perfil IMPORTADOR: usuário dedicado, deixado no computador
 * da loja, cuja única função é **carregar os arquivos do dia** (Importações).
 * Não enxerga nenhuma outra área.
 */
export const FUNCIONALIDADES_IMPORTADOR: readonly Funcionalidade[] =
  Object.freeze(['IMPORTACOES']);

const FUNCIONALIDADES_FISCAL_SET = new Set<string>(FUNCIONALIDADES_FISCAL);
const FUNCIONALIDADES_SUPERVISOR_SET = new Set<string>(
  FUNCIONALIDADES_SUPERVISOR,
);
const FUNCIONALIDADES_IMPORTADOR_SET = new Set<string>(
  FUNCIONALIDADES_IMPORTADOR,
);

/**
 * Funcionalidades liberadas ao perfil GERENTE. Pode **ver tudo** e executar a
 * operação e a gestão do dia a dia, incluindo cadastro de operadores, gestão de
 * usuários, edição de escala, correção de batidas e a gestão do lote APAE.
 * - NÃO inclui apenas `ADMIN_DADOS` (zerar/limpar dados), que continua exclusivo
 *   do ADMINISTRADOR (acesso total).
 * - A alteração de status de fiscal não é por funcionalidade: só o próprio
 *   fiscal (do seu status) ou o desenvolvedor podem alterar (ver FiscaisController).
 */
export const FUNCIONALIDADES_GERENTE: readonly Funcionalidade[] = Object.freeze(
  [
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
    'OPERADORES_CRUD',
    'FISCAIS_STATUS',
    // Log de jornada dos fiscais (horas trabalhadas e intervalos).
    'FISCAIS_JORNADA',
    // Central de Jornada: portal gerencial do ciclo de folha (26→25).
    'CENTRAL_JORNADA',
    // Edição da escala.
    'ESCALA_EDITAR',
    // Registro de ponto (leitor de comprovante) + correção/remoção de batidas.
    'PONTO_REGISTRAR',
    'PONTO_EDITAR',
    'PONTO_VISUALIZAR',
    // Gestão de pessoas com acesso (login) e do lote APAE.
    'USUARIOS_CRUD',
    'LOTE_APAE_GERENCIAR',
    // Contratos de experiência: o gerente visualiza e decide os marcos.
    'CONTRATOS_VISUALIZAR',
    'CONTRATOS_GERIR',
    // Feedforward: gerente cria/edita e acompanha.
    'FEEDFORWARD_VISUALIZAR',
    'FEEDFORWARD_GERIR',
    // Decide as solicitações de advertência por falta não justificada.
    'ADVERTENCIAS_DECIDIR',
  ],
);

const FUNCIONALIDADES_GERENTE_SET = new Set<string>(FUNCIONALIDADES_GERENTE);

/**
 * Decide, de forma pura, se um perfil está autorizado a usar uma
 * funcionalidade (Requisito 7.2).
 *
 * - ADMINISTRADOR: sempre autorizado (acesso total, inclui operações
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
  if (perfil === 'ADMINISTRADOR') {
    // Acesso TOTAL: o desenvolvedor enxerga e executa todas as funcionalidades
    // do catálogo (`TODAS_FUNCIONALIDADES`), inclusive as administrativas e
    // qualquer funcionalidade futura. Por isso liberamos sem consultar lista.
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
