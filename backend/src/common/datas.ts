/**
 * Utilitários puros de período (dia/semana/mês) em UTC — fonte única de verdade.
 *
 * Todas as datas do sistema são armazenadas em meia-noite UTC, então estes
 * helpers operam sobre os componentes UTC da data. São funções puras (sem
 * efeitos colaterais nem dependência de fuso local), portanto testáveis
 * isoladamente e reutilizáveis por qualquer módulo de domínio.
 *
 * Antes deste módulo, `inicioDoDia` e correlatos estavam duplicados em vários
 * domínios (arrecadação, vendas, fiscais, checklist), com risco de divergência.
 */

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

/**
 * Último dia do mês (00:00 UTC) que contém a data. Útil como limite superior
 * **inclusivo** para contagens dia-a-dia no mês (ex.: dias escalados no mês).
 * `Date.UTC(ano, mes + 1, 0)` resolve para o dia 0 do próximo mês, que é o
 * último dia do mês corrente.
 */
export function fimDoMes(data: Date): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + 1, 0));
}

/**
 * Período da folha de RH — o "ciclo 26→25". A folha da unidade fecha todo dia
 * 25 e abre no dia 26; portanto o ciclo que contém `data` vai do dia 26 de um
 * mês ao dia 25 do mês seguinte (inclusive). Retorna o `inicio` (dia 26, 00:00
 * UTC, inclusivo) e o `fimExclusivo` (dia 26 do mês seguinte, 00:00 UTC) — para
 * usar em faixas do Prisma como `{ gte: inicio, lt: fimExclusivo }`.
 *
 * `Date.UTC` normaliza o estouro/subfluxo de mês (ex.: mês -1 → dezembro do ano
 * anterior; mês +1 no dezembro → janeiro do ano seguinte).
 */
export function periodoFolha(data: Date): { inicio: Date; fimExclusivo: Date } {
  const ano = data.getUTCFullYear();
  const mes = data.getUTCMonth();
  const dia = data.getUTCDate();
  // A partir do dia 26 o ciclo já começou neste mês; antes disso, começou no
  // mês anterior (a folha ainda está aberta desde o dia 26 do mês passado).
  const mesInicio = dia >= 26 ? mes : mes - 1;
  return {
    inicio: new Date(Date.UTC(ano, mesInicio, 26)),
    fimExclusivo: new Date(Date.UTC(ano, mesInicio + 1, 26)),
  };
}

/**
 * Período da folha deslocado em `n` ciclos a partir do ciclo que contém `data`
 * (n negativo = ciclos anteriores; usado para ver meses passados e comparativos).
 */
export function periodoFolhaDeslocado(
  data: Date,
  n: number,
): { inicio: Date; fimExclusivo: Date } {
  const base = periodoFolha(data);
  const ano = base.inicio.getUTCFullYear();
  const mes = base.inicio.getUTCMonth();
  return {
    inicio: new Date(Date.UTC(ano, mes + n, 26)),
    fimExclusivo: new Date(Date.UTC(ano, mes + n + 1, 26)),
  };
}

/**
 * Rótulo curto do ciclo de folha (ex.: "26/06 – 25/07"). Usa o `inicio` e o
 * último dia (dia 25 = fimExclusivo menos um dia).
 */
export function rotuloPeriodoFolha(periodo: {
  inicio: Date;
  fimExclusivo: Date;
}): string {
  const fim = new Date(periodo.fimExclusivo);
  fim.setUTCDate(fim.getUTCDate() - 1);
  const dd = (d: Date) => String(d.getUTCDate()).padStart(2, '0');
  const mm = (d: Date) => String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd(periodo.inicio)}/${mm(periodo.inicio)} – ${dd(fim)}/${mm(fim)}`;
}

/** Offset fixo de Brasília (UTC-3, sem horário de verão). */
export const OFFSET_BRASILIA_MS = -3 * 60 * 60 * 1000;

/**
 * "Agora" no fuso de Brasília. As horas do ponto são tratadas nesse fuso; use
 * este helper para o limite "até agora" dos cálculos de jornada do dia atual.
 */
export function agoraNaBrasilia(): Date {
  return new Date(Date.now() + OFFSET_BRASILIA_MS);
}
