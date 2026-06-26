/**
 * Domínio das Metas mensais (Centro de Controle ▸ Metas).
 *
 * Define os indicadores cuja meta é configurável **por mês** (período mensal):
 *  - VENDAS: faturamento alvo do mês (R$). Substitui a antiga meta única do
 *    Painel de Vendas (ConfigVendas.metaMensal), que agora é só fallback.
 *  - RECARGAS_CELULAR: arrecadação de recargas no mês (R$).
 *  - CANCELAMENTO_ITENS / CANCELAMENTO_CUPOM / DEVOLUCOES: limite em % sobre as
 *    vendas (menor é melhor).
 *
 * Observação: TROCO_SOLIDARIO NÃO é gerido aqui (segue com a meta global de
 * MetaIndicador/CONFIG_ARRECADACAO).
 */

/** Tipos de meta configuráveis por mês. */
export const TIPOS_META = [
  'VENDAS',
  'RECARGAS_CELULAR',
  'CANCELAMENTO_ITENS',
  'CANCELAMENTO_CUPOM',
  'DEVOLUCOES',
] as const;

export type TipoMeta = (typeof TIPOS_META)[number];

/** Unidade do valor da meta. */
export type UnidadeMeta = 'REAIS' | 'PERCENTUAL';

/** Configuração (rótulo, unidade, sentido e valor padrão) de cada meta. */
export interface ConfigMeta {
  tipo: TipoMeta;
  titulo: string;
  unidade: UnidadeMeta;
  /** MAIOR_MELHOR (arrecadar mais) ou MENOR_MELHOR (cancelar/devolver menos). */
  sentido: 'MAIOR_MELHOR' | 'MENOR_MELHOR';
  /** Valor padrão usado quando não há meta definida para o mês. */
  valorPadrao: number;
}

export const CONFIG_METAS: Record<TipoMeta, ConfigMeta> = {
  VENDAS: {
    tipo: 'VENDAS',
    titulo: 'Vendas',
    unidade: 'REAIS',
    sentido: 'MAIOR_MELHOR',
    valorPadrao: 0,
  },
  RECARGAS_CELULAR: {
    tipo: 'RECARGAS_CELULAR',
    titulo: 'Recarga de Celular',
    unidade: 'REAIS',
    sentido: 'MAIOR_MELHOR',
    valorPadrao: 2000,
  },
  CANCELAMENTO_ITENS: {
    tipo: 'CANCELAMENTO_ITENS',
    titulo: 'Cancelamento de Itens',
    unidade: 'PERCENTUAL',
    sentido: 'MENOR_MELHOR',
    valorPadrao: 0.75,
  },
  CANCELAMENTO_CUPOM: {
    tipo: 'CANCELAMENTO_CUPOM',
    titulo: 'Cancelamento de Cupom',
    unidade: 'PERCENTUAL',
    sentido: 'MENOR_MELHOR',
    valorPadrao: 0.5,
  },
  DEVOLUCOES: {
    tipo: 'DEVOLUCOES',
    titulo: 'Devoluções',
    unidade: 'PERCENTUAL',
    sentido: 'MENOR_MELHOR',
    valorPadrao: 0.05,
  },
};

/** Verdadeiro se a string é um tipo de meta válido. */
export function ehTipoMeta(valor: string): valor is TipoMeta {
  return (TIPOS_META as readonly string[]).includes(valor);
}

/** Período mensal válido no formato "AAAA-MM" (ex.: "2026-06"). */
const RE_ANO_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export function ehAnoMesValido(valor: string): boolean {
  return RE_ANO_MES.test(valor);
}

/**
 * Período mensal ("AAAA-MM") da data informada, em UTC (consistente com o
 * restante do sistema, que trata os dias como dia-calendário em UTC).
 */
export function anoMesDe(data: Date): string {
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}
