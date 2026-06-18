/**
 * Lógica de domínio **pura** do Modulo_Indicadores.
 *
 * Concentra: acumulação de vendas por dia/semana/mês recalculada do zero
 * (Req 2.1.2, 2.1.3, 2.1.5), validação de valor de venda (Req 2.1.4), cálculo
 * do indicador percentual (Req 2.2.1, 2.3.1), classificação de cor por sentido
 * (Req 2.2–2.5) e ordenação de rankings (Req 2.2.6, 2.3.6, 2.4.6, 2.5.6).
 *
 * Por serem puras e determinísticas, podem ser exercitadas por testes de
 * propriedade (fast-check) sem qualquer infraestrutura.
 */

export type StatusCor = 'VERDE' | 'AMARELO' | 'VERMELHO';
export type Periodo = 'DIA' | 'SEMANA' | 'MES';
export type SentidoMeta = 'MENOR_MELHOR' | 'MAIOR_MELHOR';

/** Uma venda diária (valor das vendas de um dia). */
export interface VendaRegistro {
  data: Date;
  valor: number;
}

/** Configuração de meta/limite/sentido de um indicador. */
export interface ConfigIndicador {
  meta: number;
  limiteAmarelo: number;
  sentido: SentidoMeta;
}

/** Item genérico de ranking (pessoa + total acumulado). */
export interface RankingItem {
  pessoaId: string;
  total: number;
}

/**
 * Metas oficiais dos indicadores (Req 2.2.2, 2.3.2, 2.4.2, 2.5.2). O limite
 * amarelo é configurável; aqui ficam apenas valores-padrão sensatos.
 */
export const META_CANCELAMENTO = 0.75; // % sobre vendas
export const META_DEVOLUCOES = 0.05; // % sobre vendas
export const META_TROCO_SOLIDARIO = 2000; // R$ por mês
export const META_RECARGAS = 2000; // R$

/**
 * Indica se um valor de venda é válido (Req 2.1.4): deve ser um número finito
 * maior ou igual a zero.
 */
export function vendaValida(valor: number): boolean {
  return Number.isFinite(valor) && valor >= 0;
}

/** Início do dia (00:00 UTC) de uma data. */
export function inicioDoDia(data: Date): Date {
  return new Date(
    Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()),
  );
}

/**
 * Início da semana (domingo 00:00 UTC) que contém a data. A semana é definida
 * de domingo a sábado.
 */
export function inicioDaSemana(data: Date): Date {
  const dia = inicioDoDia(data);
  const diaSemana = dia.getUTCDay(); // 0 = domingo
  return new Date(dia.getTime() - diaSemana * 24 * 60 * 60 * 1000);
}

/** Início do mês (dia 1, 00:00 UTC) de uma data. */
export function inicioDoMes(data: Date): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), 1));
}

/**
 * Indica se `data` pertence ao mesmo período (dia/semana/mês) que a data de
 * referência. Usado tanto na acumulação quanto na filtragem.
 */
export function pertenceAoPeriodo(
  data: Date,
  referencia: Date,
  periodo: Periodo,
): boolean {
  switch (periodo) {
    case 'DIA':
      return inicioDoDia(data).getTime() === inicioDoDia(referencia).getTime();
    case 'SEMANA':
      return (
        inicioDaSemana(data).getTime() === inicioDaSemana(referencia).getTime()
      );
    case 'MES':
      return inicioDoMes(data).getTime() === inicioDoMes(referencia).getTime();
  }
}

/**
 * Acumula (soma) o valor das vendas que pertencem ao mesmo período da data de
 * referência (Req 2.1.2, 2.1.3). Como soma sempre o estado final das vendas,
 * o resultado é consistente com um recálculo "do zero" após alterações
 * (Req 2.1.5).
 */
export function acumular(
  vendas: readonly VendaRegistro[],
  referencia: Date,
  periodo: Periodo,
): number {
  return vendas
    .filter((v) => pertenceAoPeriodo(v.data, referencia, periodo))
    .reduce((soma, v) => soma + v.valor, 0);
}

/**
 * Calcula o indicador percentual: (total do indicador ÷ total de vendas) × 100
 * (Req 2.2.1, 2.3.1). Definido para total de vendas maior que zero; quando o
 * total de vendas é zero ou negativo (sem denominador), retorna 0.
 */
export function percentual(
  totalIndicador: number,
  totalVendas: number,
): number {
  if (totalVendas <= 0) {
    return 0;
  }
  return (totalIndicador / totalVendas) * 100;
}

/**
 * Classifica a cor de um indicador conforme o sentido da meta (Req 2.2–2.5).
 *
 * - "menor é melhor" (Cancelamento, Devoluções): VERDE se `valor ≤ meta`;
 *   AMARELO se `meta < valor ≤ limiteAmarelo`; VERMELHO se `valor > limiteAmarelo`.
 * - "maior é melhor" (Troco Solidário, Recargas): VERDE se `valor ≥ meta`;
 *   AMARELO se `limiteAmarelo ≤ valor < meta`; VERMELHO se `valor < limiteAmarelo`.
 *
 * Sempre atribui exatamente uma cor.
 */
export function statusCor(valor: number, config: ConfigIndicador): StatusCor {
  if (config.sentido === 'MENOR_MELHOR') {
    if (valor <= config.meta) {
      return 'VERDE';
    }
    if (valor <= config.limiteAmarelo) {
      return 'AMARELO';
    }
    return 'VERMELHO';
  }
  // MAIOR_MELHOR
  if (valor >= config.meta) {
    return 'VERDE';
  }
  if (valor >= config.limiteAmarelo) {
    return 'AMARELO';
  }
  return 'VERMELHO';
}

/**
 * Ordena um ranking de forma decrescente pelo total (Req 2.2.6, 2.3.6, 2.4.6,
 * 2.5.6). O resultado é uma permutação exata da entrada (nenhuma pessoa perdida
 * ou duplicada). Em caso de empate, ordena por `pessoaId` ascendente para um
 * resultado determinístico. Não muta o array de entrada.
 */
export function ranking(itens: readonly RankingItem[]): RankingItem[] {
  return [...itens].sort((a, b) =>
    b.total !== a.total
      ? b.total - a.total
      : a.pessoaId.localeCompare(b.pessoaId),
  );
}
