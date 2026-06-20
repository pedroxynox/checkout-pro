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
  'IMPORTACOES',
  'INDICADORES_VISUALIZAR',
  'PAINEL_VENDAS_VISUALIZAR',
  'PAINEL_VENDAS_EDITAR',
  'INDICADOR_QUEBRA',
  'OPERADORES_AUSENCIAS',
]);

/** Funcionalidades do SUPERVISOR: tudo do fiscal + cadastro de operadores. */
export const FUNCIONALIDADES_SUPERVISOR: readonly string[] = Object.freeze([
  ...FUNCIONALIDADES_FISCAL,
  'OPERADORES_CRUD',
  'INSUMOS_GERENCIAR',
]);

const FUNCIONALIDADES_FISCAL_SET = new Set<string>(FUNCIONALIDADES_FISCAL);
const FUNCIONALIDADES_SUPERVISOR_SET = new Set<string>(
  FUNCIONALIDADES_SUPERVISOR,
);

/**
 * Decide se um perfil pode acessar uma funcionalidade (Req 7.2):
 * - GERENTE: sempre autorizado (acesso total).
 * - SUPERVISOR: autorizado se pertencer ao conjunto do supervisor.
 * - FISCAL: autorizado se pertencer ao conjunto operacional do fiscal.
 */
export function podeAcessar(perfil: Perfil, funcionalidade: string): boolean {
  if (perfil === 'GERENTE') {
    return true;
  }
  if (perfil === 'SUPERVISOR') {
    return FUNCIONALIDADES_SUPERVISOR_SET.has(funcionalidade);
  }
  return FUNCIONALIDADES_FISCAL_SET.has(funcionalidade);
}
