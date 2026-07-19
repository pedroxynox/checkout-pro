/**
 * Lógica **pura** da detecção automática de faltas e não-retornos a partir da
 * escala + Relógio Ponto. Sem Nest nem Prisma — testável isoladamente.
 *
 * Regras acordadas com o dono do produto:
 *  - Alerta preventivo (visual): 1h após a hora de entrada prevista sem
 *    nenhuma batida → o colaborador aparece como "Sem registrar" (atenção),
 *    mas NADA é lançado ainda.
 *  - Falta automática: 2h após a hora de entrada prevista sem nenhuma batida →
 *    o sistema marca a falta automaticamente (mesmo fluxo/avisos da falta
 *    manual). Se a pessoa bater ponto depois, a falta automática é removida.
 *  - Não retorno do intervalo: quando o intervalo em curso ultrapassa o máximo
 *    (3h no contrato 6x1) sem batida de retorno, o dia é marcado como
 *    "não retorno do intervalo".
 */

/** Minutos após a entrada prevista a partir dos quais mostramos o alerta visual. */
export const ALERTA_ATRASO_MIN = 60; // 1h

/** Minutos após a entrada prevista a partir dos quais a falta é automática. */
export const FALTA_AUTOMATICA_MIN = 120; // 2h

/** Estado de presença de um escalado que ainda NÃO bateu ponto no dia. */
export type EstadoSemBatida = 'AGUARDANDO' | 'ALERTA' | 'FALTA';

const HHMM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

/** "HH:mm" → minutos desde a meia-noite; null se inválido. */
export function hhmmParaMinutos(
  hhmm: string | null | undefined,
): number | null {
  if (!hhmm || !HHMM_RE.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Minutos decorridos desde a hora de entrada prevista até `agoraBrasilia`
 * (ambos em hora de parede de Brasília). Negativo quando ainda não chegou a
 * hora; `null` quando a entrada prevista é inválida/ausente.
 *
 * `agoraBrasilia` é o "agora" já deslocado para Brasília (os componentes UTC
 * representam a hora local), como o `agoraNaBrasilia()` de `common/datas`.
 */
export function minutosAposEntrada(
  entradaPrevista: string | null,
  agoraBrasilia: Date,
): number | null {
  const previstoMin = hhmmParaMinutos(entradaPrevista);
  if (previstoMin === null) return null;
  const agoraMin =
    agoraBrasilia.getUTCHours() * 60 + agoraBrasilia.getUTCMinutes();
  return agoraMin - previstoMin;
}

/**
 * Estado de um escalado SEM nenhuma batida no dia, dado quantos minutos já se
 * passaram desde a entrada prevista:
 *  - >= 2h  → FALTA (marcar automaticamente);
 *  - >= 1h  → ALERTA (só visual, "Sem registrar");
 *  - senão  → AGUARDANDO (ainda dentro da tolerância / antes da hora).
 *
 * `minutos === null` (sem entrada prevista) devolve AGUARDANDO — nunca marca
 * falta de quem não tem horário definido para o dia.
 */
export function estadoSemBatida(minutos: number | null): EstadoSemBatida {
  if (minutos === null) return 'AGUARDANDO';
  if (minutos >= FALTA_AUTOMATICA_MIN) return 'FALTA';
  if (minutos >= ALERTA_ATRASO_MIN) return 'ALERTA';
  return 'AGUARDANDO';
}
