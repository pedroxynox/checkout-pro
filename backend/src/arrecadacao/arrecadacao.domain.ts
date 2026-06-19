/**
 * Domínio puro da arrecadação por operador (indicadores).
 *
 * Tipos de arquivo/indicador suportados e utilitários de período (dia, semana
 * ISO de segunda a domingo, mês) em UTC, alinhados ao armazenamento das datas
 * em meia-noite UTC.
 */

export const TIPOS_ARRECADACAO = [
  'TROCO_SOLIDARIO',
  'RECARGAS_CELULAR',
  'CANCELAMENTO_ITENS',
  'CANCELAMENTO_CUPOM',
  'DEVOLUCOES',
] as const;

export type TipoArrecadacao = (typeof TIPOS_ARRECADACAO)[number];

export function ehTipoArrecadacao(valor: string): valor is TipoArrecadacao {
  return (TIPOS_ARRECADACAO as readonly string[]).includes(valor);
}

/**
 * Configuração de meta por indicador.
 * - base 'FIXA': meta é um valor alvo em R$ (ex.: troco/recargas = 2000).
 * - base 'VENDAS': o indicador é um % sobre as vendas (ex.: cancelamentos,
 *   devoluções); `meta` é o percentual alvo.
 * - sentido: se "maior é melhor" (arrecadar mais) ou "menor é melhor"
 *   (cancelar/devolver menos).
 */
export interface ConfigIndicador {
  tipo: TipoArrecadacao;
  titulo: string;
  base: 'FIXA' | 'VENDAS';
  meta: number;
  sentido: 'MAIOR_MELHOR' | 'MENOR_MELHOR';
}

export const CONFIG_ARRECADACAO: Record<TipoArrecadacao, ConfigIndicador> = {
  TROCO_SOLIDARIO: {
    tipo: 'TROCO_SOLIDARIO',
    titulo: 'Troco Solidário',
    base: 'FIXA',
    meta: 2000,
    sentido: 'MAIOR_MELHOR',
  },
  RECARGAS_CELULAR: {
    tipo: 'RECARGAS_CELULAR',
    titulo: 'Recargas de Celular',
    base: 'FIXA',
    meta: 2000,
    sentido: 'MAIOR_MELHOR',
  },
  CANCELAMENTO_ITENS: {
    tipo: 'CANCELAMENTO_ITENS',
    titulo: 'Cancelamento de Itens',
    base: 'VENDAS',
    meta: 0.75,
    sentido: 'MENOR_MELHOR',
  },
  CANCELAMENTO_CUPOM: {
    tipo: 'CANCELAMENTO_CUPOM',
    titulo: 'Cancelamento de Cupom',
    base: 'VENDAS',
    meta: 0.5,
    sentido: 'MENOR_MELHOR',
  },
  DEVOLUCOES: {
    tipo: 'DEVOLUCOES',
    titulo: 'Devoluções',
    base: 'VENDAS',
    meta: 0.05,
    sentido: 'MENOR_MELHOR',
  },
};

/** Início do dia (00:00 UTC) da data informada. */
export function inicioDoDia(data: Date): Date {
  return new Date(
    Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()),
  );
}

/** Início do dia seguinte (limite superior exclusivo do dia). */
export function inicioDoProximoDia(data: Date): Date {
  const d = inicioDoDia(data);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** Início da semana (segunda-feira 00:00 UTC) que contém a data. */
export function inicioDaSemana(data: Date): Date {
  const d = inicioDoDia(data);
  const dow = d.getUTCDay(); // 0=domingo ... 6=sábado
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

/** Início da próxima semana (limite exclusivo). */
export function inicioDaProximaSemana(data: Date): Date {
  const d = inicioDaSemana(data);
  d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

/** Início do mês (dia 1, 00:00 UTC) que contém a data. */
export function inicioDoMes(data: Date): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), 1));
}

/** Início do próximo mês (limite exclusivo). */
export function inicioDoProximoMes(data: Date): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + 1, 1));
}
