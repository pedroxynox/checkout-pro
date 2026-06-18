/**
 * Lógica de domínio **pura** da escala de trabalho (Req 4.3).
 *
 * Concentra a resolução da escala efetiva por funcionário/dia, na qual um
 * horário especial individual prevalece sobre a regra geral do turno
 * (Req 4.3.5), e a consolidação da escala por dia da semana (Req 4.3.6).
 *
 * Por serem puras e determinísticas, podem ser exercitadas por testes de
 * propriedade (fast-check) sem qualquer infraestrutura.
 */

/** Uma entrada de escala de um funcionário em um dia da semana (0–6). */
export interface EscalaEntry {
  funcionarioId: string;
  diaSemana: number;
  entrada: string | null;
  saida: string | null;
  intervaloMin: number;
  folga: boolean;
  especial: boolean;
}

/** Escala efetiva resolvida: a entrada aplicável ou 'FOLGA'. */
export type EscalaEfetiva = EscalaEntry | 'FOLGA';

/** Converte uma entrada em escala efetiva: folga (ou ausência) vira 'FOLGA'. */
function entryParaEfetiva(entry: EscalaEntry | null): EscalaEfetiva {
  if (!entry || entry.folga) {
    return 'FOLGA';
  }
  return entry;
}

/**
 * Resolve a escala efetiva de um funcionário em um dia (Req 4.3.5):
 *
 * - quando existe um horário **especial** individual para o dia, ele prevalece
 *   sobre a regra geral do turno;
 * - caso contrário, aplica a regra geral (ou folga, quando não há regra geral
 *   ou ela é uma folga).
 *
 * @param geral entrada geral do turno (ou `null`).
 * @param especial entrada especial individual (ou `null`).
 */
export function resolverEscalaEfetiva(
  geral: EscalaEntry | null,
  especial: EscalaEntry | null,
): EscalaEfetiva {
  if (especial) {
    return entryParaEfetiva(especial);
  }
  return entryParaEfetiva(geral);
}

/** Item da escala consolidada por funcionário em um dia da semana. */
export interface ItemEscalaConsolidada {
  funcionarioId: string;
  efetiva: EscalaEfetiva;
}

/**
 * Consolida a escala de um dia da semana (Req 4.3.6): para cada funcionário com
 * entrada naquele dia, resolve a escala efetiva aplicando a regra de
 * prevalência do horário especial. O resultado é ordenado por `funcionarioId`
 * para ser determinístico.
 */
export function escalaConsolidada(
  entries: readonly EscalaEntry[],
  diaSemana: number,
): ItemEscalaConsolidada[] {
  const doDia = entries.filter((e) => e.diaSemana === diaSemana);
  const porFuncionario = new Map<
    string,
    { geral: EscalaEntry | null; especial: EscalaEntry | null }
  >();

  for (const e of doDia) {
    const atual = porFuncionario.get(e.funcionarioId) ?? {
      geral: null,
      especial: null,
    };
    if (e.especial) {
      atual.especial = e;
    } else {
      atual.geral = e;
    }
    porFuncionario.set(e.funcionarioId, atual);
  }

  return Array.from(porFuncionario.entries())
    .map(([funcionarioId, { geral, especial }]) => ({
      funcionarioId,
      efetiva: resolverEscalaEfetiva(geral, especial),
    }))
    .sort((a, b) => a.funcionarioId.localeCompare(b.funcionarioId));
}
