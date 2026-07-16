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
  status: string;
}

/** Item do tablero: um check-out e quantos reportes abertos tem. */
export interface CheckoutResumo {
  numero: number;
  abertos: number;
}

/**
 * Monta o tablero: para cada caixa de 1..quantidade, conta os reportes ABERTOS.
 * Reportes de caixas acima da quantidade atual (ex.: após reduzir o número)
 * são ignorados aqui, mas seu histórico permanece no banco.
 */
export function montarTablero(
  quantidade: number,
  reportes: readonly ReporteResumo[],
): CheckoutResumo[] {
  const abertosPorCaixa = new Map<number, number>();
  for (const r of reportes) {
    if (r.status === 'ABERTO') {
      abertosPorCaixa.set(
        r.checkoutNumero,
        (abertosPorCaixa.get(r.checkoutNumero) ?? 0) + 1,
      );
    }
  }
  const itens: CheckoutResumo[] = [];
  for (let numero = 1; numero <= quantidade; numero++) {
    itens.push({ numero, abertos: abertosPorCaixa.get(numero) ?? 0 });
  }
  return itens;
}
