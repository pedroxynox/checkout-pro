/**
 * Utilitários puros de período (dia/semana/mês) em UTC para o módulo de vendas,
 * alinhados ao armazenamento das datas em meia-noite UTC.
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
