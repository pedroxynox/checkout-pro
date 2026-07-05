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
