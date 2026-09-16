/**
 * Utilitários puros de período (dia/semana/mês) em UTC para o módulo de vendas,
 * alinhados ao armazenamento das datas em meia-noite UTC.
 */

// Os utilitários básicos de período vivem em `common/datas` (fonte única de
// verdade). Reexportados aqui para preservar os imports existentes do módulo.
export {
  inicioDoDia,
  inicioDoProximoDia,
  inicioDaSemana,
  inicioDaProximaSemana,
  inicioDoMes,
  inicioDoProximoMes,
} from '../common/datas';

/** Quantidade de dias do mês que contém a data. */
export function diasNoMes(data: Date): number {
  return new Date(
    Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + 1, 0),
  ).getUTCDate();
}

/** Mesma data deslocada N meses (mantendo o dia, com clamp no fim do mês). */
export function deslocarMeses(data: Date, meses: number): Date {
  const ano = data.getUTCFullYear();
  const mes = data.getUTCMonth() + meses;
  const dia = data.getUTCDate();
  const ultimoDiaAlvo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(dia, ultimoDiaAlvo)));
}

/** Converte "HH:mm" em minutos desde a meia-noite; `null` se inválido. */
export function horaParaMinutos(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Nomes curtos dos dias da semana (0=Dom .. 6=Sáb), padrão JS getUTCDay. */
export const NOMES_DIA_SEMANA = [
  'Dom',
  'Seg',
  'Ter',
  'Qua',
  'Qui',
  'Sex',
  'Sáb',
] as const;


// ---------------------------------------------------------------------------
// Perfil de movimento: média por dia da semana e média numa faixa de horas.
//
// Estas funções são puras de propósito: além do painel de vendas, a
// Compensação de horas (ADR 0021) precisa responder "que dia da semana move
// menos?" e "que ponta do turno move menos?" para sugerir quando liberar
// alguém. Duplicar a estatística nos dois lados garantiria divergência, então
// ela mora aqui, sem banco, e os dois módulos a consomem.
// ---------------------------------------------------------------------------

/**
 * Mínimo de observações de um dia da semana para a média valer como sinal.
 *
 * Três é o mesmo piso que o aviso de queda anômala já usa (`avisarVendas`):
 * com uma ou duas observações a "média" é ruído, e uma sugestão de folga
 * apoiada em ruído é pior do que nenhuma sugestão. Abaixo deste piso o dia
 * fica sem média (`null`) e quem consome decide se ainda quer sugerir.
 */
export const MIN_AMOSTRAS_DIA_SEMANA = 3;

/** Média de venda de um dia da semana, com o tamanho da amostra. */
export interface MediaDiaSemana {
  /** 0 = domingo … 6 = sábado. */
  diaSemana: number;
  nome: string;
  /** Média do total diário, ou `null` quando a amostra é insuficiente. */
  media: number | null;
  /** Quantos dias entraram na média (dias com movimento, feriados fora). */
  amostras: number;
}

/**
 * Média do total diário por dia da semana, **excluindo feriados**.
 *
 * O feriado sai da conta por dois motivos que apontam para o mesmo lado: o
 * movimento de um feriado não representa o dia da semana em que ele caiu (ora
 * vende muito mais, ora a loja fecha mais cedo), e um feriado nunca é candidato
 * a compensação de horas — as horas dele são pagas a 100%, que não se debita.
 * Deixá-lo na média contaminaria a escolha do dia mais fraco com um dia que
 * jamais será escolhido.
 *
 * Dias sem movimento (valor zero ou negativo) também não entram: quase sempre
 * significam "o arquivo daquele dia não foi enviado", não "a loja não vendeu".
 *
 * @param diarios totais por dia (a data em meia-noite UTC)
 * @param opcoes `ehFeriado` exclui feriados (sem ele, nada é excluído);
 *   `minAmostras` é o piso para a média valer (padrão
 *   `MIN_AMOSTRAS_DIA_SEMANA`). O painel de vendas passa `1`, porque ali a
 *   média é informativa e não decide nada.
 */
export function mediaPorDiaSemana(
  diarios: readonly { data: Date; valor: unknown }[],
  opcoes: {
    ehFeriado?: (data: Date) => boolean;
    minAmostras?: number;
  } = {},
): MediaDiaSemana[] {
  const { ehFeriado, minAmostras = MIN_AMOSTRAS_DIA_SEMANA } = opcoes;
  const soma = new Array<number>(7).fill(0);
  const cont = new Array<number>(7).fill(0);

  for (const d of diarios) {
    const valor = Number(d.valor);
    if (!Number.isFinite(valor) || valor <= 0) continue;
    if (ehFeriado?.(d.data)) continue;
    const dow = d.data.getUTCDay();
    soma[dow] += valor;
    cont[dow] += 1;
  }

  return soma.map((s, dow) => ({
    diaSemana: dow,
    nome: NOMES_DIA_SEMANA[dow],
    media: cont[dow] >= minAmostras ? s / cont[dow] : null,
    amostras: cont[dow],
  }));
}

/**
 * Soma da venda média de uma faixa de horas do dia, a partir de uma linha do
 * heatmap (24 posições, a média de venda de cada hora daquele dia da semana).
 *
 * A faixa é dada em minutos desde a meia-noite e as horas contam
 * **proporcionalmente**: um turno que termina às 14h30 leva metade da hora 14.
 * Sem isso, uma faixa de 2h30 e uma de 3h dariam o mesmo peso, e a comparação
 * entre as duas pontas do turno — que é para isso que a função existe —
 * escolheria a ponta errada por arredondamento.
 *
 * @param linhaHeatmap média de venda por hora (índice 0..23)
 * @param inicioMin início da faixa, em minutos desde 00:00
 * @param fimMin fim da faixa (exclusivo), em minutos desde 00:00
 */
export function vendaMediaNaFaixa(
  linhaHeatmap: readonly number[],
  inicioMin: number,
  fimMin: number,
): number {
  if (fimMin <= inicioMin) return 0;
  let total = 0;
  const primeiraHora = Math.floor(inicioMin / 60);
  const ultimaHora = Math.min(23, Math.floor((fimMin - 1) / 60));

  for (let h = primeiraHora; h <= ultimaHora; h++) {
    const media = Number(linhaHeatmap[h] ?? 0);
    if (!Number.isFinite(media) || media <= 0) continue;
    // Quantos minutos DESTA hora caem dentro da faixa.
    const inicioDaHora = h * 60;
    const dentro =
      Math.min(fimMin, inicioDaHora + 60) - Math.max(inicioMin, inicioDaHora);
    if (dentro <= 0) continue;
    total += media * (dentro / 60);
  }
  return total;
}


/**
 * Heatmap 7×24: média de venda de cada hora, por dia da semana.
 *
 * A média divide pela quantidade de **dias distintos** observados naquele dia da
 * semana (e não pelo total de registros): sem isso, um dia da semana com mais
 * semanas de história pareceria vender mais por hora só por ter mais amostras.
 *
 * Consumido pelo painel de vendas (curva típica) e pela Compensação de horas,
 * que usa a linha do dia da semana para decidir em que ponta do turno liberar
 * alguém — a pessoa fica na loja enquanto ela está cheia.
 */
export function heatmapDiaSemanaHora(
  regs: readonly { data: Date; hora: number; valor: unknown }[],
): number[][] {
  const soma: number[][] = Array.from({ length: 7 }, () =>
    new Array<number>(24).fill(0),
  );
  const diasPorSemana: Set<string>[] = Array.from({ length: 7 }, () => new Set());

  for (const r of regs) {
    const valor = Number(r.valor);
    if (!Number.isFinite(valor)) continue;
    const dow = r.data.getUTCDay();
    if (r.hora < 0 || r.hora > 23) continue;
    soma[dow][r.hora] += valor;
    diasPorSemana[dow].add(r.data.toISOString().slice(0, 10));
  }

  return soma.map((linha, dow) => {
    const n = diasPorSemana[dow].size;
    return linha.map((s) => (n > 0 ? s / n : 0));
  });
}
