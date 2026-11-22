/**
 * Durações em texto, para as mensagens que citam os números do contrato
 * (spec `jornada-5x2`, R2.5): "Excedeu 1h10 de horas extras", "Faltam 20
 * minutos para o limite de TAC". Um lugar só, para o mesmo número não sair
 * escrito de dois jeitos.
 */

/** Minutos em texto curto: "8h48", "2h", "50 min", "0 min". */
export function textoDuracao(minutos: number): string {
  const sinal = minutos < 0 ? '-' : '';
  const total = Math.abs(Math.round(minutos));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${sinal}${m} min`;
  return m === 0
    ? `${sinal}${h}h`
    : `${sinal}${h}h${String(m).padStart(2, '0')}`;
}

/**
 * Como `textoDuracao`, mas com "minutos" por extenso abaixo de 1 h: "20
 * minutos", "1 minuto", "1h10". É o formato das frases ("faltam 20 minutos").
 */
export function textoDuracaoExtenso(minutos: number): string {
  const total = Math.abs(Math.round(minutos));
  if (total >= 60) return textoDuracao(minutos);
  const sinal = minutos < 0 ? '-' : '';
  return `${sinal}${total} ${total === 1 ? 'minuto' : 'minutos'}`;
}

/** Milissegundos → minutos (para usar os formatadores acima). */
export function minutosDeMs(ms: number): number {
  return ms / 60_000;
}
