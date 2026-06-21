/** Funções de formatação em pt-BR: moeda, número, percentual e datas. */

export function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(valor) ? valor : 0);
}

export function formatarNumero(valor: number): string {
  return new Intl.NumberFormat('pt-BR').format(
    Number.isFinite(valor) ? valor : 0,
  );
}

export function formatarPercentual(valor: number, casas = 2): string {
  const seguro = Number.isFinite(valor) ? valor : 0;
  return `${seguro.toFixed(casas).replace('.', ',')}%`;
}

/**
 * Deslocamento de Brasília em relação ao UTC (UTC−3). O Brasil não adota
 * horário de verão desde 2019, então o offset é fixo. Usamos isto para que
 * "hoje" e o dia da semana correspondam sempre ao **dia-calendário de
 * Brasília**, independentemente do fuso do dispositivo/servidor (que pode
 * estar em UTC — caso em que, após as 21h de Brasília, o UTC já virou o dia
 * seguinte).
 */
const OFFSET_BRASILIA_MS = -3 * 60 * 60 * 1000;

/** Instante atual deslocado para Brasília (para extrair dia/dia da semana). */
function agoraEmBrasilia(): Date {
  return new Date(Date.now() + OFFSET_BRASILIA_MS);
}

/** Hoje (dia-calendário de Brasília) em formato ISO (yyyy-mm-dd). */
export function hojeISO(): string {
  return agoraEmBrasilia().toISOString().slice(0, 10);
}

/** Dia da semana de hoje em Brasília: 0 (domingo) – 6 (sábado). */
export function diaSemanaHoje(): number {
  return agoraEmBrasilia().getUTCDay();
}

/** Formata uma data ISO/Date para dd/mm/aaaa. */
export function formatarData(valor: string | Date): string {
  const data = typeof valor === 'string' ? new Date(valor) : valor;
  if (Number.isNaN(data.getTime())) {
    return '--';
  }
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(data);
}

/** Formata uma data ISO/Date para dd/mm/aaaa HH:mm (horário local). */
export function formatarDataHora(valor: string | Date): string {
  const data = typeof valor === 'string' ? new Date(valor) : valor;
  if (Number.isNaN(data.getTime())) {
    return '--';
  }
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(data);
}

/** Formata a hora (HH:mm) de uma data ISO/Date no horário local. */
export function formatarHora(valor: string | Date): string {
  const data = typeof valor === 'string' ? new Date(valor) : valor;
  if (Number.isNaN(data.getTime())) {
    return '--';
  }
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(data);
}

export const DIAS_SEMANA = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const;

export const DIAS_SEMANA_CURTO = [
  'Dom',
  'Seg',
  'Ter',
  'Qua',
  'Qui',
  'Sex',
  'Sáb',
] as const;


/** Formata uma duração em milissegundos como "Xh Ymin" (ou "Ymin"). */
export function formatarDuracao(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const horas = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (horas <= 0) {
    return `${min}min`;
  }
  return `${horas}h ${min.toString().padStart(2, '0')}min`;
}
