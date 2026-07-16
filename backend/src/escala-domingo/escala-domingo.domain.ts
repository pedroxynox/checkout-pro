/**
 * Rodízio de domingo (função pura, fácil de testar).
 *
 * O domingo funciona por rodízio de 3 grupos (G1, G2, G3): a cada domingo um
 * grupo **folga** e os outros dois trabalham. A rotação avança um grupo por
 * domingo, na ordem G1 → G2 → G3 → G1…, de modo que cada grupo trabalha 2
 * domingos e folga 1.
 *
 * Para "ancorar" o rodízio à realidade basta UM ponto de partida: um domingo de
 * referência e qual grupo folga nele. A partir daí o grupo que folga em
 * qualquer outro domingo é determinístico.
 */

export type GrupoDomingo = 'G1' | 'G2' | 'G3';
export const GRUPOS_DOMINGO: GrupoDomingo[] = ['G1', 'G2', 'G3'];

const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

/** Normaliza para meia-noite UTC (ignora hora, evita erros de fuso). */
function meiaNoiteUTC(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

/** true se `data` é um domingo (UTC). */
export function ehDomingo(data: Date): boolean {
  return data.getUTCDay() === 0;
}

/** Número de semanas (domingos) entre duas datas — pode ser negativo. */
function semanasEntre(de: Date, ate: Date): number {
  return Math.round(
    (meiaNoiteUTC(ate).getTime() - meiaNoiteUTC(de).getTime()) / SEMANA_MS,
  );
}

/** É um grupo válido (G1/G2/G3)? */
export function ehGrupoValido(g: string | null | undefined): g is GrupoDomingo {
  return g === 'G1' || g === 'G2' || g === 'G3';
}

/**
 * A ORDEM do ciclo é a sequência de grupos que folga em cada domingo do ciclo
 * (ex.: ['G1','G3','G2'] = 1º domingo folga G1, 2º folga G3, 3º folga G2, e
 * repete). Deve ser uma permutação dos 3 grupos (cada um folga uma vez por
 * ciclo).
 */
export function ordemValida(
  ordem: readonly string[] | null | undefined,
): ordem is GrupoDomingo[] {
  if (!ordem || ordem.length !== 3) return false;
  return GRUPOS_DOMINGO.every((g) => ordem.filter((x) => x === g).length === 1);
}

/**
 * Grupo que **folga** num domingo, dada a referência (1º domingo do ciclo) e a
 * ORDEM do ciclo. A sequência não é fixa: segue exatamente a ordem informada e
 * repete a cada 3 domingos. Ex.: ref=19/07 e ordem=['G1','G3','G2'] → 19/07
 * folga G1, 26/07 folga G3, 02/08 folga G2, 09/08 folga G1 de novo.
 */
export function grupoFolgaNoDomingo(
  dataDomingo: Date,
  refData: Date,
  ordem: readonly GrupoDomingo[],
): GrupoDomingo {
  const n = semanasEntre(refData, dataDomingo);
  const idx = ((n % ordem.length) + ordem.length) % ordem.length;
  return ordem[idx];
}

/**
 * O colaborador (do grupo informado) trabalha nesse domingo? Sem grupo (null) =
 * fora do rodízio → não trabalha aos domingos (folga fixa).
 */
export function trabalhaNoDomingo(
  grupoColaborador: string | null | undefined,
  dataDomingo: Date,
  refData: Date,
  ordem: readonly GrupoDomingo[],
): boolean {
  if (!ehGrupoValido(grupoColaborador)) return false;
  return grupoFolgaNoDomingo(dataDomingo, refData, ordem) !== grupoColaborador;
}

/** O primeiro domingo >= `apartir` (o próprio dia se já for domingo). */
export function proximoDomingo(apartir: Date): Date {
  const base = meiaNoiteUTC(apartir);
  const add = (7 - base.getUTCDay()) % 7;
  base.setUTCDate(base.getUTCDate() + add);
  return base;
}

/** Os próximos `n` domingos a partir de uma data (inclui o dia se for domingo). */
export function proximosDomingos(apartir: Date, n: number): Date[] {
  const primeiro = proximoDomingo(apartir);
  const out: Date[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(primeiro);
    d.setUTCDate(d.getUTCDate() + 7 * i);
    out.push(d);
  }
  return out;
}

/**
 * Decide se `dia` é FOLGA (descanso) do colaborador. Regra unificada usada pelo
 * Relógio Ponto para bloquear o fichaje em dia de folga, para fiscais e
 * operadores (a folga dos dois vem do mesmo cadastro: `folgaDiaSemana` +
 * `grupoDomingo`).
 *
 * - Segunda a sábado: folga fixa do cadastro (`folgaDiaSemana`).
 * - Domingo: rodízio por grupos. Sem grupo (fora do rodízio) = folga fixa de
 *   domingo. Com grupo mas SEM âncora configurada, não afirmamos folga (evita
 *   bloquear por engano enquanto o rodízio não foi definido) — devolve false.
 *
 * `dia` deve estar em meia-noite UTC do dia civil (padrão do sistema); o dia da
 * semana é lido em UTC.
 */
export function ehDiaDeFolga(
  ficha: { folgaDiaSemana: number | null; grupoDomingo: string | null },
  dia: Date,
  ancoraDomingo: { data: Date; ordem: readonly GrupoDomingo[] } | null,
): boolean {
  if (dia.getUTCDay() === 0) {
    // Folga fixa explícita no domingo (folgaDiaSemana = 0) sempre prevalece.
    if (ficha.folgaDiaSemana === 0) return true;
    // Fora do rodízio (sem grupo) = folga fixa aos domingos.
    if (!ehGrupoValido(ficha.grupoDomingo)) return true;
    // Tem grupo, mas o rodízio ainda não foi ancorado: não dá para afirmar.
    if (!ancoraDomingo) return false;
    return !trabalhaNoDomingo(
      ficha.grupoDomingo,
      dia,
      ancoraDomingo.data,
      ancoraDomingo.ordem,
    );
  }
  return (
    ficha.folgaDiaSemana != null && dia.getUTCDay() === ficha.folgaDiaSemana
  );
}

/** Cadastro de escala usado para comparar a marcação com o turno. */
export interface FichaEscala {
  folgaDiaSemana: number | null;
  grupoDomingo: string | null;
  entradaSemana: string | null;
  entradaFds: string | null;
  entradaDom: string | null;
}

/**
 * Horário de ENTRADA esperado (turno) do colaborador no dia, no formato "HH:mm",
 * ou null quando não há turno: dia de folga, domingo fora do rodízio ou horário
 * não cadastrado. Seg–Qui usam o horário de semana; Sex–Sáb o de fim de semana;
 * domingo o horário de domingo (só quando o rodízio manda trabalhar).
 */
export function entradaEsperadaNoDia(
  ficha: FichaEscala,
  dia: Date,
  ancoraDomingo: { data: Date; ordem: readonly GrupoDomingo[] } | null,
): string | null {
  if (ehDiaDeFolga(ficha, dia, ancoraDomingo)) return null;
  const dow = dia.getUTCDay();
  if (dow === 0) {
    // Só afirmamos o turno de domingo quando o rodízio está ancorado; sem
    // âncora não dá para saber se a pessoa trabalha nesse domingo (evita
    // apontar atraso por engano).
    return ancoraDomingo ? (ficha.entradaDom ?? null) : null;
  }
  if (dow >= 1 && dow <= 4) return ficha.entradaSemana ?? null;
  return ficha.entradaFds ?? null;
}

/** Tolerância padrão (minutos) antes de considerar a entrada como atraso. */
export const TOLERANCIA_ATRASO_MIN = 15;

/**
 * Minutos TOTAIS de atraso na entrada (contados a partir do horário do turno),
 * devolvidos somente quando ultrapassam a tolerância; caso contrário null — o
 * que também cobre "sem turno esperado" e "chegou dentro da tolerância". A hora
 * da batida está em hora de parede de Brasília (rotulada UTC), na mesma
 * referência do "HH:mm" do turno — por isso comparamos direto os componentes UTC.
 */
export function minutosDeAtraso(
  entradaPrevista: string | null,
  entradaReal: Date,
  tolerancia: number = TOLERANCIA_ATRASO_MIN,
): number | null {
  if (!entradaPrevista) return null;
  const [h, m] = entradaPrevista.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const previstoMin = h * 60 + m;
  const realMin = entradaReal.getUTCHours() * 60 + entradaReal.getUTCMinutes();
  const atraso = realMin - previstoMin;
  return atraso > tolerancia ? atraso : null;
}
