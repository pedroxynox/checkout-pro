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

// Os utilitários de período (dia/semana/mês) em UTC agora vivem em
// `common/datas` (fonte única de verdade). Reexportados aqui para preservar os
// imports existentes deste domínio.
export {
  inicioDoDia,
  inicioDoProximoDia,
  inicioDaSemana,
  inicioDaProximaSemana,
  inicioDoMes,
  inicioDoProximoMes,
} from '../common/datas';
