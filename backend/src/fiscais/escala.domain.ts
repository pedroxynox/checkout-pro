/**
 * Lógica de domínio **pura** da escala de trabalho dos fiscais (Req 4.3).
 *
 * ## O que saiu daqui (ADR 0026)
 *
 * Duas coisas, em duas etapas.
 *
 * A **etapa 1** removeu a regra de prevalência do horário `especial`: uma entrada
 * marcada como exceção sobrepunha a entrada geral do dia, sem validade, sem tela
 * e invisível à ficha.
 *
 * A **etapa 2** removeu a resolução da escala a partir da cópia semanal
 * (`resolverEscalaEfetiva` e `escalaConsolidada`). Elas liam a `EscalaEntry` e
 * tinham de conviver com duplicadas — a tabela nunca teve índice único em
 * `(funcionarioId, diaSemana)` —, o que fazia a escala efetiva de uma pessoa
 * depender de qual leitor perguntava. O turno passou a ser resolvido a partir da
 * **ficha**, por `turno-fiscal.ts` + `entradaEsperadaNoDia`/`saidaEsperadaNoDia`,
 * as mesmas funções da escala publicada.
 *
 * O que resta aqui é a geração da cópia semanal a partir da ficha — o único
 * caminho que ainda escreve na tabela, mantido enquanto ela guardar o intervalo
 * (etapa 3) — e as formas de resposta da escala consolidada.
 */

/** Turno efetivo de um funcionário num dia: os horários, ou 'FOLGA'. */
export interface TurnoEfetivo {
  funcionarioId: string;
  diaSemana: number;
  entrada: string | null;
  saida: string | null;
  intervaloMin: number;
  folga: boolean;
}

/** Escala efetiva resolvida: o turno aplicável ou 'FOLGA'. */
export type EscalaEfetiva = TurnoEfetivo | 'FOLGA';

/** Item da escala consolidada por funcionário em um dia da semana. */
export interface ItemEscalaConsolidada {
  funcionarioId: string;
  efetiva: EscalaEfetiva;
}

/**
 * Escala semanal definida no cadastro do colaborador (fonte única — Opção A).
 *
 * O cadastro guarda um modelo simples: horário Seg–Qui, horário Sex–Sáb e um
 * dia de folga. A partir dele geramos as entradas da cópia semanal (uma por dia
 * da semana).
 */
export interface EscalaColaboradorInput {
  entradaSemana: string | null;
  saidaSemana: string | null;
  entradaFds: string | null;
  saidaFds: string | null;
  folgaDiaSemana: number | null;
}

/** Um dia gerado da escala semanal. */
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
 * Gera a escala semanal a partir do cadastro (Opção A). Regras:
 * - o dia de folga vira uma entrada de folga;
 * - Seg–Qui (1–4) usam o horário Seg–Qui; Sex–Sáb (5–6) usam o horário Sex–Sáb;
 * - Domingo (0) só aparece se for o dia de folga — o rodízio de grupos decide o
 *   domingo, e ele não cabe numa tabela por dia da semana;
 * - dias sem horário completo (e que não são folga) são omitidos.
 *
 * Retorna apenas os dias que produziram uma entrada (determinístico, ordenado).
 *
 * **Nada lê estes horários para cobrar ponto** desde a etapa 2 da ADR 0026: a
 * hora esperada vem da ficha. A geração continua porque a cópia semanal ainda
 * guarda o intervalo do turno, e deixá-la congelada com dados antigos seria pior
 * do que mantê-la em dia enquanto a etapa 3 não lhe dá outro lugar.
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
