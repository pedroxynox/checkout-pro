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
  // Configuração do rodízio de domingo (Centro de Controle) — só administrador.
  'ESCALA_DOMINGO_CONFIG',
  // Central de Permissões (ajustar permissões por login) — só administrador.
  'PERMISSOES_GERENCIAR',
  // Administração de dados (zerar/limpar) — só administrador
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
 * Funcionalidades liberadas ao perfil SUPERVISOR: tudo do fiscal + gestão de
 * requisições, o **Fechamento** (status dos arquivos do dia), a edição de
 * escala/batidas e a Central de Jornada. NÃO acessa o **Centro de Controle**
 * (cadastro de colaboradores, metas, relatórios, etc.), que é exclusivo de
 * gerente/administrador.
 */
export const FUNCIONALIDADES_SUPERVISOR: readonly Funcionalidade[] =
  Object.freeze([
    ...FUNCIONALIDADES_FISCAL,
    // Painel de vendas: o supervisor visualiza (o fiscal não vê mais). A edição
    // (PAINEL_VENDAS_EDITAR) permanece exclusiva de gerente/administrador.
    'PAINEL_VENDAS_VISUALIZAR',
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
 * Funcionalidades liberadas ao perfil GERENTE. Executa a operação e a gestão do
 * dia a dia, incluindo o Centro de Controle nas ferramentas de gestão (cadastro
 * de colaboradores, metas, central de vendas e relatórios), edição de escala,
 * correção de batidas e a gestão do lote APAE.
 * - NÃO inclui as ferramentas exclusivas do ADMINISTRADOR dentro do Centro de
 *   Controle: `USUARIOS_CRUD` (definir acessos ao app), `ESCALA_DOMINGO_CONFIG`
 *   (rodízio de domingo), `IMPORTACOES` (carregar arquivos do dia) e
 *   `ADMIN_DADOS` (zerar/limpar dados operacionais/insumos).
 * - A alteração de status de fiscal não é por funcionalidade: só o próprio
 *   fiscal (do seu status) ou o administrador podem alterar (ver FiscaisController).
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
    // Cadastro de colaboradores (Centro de Controle ▸ Colaboradores) e gestão do
    // lote APAE. A gestão de ACESSOS (USUARIOS_CRUD) NÃO pertence ao gerente:
    // definir quem acessa o app é exclusivo do administrador.
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

/**
 * ============================================================================
 * Central de Permissões — permissões POR LOGIN (perfil como padrão + ajustes).
 * ============================================================================
 */

/**
 * Um ajuste (desvio) de permissão para um usuário específico, relativo ao
 * padrão do seu perfil. `concedida = true` adiciona a funcionalidade; `false`
 * a remove.
 */
export interface OverridePermissao {
  funcionalidade: string;
  concedida: boolean;
}

/**
 * Funcionalidades **protegidas**: exclusivas do ADMINISTRADOR e NÃO ajustáveis
 * pela Central de Permissões (não podem ser concedidas nem manipuladas para
 * outros perfis). Evita escalada de privilégios: ninguém pode se dar acesso a
 * gerir pessoas, importar, zerar dados, configurar o rodízio nem à própria
 * Central de Permissões.
 */
export const FUNCIONALIDADES_PROTEGIDAS: readonly string[] = Object.freeze([
  'USUARIOS_CRUD',
  'ADMIN_DADOS',
  'ESCALA_DOMINGO_CONFIG',
  'IMPORTACOES',
  'PERMISSOES_GERENCIAR',
  // Leitura interna sem área de menu — não faz sentido ajustar manualmente.
  'CARGA_STATUS_VISUALIZAR',
]);

const FUNCIONALIDADES_PROTEGIDAS_SET = new Set<string>(
  FUNCIONALIDADES_PROTEGIDAS,
);

/**
 * Indica se uma funcionalidade pode ser ajustada por login na Central de
 * Permissões (existe no catálogo e não é protegida).
 */
export function podeSerAjustada(funcionalidade: string): boolean {
  return (
    (TODAS_FUNCIONALIDADES as readonly string[]).includes(funcionalidade) &&
    !FUNCIONALIDADES_PROTEGIDAS_SET.has(funcionalidade)
  );
}

/** Lista, em ordem do catálogo, as funcionalidades ajustáveis por login. */
export const FUNCIONALIDADES_AJUSTAVEIS: readonly string[] = Object.freeze(
  TODAS_FUNCIONALIDADES.filter((f) => !FUNCIONALIDADES_PROTEGIDAS_SET.has(f)),
);

/** Conjunto padrão de funcionalidades de um perfil (sem ajustes por login). */
export function conjuntoBaseDoPerfil(perfil: Perfil): readonly string[] {
  if (perfil === 'ADMINISTRADOR') {
    return TODAS_FUNCIONALIDADES;
  }
  if (perfil === 'GERENTE') {
    return FUNCIONALIDADES_GERENTE;
  }
  if (perfil === 'SUPERVISOR') {
    return FUNCIONALIDADES_SUPERVISOR;
  }
  if (perfil === 'IMPORTADOR') {
    return FUNCIONALIDADES_IMPORTADOR;
  }
  return FUNCIONALIDADES_FISCAL;
}

/**
 * Decide o acesso considerando os ajustes por login (perfil como padrão +
 * overrides). O ADMINISTRADOR mantém acesso TOTAL e **imutável** (os ajustes
 * são ignorados). Ajustes sobre funcionalidades protegidas também são
 * ignorados por segurança — a autoridade final é sempre esta função.
 */
export function decidirAutorizacaoComOverrides(
  perfil: Perfil,
  funcionalidade: string,
  overrides: readonly OverridePermissao[],
): boolean {
  if (perfil === 'ADMINISTRADOR') {
    return true;
  }
  if (!FUNCIONALIDADES_PROTEGIDAS_SET.has(funcionalidade)) {
    const ajuste = overrides.find((o) => o.funcionalidade === funcionalidade);
    if (ajuste) {
      return ajuste.concedida;
    }
  }
  return decidirAutorizacao(perfil, funcionalidade);
}

/**
 * Calcula o conjunto EFETIVO de funcionalidades de um usuário: o padrão do
 * perfil com os ajustes aplicados (ajustes protegidos são ignorados). É o que
 * o backend entrega ao app para decidir o que aparece na tela.
 */
export function permissoesEfetivas(
  perfil: Perfil,
  overrides: readonly OverridePermissao[],
): string[] {
  if (perfil === 'ADMINISTRADOR') {
    return [...TODAS_FUNCIONALIDADES];
  }
  const efetivas = new Set<string>(conjuntoBaseDoPerfil(perfil));
  for (const ajuste of overrides) {
    if (FUNCIONALIDADES_PROTEGIDAS_SET.has(ajuste.funcionalidade)) {
      continue;
    }
    if (ajuste.concedida) {
      efetivas.add(ajuste.funcionalidade);
    } else {
      efetivas.delete(ajuste.funcionalidade);
    }
  }
  // Mantém a ordem do catálogo para uma saída estável.
  return TODAS_FUNCIONALIDADES.filter((f) => efetivas.has(f));
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
