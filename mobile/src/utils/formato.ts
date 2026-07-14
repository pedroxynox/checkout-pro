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

/**
 * Máscara de data brasileira (dd/mm/aaaa) aplicada ENQUANTO se digita: mantém
 * só os dígitos (até 8) e insere as barras automaticamente. Ex.: "01052026" →
 * "01/05/2026"; "0105" → "01/05".
 */
export function mascaraDataBR(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/**
 * Converte "dd/mm/aaaa" para ISO "yyyy-mm-dd". Retorna null quando incompleta
 * ou inválida (dia/mês fora de faixa ou data inexistente, ex.: 31/02/2026).
 */
export function dataBRParaISO(dmy: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy.trim());
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.getUTCDate() !== dia) return null;
  return iso;
}

/** Converte uma data ISO (yyyy-mm-dd, com ou sem hora) para "dd/mm/aaaa". */
export function isoParaDataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.slice(0, 10));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
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
  if (!Number.isFinite(ms)) return '0min';
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const horas = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (horas <= 0) {
    return `${min}min`;
  }
  return `${horas}h ${min.toString().padStart(2, '0')}min`;
}


/**
 * Máscara de milhar (pt-BR) aplicada ENQUANTO se digita um valor em R$: agrupa
 * a parte inteira com ponto a cada 3 dígitos e aceita uma vírgula decimal (até
 * 2 casas). Ex.: "1000" → "1.000"; "1000000" → "1.000.000"; "1234,5" →
 * "1.234,5"; "0,75" → "0,75". Descarta caracteres inválidos.
 */
export function mascaraMilhar(texto: string): string {
  if (!texto) return '';
  const limpo = texto.replace(/[^\d,]/g, '');
  const idx = limpo.indexOf(',');
  const temVirgula = idx !== -1;
  let inteiro = temVirgula ? limpo.slice(0, idx) : limpo;
  const decimal = temVirgula
    ? limpo
        .slice(idx + 1)
        .replace(/,/g, '')
        .slice(0, 2)
    : '';
  // Remove zeros à esquerda (mantém um único zero quando é só "0").
  inteiro = inteiro.replace(/^0+(?=\d)/, '');
  const inteiroFmt = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return inteiroFmt + (temVirgula ? `,${decimal}` : '');
}

/**
 * Converte um número no formato pt-BR ("1.234,5") para número JS (1234.5).
 * Remove os pontos de milhar e troca a vírgula decimal por ponto. Retorna 0
 * quando vazio/ inválido.
 */
export function parseNumeroBR(texto: string): number {
  const s = texto.replace(/\./g, '').replace(',', '.').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
