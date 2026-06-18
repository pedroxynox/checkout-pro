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

/** Converte uma Date para ISO de data (yyyy-mm-dd), em UTC. */
export function dataParaISO(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/** Hoje em formato ISO (yyyy-mm-dd). */
export function hojeISO(): string {
  return dataParaISO(new Date());
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
