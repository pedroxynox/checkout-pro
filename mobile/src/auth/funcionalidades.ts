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
 * Conjunto de funcionalidades operacionais liberadas ao perfil FISCAL.
 * Idêntico ao `FUNCIONALIDADES_FISCAL` do backend (acessos.domain.ts).
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
  'ALERTAS_FILA',
  'NORMATIVAS',
  'INDICADOR_QUEBRA',
]);

const FUNCIONALIDADES_FISCAL_SET = new Set<string>(FUNCIONALIDADES_FISCAL);

/**
 * Decide se um perfil pode acessar uma funcionalidade (Req 7.2):
 * - GERENTE: sempre autorizado (acesso total) — Req 7.2.2.
 * - FISCAL: autorizado se e somente se a funcionalidade estiver na lista
 *   operacional — Req 7.2.3 / 7.2.4.
 */
export function podeAcessar(perfil: Perfil, funcionalidade: string): boolean {
  if (perfil === 'GERENTE') {
    return true;
  }
  return FUNCIONALIDADES_FISCAL_SET.has(funcionalidade);
}
