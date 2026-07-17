/**
 * Registro de regras por TIPO DE CONTRATO de jornada.
 *
 * O cálculo da jornada (`calcularJornadaDia`) é genérico sobre um
 * `RegrasContrato`. Aqui fica o "catálogo": cada tipo de contrato aponta para
 * as suas regras. Para adicionar um novo contrato no futuro basta:
 *   1. incluir o valor no enum `TipoContrato` (Prisma) e neste tipo;
 *   2. definir o seu `RegrasContrato`;
 *   3. registrá-lo em `REGISTRO_CONTRATOS`.
 * Nenhuma duplicação de cálculo é necessária. Hoje só existe o 6x1–2x1.
 */
import { RegrasContrato, REGRAS_SEIS_X_UM_DOIS_X_UM } from './ponto.domain';

/** Tipos de contrato de jornada (espelha o enum `TipoContrato` do Prisma). */
export type TipoContrato = 'SEIS_X_UM_DOIS_X_UM';

/** Contrato vigente enquanto não houver outros cadastrados. */
export const CONTRATO_PADRAO: TipoContrato = 'SEIS_X_UM_DOIS_X_UM';

/** Regras de cada tipo de contrato. Adicionar um contrato = uma entrada aqui. */
export const REGISTRO_CONTRATOS: Record<TipoContrato, RegrasContrato> = {
  SEIS_X_UM_DOIS_X_UM: REGRAS_SEIS_X_UM_DOIS_X_UM,
};

/**
 * Regras do contrato informado. Um tipo ausente/desconhecido cai no contrato
 * vigente (6x1–2x1), preservando o comportamento atual.
 */
export function regrasDoContrato(tipo?: string | null): RegrasContrato {
  if (tipo && Object.prototype.hasOwnProperty.call(REGISTRO_CONTRATOS, tipo)) {
    return REGISTRO_CONTRATOS[tipo as TipoContrato];
  }
  return REGISTRO_CONTRATOS[CONTRATO_PADRAO];
}
