/**
 * Domínio **puro** do Histórico de Indicadores (janela móvel de meses).
 *
 * Concentra a aritmética de período mensal ("AAAA-MM"), a avaliação do semáforo
 * de um mês contra a sua meta e a leitura da **evolução de um mês para o outro**
 * respeitando o sentido do indicador.
 *
 * A regra mais importante daqui: em `CANCELAMENTO_ITENS`, `CANCELAMENTO_CUPOM` e
 * `DEVOLUCOES` **quanto menor, melhor**. Uma variação negativa nesses
 * indicadores é uma MELHORA, não uma queda — por isso a variação crua nunca é
 * exibida sozinha, sempre acompanhada de `evolucaoDoMes`.
 *
 * Sem dependência do Prisma nem do Nest: testável de forma determinística.
 */

import { anoMesDe } from '../metas/metas.domain';

/** Janela padrão do histórico: 24 meses (2 anos completos). */
export const MESES_HISTORICO_PADRAO = 24;

/**
 * Teto de meses aceito numa consulta. Serve só como guarda do parâmetro da
 * rota; a janela real é limitada pela retenção configurada.
 */
export const MESES_HISTORICO_MAX = 60;

/**
 * Faixa morta (em pontos percentuais) para considerar um mês ESTÁVEL. Abaixo
 * disso a variação é ruído e não merece seta de melhora/piora.
 */
export const LIMIAR_ESTAVEL_PCT = 1;

/** Semáforo de um mês. */
export type NivelIndicador = 'OK' | 'ATENCAO' | 'FORA';

/** Leitura da variação já interpretada pelo sentido do indicador. */
export type EvolucaoMes = 'MELHOROU' | 'PIOROU' | 'ESTAVEL';

/** Base da meta: valor fixo em R$ ou percentual sobre as vendas. */
export type BaseIndicador = 'FIXA' | 'VENDAS';

/** Sentido do indicador. */
export type SentidoIndicador = 'MAIOR_MELHOR' | 'MENOR_MELHOR';

/** Primeiro dia (00:00 UTC) do mês "AAAA-MM". */
export function inicioDoAnoMes(anoMes: string): Date {
  const [ano, mes] = anoMes.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, 1));
}

/** Primeiro dia do mês seguinte (limite superior exclusivo do mês). */
export function inicioDoProximoAnoMes(anoMes: string): Date {
  const [ano, mes] = anoMes.split('-').map(Number);
  return new Date(Date.UTC(ano, mes, 1));
}

/**
 * Último dia (00:00 UTC) do mês "AAAA-MM". É a **data de referência** de um mês
 * fechado: passá-la aos endpoints existentes devolve o mês inteiro.
 */
export function fimDoAnoMes(anoMes: string): Date {
  const [ano, mes] = anoMes.split('-').map(Number);
  return new Date(Date.UTC(ano, mes, 0));
}

/**
 * "AAAA-MM" deslocado em `n` meses (n negativo = meses anteriores). `Date.UTC`
 * normaliza a virada de ano automaticamente.
 */
export function anoMesDeslocado(anoMes: string, n: number): string {
  const base = inicioDoAnoMes(anoMes);
  return anoMesDe(
    new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + n, 1)),
  );
}

/**
 * Os `quantidade` meses que TERMINAM em `anoMesFinal`, do mais antigo para o
 * mais recente (ordem de leitura de um gráfico de evolução).
 */
export function janelaDeMeses(
  anoMesFinal: string,
  quantidade: number,
): string[] {
  const total = Math.max(1, Math.floor(quantidade));
  const meses: string[] = [];
  for (let i = total - 1; i >= 0; i--) {
    meses.push(anoMesDeslocado(anoMesFinal, -i));
  }
  return meses;
}

/**
 * Mês mais antigo que PERMANECE na janela de retenção. Tudo anterior a ele pode
 * ser apagado: a janela anda um mês a cada mês novo que entra.
 */
export function anoMesLimiteDaJanela(
  anoMesAtual: string,
  meses: number,
): string {
  return anoMesDeslocado(anoMesAtual, -(Math.max(1, Math.floor(meses)) - 1));
}

const MESES_ABREVIADOS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/** Rótulo curto do mês para eixos e listas (ex.: "ago/26"). */
export function rotuloAnoMes(anoMes: string): string {
  const [ano, mes] = anoMes.split('-').map(Number);
  return `${MESES_ABREVIADOS[mes - 1]}/${String(ano).slice(2)}`;
}

/**
 * Valor **comparável** de um mês: R$ (base FIXA) ou % sobre as vendas do mês
 * (base VENDAS). É o número que se compara com a meta e com o mês anterior.
 */
export function valorComparavel(
  base: BaseIndicador,
  total: number,
  vendas: number,
): number {
  if (base !== 'VENDAS') return total;
  return vendas > 0 ? (total / vendas) * 100 : 0;
}

/**
 * Semáforo do mês — **fonte única de verdade** (antes a regra estava duplicada
 * na tela de Indicadores e no detalhe do indicador).
 *
 * - base FIXA (maior é melhor): atingiu a meta = OK; a partir de 75% = ATENCAO.
 * - base VENDAS (menor é melhor): dentro da meta = OK; até 1,5× a meta = ATENCAO.
 */
export function nivelDoMes(
  base: BaseIndicador,
  valor: number,
  meta: number,
): NivelIndicador {
  if (base === 'FIXA') {
    if (valor >= meta) return 'OK';
    if (valor >= meta * 0.75) return 'ATENCAO';
    return 'FORA';
  }
  if (valor <= meta) return 'OK';
  if (valor <= meta * 1.5) return 'ATENCAO';
  return 'FORA';
}

/** true se o mês cumpriu a meta (sem meio-termo, para contar sequências). */
export function cumpriuMeta(
  base: BaseIndicador,
  valor: number,
  meta: number,
): boolean {
  return base === 'FIXA' ? valor >= meta : valor <= meta;
}

/**
 * Variação percentual de um mês para o outro. Devolve `null` quando não há base
 * de comparação (mês anterior em zero ou inexistente): dividir por zero daria
 * um "+∞%" sem significado.
 */
export function variacaoMensal(atual: number, anterior: number): number | null {
  if (!Number.isFinite(anterior) || anterior <= 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

/**
 * Traduz a variação crua em melhora/piora **respeitando o sentido**: subir é
 * bom no troco solidário e nas recargas, e é ruim em cancelamentos e
 * devoluções. Devolve `null` quando não há variação para interpretar.
 */
export function evolucaoDoMes(
  sentido: SentidoIndicador,
  variacao: number | null,
): EvolucaoMes | null {
  if (variacao === null) return null;
  if (Math.abs(variacao) < LIMIAR_ESTAVEL_PCT) return 'ESTAVEL';
  const subiu = variacao > 0;
  const subirEhBom = sentido === 'MAIOR_MELHOR';
  return subiu === subirEhBom ? 'MELHOROU' : 'PIOROU';
}

/**
 * Quantos meses seguidos, contando do mais recente para trás, cumpriram a meta.
 * Recebe a série em ordem cronológica (mais antigo primeiro) e ignora os meses
 * sem dados, que não representam nem sucesso nem falha.
 */
export function sequenciaCumprindo(
  meses: readonly { cumpriuMeta: boolean; semDados: boolean }[],
): number {
  let sequencia = 0;
  for (let i = meses.length - 1; i >= 0; i--) {
    const m = meses[i];
    if (m.semDados) continue;
    if (!m.cumpriuMeta) break;
    sequencia++;
  }
  return sequencia;
}
