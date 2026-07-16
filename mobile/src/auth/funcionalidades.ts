/**
 * Permissões por perfil no app — ESPELHO da fonte de verdade do backend.
 *
 * A regra que vale de verdade é sempre a do backend
 * (`backend/src/acessos/acessos.domain.ts`, função `decidirAutorizacao` +
 * `PerfilGuard`). Este arquivo apenas decide **o que aparece na tela** para
 * cada perfil (Req 7.2.2–7.2.4), reaproveitando exatamente o mesmo catálogo e
 * a mesma regra.
 *
 * IMPORTANTE (manutenção): backend e app são pacotes compilados separadamente e
 * não compartilham código. Ao mudar uma permissão no backend, reflita a MESMA
 * mudança aqui (e vice-versa). O catálogo `TODAS_FUNCIONALIDADES` abaixo deve
 * ser idêntico ao do backend.
 */
import { Perfil } from '../api/types';

/**
 * Catálogo completo de funcionalidades do sistema (igual ao backend). O perfil
 * ADMINISTRADOR enxerga todas elas; o tipo `Funcionalidade` garante que
 * as listas de cada perfil só usem funcionalidades existentes.
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
  // Registro de Ponto (leitor de comprovante): registrar batidas novas
  // (PONTO_REGISTRAR) vs. corrigir/remover batidas (PONTO_EDITAR).
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
 * Funcionalidades operacionais liberadas ao perfil FISCAL (rotina diária +
 * comunicação + seções gerais). Idêntico ao backend (acessos.domain.ts).
 */
export const FUNCIONALIDADES_FISCAL: readonly Funcionalidade[] = Object.freeze([
  'LOTE_APAE',
  'INSUMOS',
  'FISCAIS_STATUS',
  // Jornada da equipe (horas trabalhadas e intervalos); NÃO a Central de Jornada.
  'FISCAIS_JORNADA',
  'ESCALA_VISUALIZAR',
  'CHECKLIST',
  'NOTIFICACOES',
  'ALERTAS_FILA',
  'NORMATIVAS',
  'INDICADORES_VISUALIZAR',
  'INDICADOR_QUEBRA',
  'OPERADORES_AUSENCIAS',
  // Registro de ponto: o fiscal registra batidas novas e vê o painel, mas não
  // corrige/remove batidas já registradas (isso exige PONTO_EDITAR).
  'PONTO_REGISTRAR',
  'PONTO_VISUALIZAR',
  // Somente leitura do status de carga do dia, para o Briefing ter a MESMA
  // nota de saúde de gerentes/supervisores. Não abre nenhuma seção no menu do
  // fiscal (não há área associada a esta funcionalidade).
  'CARGA_STATUS_VISUALIZAR',
]);

/** Funcionalidades do SUPERVISOR: tudo do fiscal + requisições + fechamento +
 * edição de escala/batidas e Central de Jornada. NÃO acessa o Centro de
 * Controle (cadastro/metas/relatórios/acessos), exclusivo de gerente/admin. */
export const FUNCIONALIDADES_SUPERVISOR: readonly Funcionalidade[] = Object.freeze([
  ...FUNCIONALIDADES_FISCAL,
  // Painel de vendas: o supervisor visualiza (o fiscal não vê mais). A edição
  // permanece exclusiva de gerente/administrador.
  'PAINEL_VENDAS_VISUALIZAR',
  'INSUMOS_GERENCIAR',
  'FECHAMENTO',
  // Edição da escala, correção de batidas e Central de Jornada.
  'ESCALA_EDITAR',
  'PONTO_EDITAR',
  'CENTRAL_JORNADA',
  'CONTRATOS_VISUALIZAR',
  'FEEDFORWARD_VISUALIZAR',
  'FEEDFORWARD_GERIR',
  'ADVERTENCIAS_DECIDIR',
]);

/** Funcionalidades do IMPORTADOR: usuário dedicado só carrega arquivos (Importações). */
export const FUNCIONALIDADES_IMPORTADOR: readonly Funcionalidade[] = Object.freeze([
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
 * Funcionalidades do GERENTE (espelho do backend): operação e gestão do dia a
 * dia + Centro de Controle nas ferramentas de gestão (cadastro de colaboradores,
 * metas, central de vendas e relatórios), edição de escala, correção de batidas
 * e gestão do lote APAE. NÃO inclui as ferramentas exclusivas do ADMINISTRADOR
 * dentro do Centro de Controle: definir acessos (USUARIOS_CRUD), rodízio de
 * domingo (ESCALA_DOMINGO_CONFIG), importar arquivos (IMPORTACOES) e zerar/limpar
 * dados (ADMIN_DADOS).
 */
export const FUNCIONALIDADES_GERENTE: readonly Funcionalidade[] = Object.freeze([
  'INDICADORES_VISUALIZAR',
  'PAINEL_VENDAS_VISUALIZAR',
  'PAINEL_VENDAS_EDITAR',
  'ESCALA_VISUALIZAR',
  'ESCALA_EDITAR',
  'NOTIFICACOES',
  'ALERTAS_FILA',
  'NORMATIVAS',
  'INDICADOR_QUEBRA',
  'FECHAMENTO',
  'INSUMOS',
  'INSUMOS_GERENCIAR',
  'LOTE_APAE',
  'LOTE_APAE_GERENCIAR',
  'CHECKLIST',
  'OPERADORES_AUSENCIAS',
  'OPERADORES_CRUD',
  'FISCAIS_STATUS',
  'FISCAIS_JORNADA',
  'CENTRAL_JORNADA',
  'PONTO_REGISTRAR',
  'PONTO_EDITAR',
  'PONTO_VISUALIZAR',
  'CONTRATOS_VISUALIZAR',
  'CONTRATOS_GERIR',
  'FEEDFORWARD_VISUALIZAR',
  'FEEDFORWARD_GERIR',
  'ADVERTENCIAS_DECIDIR',
]);

const FUNCIONALIDADES_GERENTE_SET = new Set<string>(FUNCIONALIDADES_GERENTE);

/**
 * Decide se um perfil pode acessar uma funcionalidade (Req 7.2):
 * - ADMINISTRADOR: acesso total (vê absolutamente tudo, inclusive
 *   qualquer funcionalidade futura do catálogo).
 * - GERENTE: apenas o conjunto de gerente (ver tudo + operação do dia a dia).
 * - SUPERVISOR: conjunto do supervisor.
 * - IMPORTADOR: apenas carregar arquivos (Importações).
 * - FISCAL: conjunto operacional do fiscal.
 */
export function podeAcessar(perfil: Perfil, funcionalidade: string): boolean {
  if (perfil === 'ADMINISTRADOR') {
    // Acesso TOTAL: libera sem consultar lista para garantir que o
    // desenvolvedor sempre veja tudo (Req: "ver absolutamente tudo").
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
