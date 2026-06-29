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
