/**
 * Espelho, no app, do conjunto de funcionalidades operacionais liberadas ao
 * perfil FISCAL (Req 7.2.3) e da regra de autorização por perfil (Req 7.2).
 *
 * Mantém o **mesmo conceito** do backend (`FUNCIONALIDADES_FISCAL` e
 * `decidirAutorizacao`): o gerente tem acesso total; o fiscal só acessa o que
 * pertence à lista operacional. Isto governa quais áreas aparecem na navegação
 * (Req 7.2.2–7.2.4). A autorização definitiva continua no backend (guards); a
 * verificação no app apenas evita exibir áreas indisponíveis.
 */
import { Perfil } from '../api/types';

/**
 * Funcionalidades operacionais liberadas ao perfil FISCAL (rotina diária +
 * comunicação + seções gerais). Idêntico ao backend (acessos.domain.ts).
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

/** Funcionalidades do SUPERVISOR: tudo do fiscal + operadores + requisições + fechamento. */
export const FUNCIONALIDADES_SUPERVISOR: readonly string[] = Object.freeze([
  ...FUNCIONALIDADES_FISCAL,
  'OPERADORES_CRUD',
  'INSUMOS_GERENCIAR',
  'FECHAMENTO',
  'FISCAIS_JORNADA',
]);

/** Funcionalidades do IMPORTADOR: usuário dedicado só carrega arquivos (Importações). */
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
 * Funcionalidades do GERENTE comum (espelho do backend): vê tudo + operação do
 * dia a dia, MAS não a gestão estrutural de dados (registrar lote APAE, gestão
 * de pessoas/operadores, edição de escala, zerar/limpar dados) — isso é só do
 * GERENTE_DESENVOLVEDOR. Alterar status de fiscal não é por funcionalidade
 * (só o próprio fiscal ou o desenvolvedor).
 */
export const FUNCIONALIDADES_GERENTE: readonly string[] = Object.freeze([
  'INDICADORES_VISUALIZAR',
  'PAINEL_VENDAS_VISUALIZAR',
  'PAINEL_VENDAS_EDITAR',
  'ESCALA_VISUALIZAR',
  'NOTIFICACOES',
  'ALERTAS_FILA',
  'NORMATIVAS',
  'INDICADOR_QUEBRA',
  'FECHAMENTO',
  'INSUMOS',
  'INSUMOS_GERENCIAR',
  'LOTE_APAE',
  'CHECKLIST',
  'OPERADORES_AUSENCIAS',
  'FISCAIS_STATUS',
  'FISCAIS_JORNADA',
]);

const FUNCIONALIDADES_GERENTE_SET = new Set<string>(FUNCIONALIDADES_GERENTE);

/**
 * Decide se um perfil pode acessar uma funcionalidade (Req 7.2):
 * - GERENTE_DESENVOLVEDOR: acesso total.
 * - GERENTE: apenas o conjunto de gerente (ver tudo + operação do dia a dia).
 * - SUPERVISOR: conjunto do supervisor.
 * - IMPORTADOR: apenas carregar arquivos (Importações).
 * - FISCAL: conjunto operacional do fiscal.
 */
export function podeAcessar(perfil: Perfil, funcionalidade: string): boolean {
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
