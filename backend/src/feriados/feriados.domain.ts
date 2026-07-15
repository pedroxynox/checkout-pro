/**
 * Domínio puro dos feriados NACIONAIS do Brasil.
 *
 * Os feriados nacionais são reconhecidos automaticamente pelo sistema; os
 * estaduais e municipais são cadastrados manualmente pelo gestor (ficam no
 * banco). Um feriado tem, para efeito de jornada, a MESMA regra do domingo:
 * carga-base de domingo e horas extras com adicional de 100% — porém sem o
 * rodízio por grupos (isso é exclusivo do domingo).
 *
 * Sem efeitos colaterais: apenas cálculo de datas (testável isoladamente).
 */
import { inicioDoDia } from '../common/datas';

export interface FeriadoNacional {
  /** Data (00:00 UTC) do feriado no ano consultado. */
  data: Date;
  /** Nome do feriado. */
  nome: string;
}

/**
 * Domingo de Páscoa (algoritmo "Anonymous Gregorian" / Computus de Gauss) do
 * ano informado, em 00:00 UTC. Base para os feriados móveis.
 */
export function domingoDePascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); // 3 = março, 4 = abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/** Soma `dias` a uma data (00:00 UTC), retornando nova data. */
function somarDias(data: Date, dias: number): Date {
  const d = new Date(data);
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

/**
 * Feriados NACIONAIS do Brasil no ano informado. Inclui os fixos em lei e a
 * Sexta-feira Santa (móvel, dois dias antes da Páscoa). Não inclui pontos
 * facultativos (Carnaval, Corpus Christi): se a unidade os observa, o gestor os
 * cadastra manualmente.
 *
 * Consciência Negra (20/11) é feriado nacional desde a Lei 14.759/2023.
 */
export function feriadosNacionais(ano: number): FeriadoNacional[] {
  const fixos: { mes: number; dia: number; nome: string }[] = [
    { mes: 1, dia: 1, nome: 'Confraternização Universal' },
    { mes: 4, dia: 21, nome: 'Tiradentes' },
    { mes: 5, dia: 1, nome: 'Dia do Trabalho' },
    { mes: 9, dia: 7, nome: 'Independência do Brasil' },
    { mes: 10, dia: 12, nome: 'Nossa Senhora Aparecida' },
    { mes: 11, dia: 2, nome: 'Finados' },
    { mes: 11, dia: 15, nome: 'Proclamação da República' },
    { mes: 11, dia: 20, nome: 'Consciência Negra' },
    { mes: 12, dia: 25, nome: 'Natal' },
  ];
  const lista: FeriadoNacional[] = fixos.map((f) => ({
    data: new Date(Date.UTC(ano, f.mes - 1, f.dia)),
    nome: f.nome,
  }));
  // Móvel: Sexta-feira Santa = 2 dias antes do Domingo de Páscoa.
  lista.push({
    data: somarDias(domingoDePascoa(ano), -2),
    nome: 'Sexta-feira Santa',
  });
  return lista.sort((a, b) => a.data.getTime() - b.data.getTime());
}

/** true se a data (comparada em 00:00 UTC) é um feriado NACIONAL. */
export function ehFeriadoNacional(data: Date): boolean {
  const alvo = inicioDoDia(data).getTime();
  return feriadosNacionais(data.getUTCFullYear()).some(
    (f) => f.data.getTime() === alvo,
  );
}
