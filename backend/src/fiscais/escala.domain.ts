/**
 * Lógica de domínio **pura** da escala de trabalho (Req 4.3).
 *
 * Concentra a resolução da escala efetiva por funcionário/dia e a consolidação
 * da escala por dia da semana (Req 4.3.6).
 *
 * ## O que saiu daqui (ADR 0026)
 *
 * Havia uma **regra de prevalência**: uma entrada marcada como `especial`
 * sobrepunha a entrada geral do dia. Foi removida — o horário é sempre o da
 * ficha, e a entrada geral é o que a ficha gera. A coluna `especial` continua no
 * banco, mas é sempre `false`: nenhum caminho a escreve como `true` e nenhum
 * leitor a honra.
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
 * Resolve a escala efetiva de um funcionário em um dia: a entrada geral do turno
 * (derivada da ficha) ou folga, quando não há entrada ou ela é uma folga.
 *
 * @param geral entrada geral do turno (ou `null`).
 */
export function resolverEscalaEfetiva(
  geral: EscalaEntry | null,
): EscalaEfetiva {
  return entryParaEfetiva(geral);
}

/** Item da escala consolidada por funcionário em um dia da semana. */
export interface ItemEscalaConsolidada {
  funcionarioId: string;
  efetiva: EscalaEfetiva;
}

/**
 * Consolida a escala de um dia da semana (Req 4.3.6): para cada funcionário com
 * entrada naquele dia, resolve a escala efetiva. O resultado é ordenado por
 * `funcionarioId` para ser determinístico.
 *
 * Entradas marcadas como `especial` são **ignoradas** (ADR 0026): elas não são
 * mais criadas e as antigas foram apagadas, mas ignorá-las explicitamente evita
 * que um resquício volte a decidir o horário de alguém.
 */
export function escalaConsolidada(
  entries: readonly EscalaEntry[],
  diaSemana: number,
): ItemEscalaConsolidada[] {
  const doDia = entries.filter((e) => e.diaSemana === diaSemana && !e.especial);
  const porFuncionario = new Map<string, EscalaEntry>();

  for (const e of doDia) {
    // PRIMEIRA entrada ganha, não a última. Não deveria haver duplicadas (a
    // escrita substitui em vez de acrescentar), mas as antigas existem — e
    // `resolverEscalaEfetiva`, que lê a mesma tabela, sempre usou
    // `entries.find(...)`, ou seja a primeira. Com critérios opostos, a escala
    // efetiva de uma pessoa dependia de qual dos dois leitores perguntava.
    // `npm run integridade` aponta as duplicadas que ainda existirem.
    if (!porFuncionario.has(e.funcionarioId)) {
      porFuncionario.set(e.funcionarioId, e);
    }
  }

  return Array.from(porFuncionario.entries())
    .map(([funcionarioId, geral]) => ({
      funcionarioId,
      efetiva: resolverEscalaEfetiva(geral),
    }))
    .sort((a, b) => a.funcionarioId.localeCompare(b.funcionarioId));
}

/**
 * Escala semanal definida no cadastro do colaborador (fonte única — Opção A).
 *
 * O cadastro guarda um modelo simples: horário Seg–Qui, horário Sex–Sáb e um
 * dia de folga. A partir dele geramos as entradas GERAIS da escala (uma por dia
 * da semana), que alimentam a tela "Escala". Os ajustes pontuais (horário
 * especial de um dia) seguem como exceções (`especial`) e NÃO são tocados aqui.
 */
export interface EscalaColaboradorInput {
  entradaSemana: string | null;
  saidaSemana: string | null;
  entradaFds: string | null;
  saidaFds: string | null;
  folgaDiaSemana: number | null;
}

/** Um dia gerado da escala semanal (geral). */
export interface DiaEscalaGerado {
  diaSemana: number;
  entrada: string | null;
  saida: string | null;
  folga: boolean;
}

/** Verdadeiro se o colaborador tem ALGUM dado de escala definido. */
export function temEscalaDefinida(input: EscalaColaboradorInput): boolean {
  return (
    !!input.entradaSemana ||
    !!input.saidaSemana ||
    !!input.entradaFds ||
    !!input.saidaFds ||
    input.folgaDiaSemana != null
  );
}

/**
 * Gera a escala semanal GERAL a partir do cadastro (Opção A). Regras:
 * - o dia de folga vira uma entrada de folga;
 * - Seg–Qui (1–4) usam o horário Seg–Qui; Sex–Sáb (5–6) usam o horário Sex–Sáb;
 * - Domingo (0) só aparece se for o dia de folga (o cadastro não tem horário de
 *   domingo);
 * - dias sem horário completo (e que não são folga) são omitidos.
 *
 * Retorna apenas os dias que produziram uma entrada (determinístico, ordenado).
 */
export function gerarEscalaSemanalFiscal(
  input: EscalaColaboradorInput,
): DiaEscalaGerado[] {
  const dias: DiaEscalaGerado[] = [];
  for (let dia = 0; dia <= 6; dia++) {
    if (input.folgaDiaSemana != null && dia === input.folgaDiaSemana) {
      dias.push({ diaSemana: dia, entrada: null, saida: null, folga: true });
      continue;
    }
    let entrada: string | null = null;
    let saida: string | null = null;
    if (dia >= 1 && dia <= 4) {
      entrada = input.entradaSemana ?? null;
      saida = input.saidaSemana ?? null;
    } else if (dia === 5 || dia === 6) {
      entrada = input.entradaFds ?? null;
      saida = input.saidaFds ?? null;
    }
    if (entrada && saida) {
      dias.push({ diaSemana: dia, entrada, saida, folga: false });
    }
  }
  return dias;
}
