/**
 * Lógica **pura** de justificativa (abono) de ocorrências de escala — faltas e
 * não-retornos de intervalo. Fonte única do **peso** que uma ocorrência ainda
 * tem no score conforme a sua justificativa (ver ADR 0009).
 *
 * Sem dependência do Nest nem do Prisma: determinística e testável por
 * propriedade.
 */

/** Estado de justificativa de uma ocorrência (espelho do enum Prisma). */
export type StatusJustificativa = 'PENDENTE' | 'JUSTIFICADA' | 'INJUSTIFICADA';

/** Motivo da justificativa (espelho do enum Prisma). */
export type MotivoJustificativa =
  | 'ATESTADO_MEDICO'
  | 'ABONADA'
  | 'LICENCA'
  | 'ATRASO_JUSTIFICADO'
  | 'OUTRO';

/** Todos os status conhecidos (fonte única para validações/DTOs). */
export const STATUS_JUSTIFICATIVA: readonly StatusJustificativa[] = [
  'PENDENTE',
  'JUSTIFICADA',
  'INJUSTIFICADA',
] as const;

/** Todos os motivos conhecidos (fonte única para validações/DTOs). */
export const MOTIVOS_JUSTIFICATIVA: readonly MotivoJustificativa[] = [
  'ATESTADO_MEDICO',
  'ABONADA',
  'LICENCA',
  'ATRASO_JUSTIFICADO',
  'OUTRO',
] as const;

/** Peso de uma ocorrência JUSTIFICADA por atestado médico (2%). */
export const PESO_ATESTADO = 0.02;
/** Peso de uma ocorrência JUSTIFICADA por qualquer outro motivo (10%). */
export const PESO_OUTROS_JUSTIFICADOS = 0.1;

/**
 * Peso (0..1) que a ocorrência ainda tem no score conforme a justificativa:
 * - PENDENTE ou INJUSTIFICADA → **1** (impacto integral);
 * - JUSTIFICADA + ATESTADO_MEDICO → `PESO_ATESTADO` (2%);
 * - JUSTIFICADA + qualquer outro motivo → `PESO_OUTROS_JUSTIFICADOS` (10%).
 *
 * Uma justificativa sem motivo (estado inconsistente) é tratada de forma
 * conservadora como impacto integral (peso 1).
 */
export function pesoOcorrencia(
  status: StatusJustificativa,
  motivo: MotivoJustificativa | null | undefined,
): number {
  if (status !== 'JUSTIFICADA') return 1;
  if (!motivo) return 1;
  return motivo === 'ATESTADO_MEDICO'
    ? PESO_ATESTADO
    : PESO_OUTROS_JUSTIFICADOS;
}

/** Uma ocorrência reduzida à sua justificativa (para somas ponderadas). */
export interface OcorrenciaJustificavel {
  statusJustificativa?: StatusJustificativa | null;
  motivoJustificativa?: MotivoJustificativa | null;
}

/**
 * Soma ponderada de um conjunto de ocorrências: cada uma contribui com o seu
 * `pesoOcorrencia`. Ocorrências sem estado explícito contam como PENDENTE
 * (peso 1). É o "número de faltas/não-retornos efetivo" usado no score, em
 * contraste com a contagem crua (usada para exibição/histórico).
 */
export function somaPonderada(
  ocorrencias: readonly OcorrenciaJustificavel[],
): number {
  return ocorrencias.reduce(
    (acc, o) =>
      acc +
      pesoOcorrencia(
        o.statusJustificativa ?? 'PENDENTE',
        o.motivoJustificativa,
      ),
    0,
  );
}

/** Indica se o motivo é obrigatório para o status informado (só JUSTIFICADA). */
export function motivoObrigatorio(status: StatusJustificativa): boolean {
  return status === 'JUSTIFICADA';
}
