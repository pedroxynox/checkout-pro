/**
 * Lógica de domínio pura da seção Check-Outs (sem Nest/Prisma). Concentra a
 * lista de equipamentos, as validações e o resumo por caixa (tablero).
 */

/** Equipamentos de um check-out que podem apresentar avaria. */
export const EQUIPAMENTOS_CHECKOUT = [
  'CPU',
  'TECLADO',
  'SCANNER',
  'PINPAD',
  'MONITOR',
  'IMPRESSORA',
  'GAVETA',
  'BALANCA',
  'OUTRO',
] as const;

export type EquipamentoCheckout = (typeof EQUIPAMENTOS_CHECKOUT)[number];

const EQUIPAMENTOS_SET = new Set<string>(EQUIPAMENTOS_CHECKOUT);

/** Rótulos amigáveis dos equipamentos (para as mensagens dos avisos). */
export const ROTULO_EQUIPAMENTO: Record<string, string> = {
  CPU: 'CPU',
  TECLADO: 'teclado',
  SCANNER: 'scanner',
  PINPAD: 'pinpad',
  MONITOR: 'monitor',
  IMPRESSORA: 'impressora',
  GAVETA: 'gaveta',
  BALANCA: 'balança',
  OUTRO: 'equipamento',
};

/** Rótulo amigável de um equipamento (fallback: o próprio código). */
export function rotuloEquipamento(equipamento: string): string {
  return ROTULO_EQUIPAMENTO[equipamento] ?? equipamento;
}

/**
 * Nº de avarias do MESMO equipamento na MESMA caixa, no mês, que dispara o
 * aviso de problema recorrente (para a gestão avaliar manutenção/troca).
 * Ajustável: basta mudar este número.
 */
export const LIMIAR_RECORRENCIA = 3;

/** Primeiro dia do mês (00:00 UTC) da data informada — base do contador mensal. */
export function primeiroDiaDoMes(data: Date): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), 1));
}

/** Limites sãos para a quantidade de check-outs configurável. */
export const MIN_CHECKOUTS = 1;
export const MAX_CHECKOUTS = 200;

/** Status possíveis de um reporte de avaria. */
export type StatusReporte = 'ABERTO' | 'RESOLVIDO';

export function ehEquipamentoValido(valor: string): valor is EquipamentoCheckout {
  return EQUIPAMENTOS_SET.has(valor);
}

/** Normaliza/valida a quantidade de check-outs; lança fora dos limites. */
export function quantidadeValida(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_CHECKOUTS && n <= MAX_CHECKOUTS;
}

/** Resumo mínimo de um reporte usado pelo cálculo do tablero. */
export interface ReporteResumo {
  checkoutNumero: number;
  equipamento: string;
}

/** Item do tablero: um check-out, seu estado e um resumo para a card. */
export interface CheckoutResumo {
  numero: number;
  /** Nº de avarias ABERTAS na caixa. */
  abertos: number;
  /** Equipamentos com avaria ABERTA (códigos, sem repetição) — resumo da card. */
  equipamentos: string[];
  /**
   * true se algum equipamento desta caixa atingiu o limiar de recorrência no
   * mês (LIMIAR_RECORRENCIA) — sinaliza necessidade de manutenção/troca.
   */
  recorrente: boolean;
}

/**
 * Monta o tablero: para cada caixa de 1..quantidade, resume as avarias ABERTAS
 * (contagem + equipamentos afetados) e marca se há problema RECORRENTE no mês
 * (o mesmo equipamento falhou LIMIAR_RECORRENCIA+ vezes na caixa).
 *
 * - `abertos`: reportes com status ABERTO (já filtrados pelo chamador).
 * - `reportesDoMes`: todos os reportes do mês corrente (qualquer status), base
 *   do cálculo de recorrência.
 *
 * Reportes de caixas acima da quantidade atual (ex.: após reduzir o número) são
 * ignorados aqui, mas seu histórico permanece no banco.
 */
export function montarTablero(
  quantidade: number,
  abertos: readonly ReporteResumo[],
  reportesDoMes: readonly ReporteResumo[] = [],
): CheckoutResumo[] {
  const abertosPorCaixa = new Map<number, number>();
  const equipamentosPorCaixa = new Map<number, Set<string>>();
  for (const r of abertos) {
    abertosPorCaixa.set(
      r.checkoutNumero,
      (abertosPorCaixa.get(r.checkoutNumero) ?? 0) + 1,
    );
    const set = equipamentosPorCaixa.get(r.checkoutNumero) ?? new Set<string>();
    set.add(r.equipamento);
    equipamentosPorCaixa.set(r.checkoutNumero, set);
  }

  // Recorrência: conta por (caixa, equipamento) no mês; marca a caixa quando
  // algum equipamento atinge o limiar.
  const contagemMes = new Map<string, number>();
  for (const r of reportesDoMes) {
    const chave = `${r.checkoutNumero}|${r.equipamento}`;
    contagemMes.set(chave, (contagemMes.get(chave) ?? 0) + 1);
  }
  const recorrentes = new Set<number>();
  for (const [chave, total] of contagemMes) {
    if (total >= LIMIAR_RECORRENCIA) {
      recorrentes.add(Number(chave.split('|')[0]));
    }
  }

  const itens: CheckoutResumo[] = [];
  for (let numero = 1; numero <= quantidade; numero++) {
    itens.push({
      numero,
      abertos: abertosPorCaixa.get(numero) ?? 0,
      equipamentos: Array.from(equipamentosPorCaixa.get(numero) ?? []),
      recorrente: recorrentes.has(numero),
    });
  }
  return itens;
}
