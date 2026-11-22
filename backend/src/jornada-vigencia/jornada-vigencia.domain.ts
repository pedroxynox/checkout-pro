/**
 * Jornada prevista do dia — domínio puro (spec `jornada-5x2`, ADR 0027).
 *
 * Responde, para uma pessoa e um dia: ela folga? A que horas entra e sai? Qual a
 * carga, se o dia paga 100% e se gera débito — e com as regras de qual contrato.
 *
 * Há dois regimes:
 *
 * - **Legado (6x1):** os dias ANTES da primeira vigência da pessoa. É o código de
 *   hoje sobre a ficha de hoje (`Colaborador.folgaDiaSemana`, blocos Seg–Qui,
 *   Sex–Sáb e Dom, `grupoDomingo`, `tipoContratoJornadaId`). Por construção, sem
 *   vigência o resultado é idêntico ao de antes desta peça existir.
 * - **Semanal (5x2):** os dias cobertos por uma vigência — disponibilidade por dia,
 *   grupo do rodízio de folgas ou folgas fixas, contrato da vigência.
 *
 * Sem Prisma e sem relógio: quem chama carrega os dados (ver
 * `JornadaVigenciaService.consultor`).
 */
import {
  FichaEscalaTurno,
  GrupoDomingo,
  ehDiaDeFolga,
  ehGrupoValido,
  entradaEsperadaNoDia,
  saidaEsperadaNoDia,
} from '../escala-domingo/escala-domingo.domain';
import {
  RegrasContrato,
  cargaBaseDoDia,
  diaPagaAdicional100,
} from '../ponto/ponto.domain';

/** Ordem em que a semana é mostrada e conferida: de segunda a domingo. */
export const DIAS_SEGUNDA_A_DOMINGO: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

const NOMES_DIA = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
];

const SABADO = 6;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MINUTO_MS = 60_000;

/** Horário de um dia da semana ("HH:mm"). */
export interface HorarioDoDia {
  entrada: string;
  saida: string;
}

/** Uma vigência da jornada (linha de `jornada_vigencias` + disponibilidade). */
export interface VigenciaJornada {
  id: string;
  /** Primeiro dia (00:00 UTC). */
  vigenteDesde: Date;
  tipoContratoJornadaId: string;
  grupo: GrupoDomingo | null;
  /** Folgas fixas (0=domingo … 6=sábado); só quando não há grupo. */
  folgasFixas: readonly number[];
  /** Disponibilidade por dia da semana (0=domingo). Sem chave = sem horário. */
  disponibilidade: ReadonlyMap<number, HorarioDoDia>;
}

/** Ficha legada (6x1): os campos de escala e contrato do `Colaborador`. */
export interface FichaLegada extends FichaEscalaTurno {
  tipoContratoJornadaId: string;
}

/** Tudo o que decide a jornada de uma pessoa em qualquer dia. */
export interface JornadaDaPessoa {
  colaboradorId: string;
  legado: FichaLegada;
  /** Em qualquer ordem; `vigenciaNoDia` escolhe a do dia. */
  vigencias: readonly VigenciaJornada[];
}

export type RegimeJornada = 'LEGADO_6X1' | 'SEMANAL';

/** A jornada prevista de uma pessoa num dia. */
export interface JornadaPrevista {
  regime: RegimeJornada;
  /** Vigência que decidiu o dia; null no regime legado. */
  vigenciaId: string | null;
  tipoContratoJornadaId: string;
  regras: RegrasContrato;
  grupo: GrupoDomingo | null;
  /** A pessoa descansa nesse dia (regra única de folga). */
  folga: boolean;
  /**
   * Entrada esperada ("HH:mm") ou null.
   *
   * **No regime legado é exatamente `entradaEsperadaNoDia` de hoje**, que não
   * olha a folga afirmada só pela escala semanal (`EscalaEntry`). Quem precisa
   * saber se a pessoa está escalada combina `!folga && entrada != null`, como já
   * fazia — ou usa `escalado`. No regime semanal a entrada já vem nula na folga.
   */
  entrada: string | null;
  saida: string | null;
  /** `!folga && entrada != null`. */
  escalado: boolean;
  /** Carga do dia (`cargaBaseDoDia`). */
  cargaMs: number;
  /** Extras a 100% (domingo/feriado conforme o contrato). */
  contaComo100: boolean;
  /** Déficit e falta podem virar débito (= `!contaComo100`). */
  geraDebito: boolean;
}

/** O que, além da pessoa, decide o dia. */
export interface ContextoDoDia {
  /** Regras de um tipo de contrato (já resolvidas pelo serviço). */
  regras: (tipoContratoJornadaId: string) => RegrasContrato;
  ehFeriado: boolean;
  /** Âncora do rodízio ANTIGO de domingo (regime legado). */
  ancoraDomingo: { data: Date; ordem: readonly GrupoDomingo[] } | null;
  /** Regime legado: a escala semanal (`EscalaEntry`) afirma folga nesse dia. */
  folgaNaEscalaSemanal: boolean;
  /**
   * Regime semanal com grupo: os dias de folga do grupo na semana do dia, ou
   * null quando não há rodízio de folgas vigente (Fase 3). Ausente = sem rodízio.
   */
  folgasDoGrupo?: (grupo: GrupoDomingo, dia: Date) => readonly number[] | null;
  /** Folgas fixas padrão do contrato (Fase 2). Ausente = nenhuma. */
  folgasFixasPadrao?: (tipoContratoJornadaId: string) => readonly number[];
}

function meiaNoiteUTC(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** A vigência que decide o dia: a de maior início que não seja posterior a ele. */
export function vigenciaNoDia(
  vigencias: readonly VigenciaJornada[],
  dia: Date,
): VigenciaJornada | null {
  const alvo = meiaNoiteUTC(dia);
  let escolhida: VigenciaJornada | null = null;
  for (const v of vigencias) {
    const inicio = meiaNoiteUTC(v.vigenteDesde);
    if (inicio > alvo) continue;
    if (!escolhida || inicio > meiaNoiteUTC(escolhida.vigenteDesde)) {
      escolhida = v;
    }
  }
  return escolhida;
}

/** As folgas fixas que valem: as da ficha ou, se vazias, as padrão do contrato. */
export function folgasFixasEfetivas(
  vigencia: Pick<VigenciaJornada, 'folgasFixas'>,
  padraoDoContrato: readonly number[],
): readonly number[] {
  return vigencia.folgasFixas.length > 0
    ? vigencia.folgasFixas
    : padraoDoContrato;
}

/** Jornada prevista de uma pessoa num dia (design §3.1). */
export function previstoNoDia(
  pessoa: JornadaDaPessoa,
  dia: Date,
  ctx: ContextoDoDia,
): JornadaPrevista {
  const dow = dia.getUTCDay();
  const v = vigenciaNoDia(pessoa.vigencias, dia);

  if (!v) {
    // REGIME LEGADO: as mesmas chamadas, na mesma ordem de decisão, que o
    // `FolgaService` e os consumidores de `entradaEsperadaNoDia` fazem hoje.
    const ficha = pessoa.legado;
    const regras = ctx.regras(ficha.tipoContratoJornadaId);
    const folga =
      ficha.folgaDiaSemana != null
        ? ehDiaDeFolga(ficha, dia, ctx.ancoraDomingo)
        : ctx.folgaNaEscalaSemanal ||
          ehDiaDeFolga(ficha, dia, ctx.ancoraDomingo);
    const entrada = entradaEsperadaNoDia(
      ficha,
      dia,
      ctx.ancoraDomingo,
      ctx.ehFeriado,
    );
    const saida = saidaEsperadaNoDia(
      ficha,
      dia,
      ctx.ancoraDomingo,
      ctx.ehFeriado,
    );
    return montar('LEGADO_6X1', null, ficha.tipoContratoJornadaId, regras, {
      grupo: ehGrupoValido(ficha.grupoDomingo) ? ficha.grupoDomingo : null,
      folga,
      entrada,
      saida,
      dow,
      ehFeriado: ctx.ehFeriado,
    });
  }

  // REGIME SEMANAL.
  const regras = ctx.regras(v.tipoContratoJornadaId);
  let folga: boolean;
  let afirmaTurno = true;
  if (v.grupo) {
    const doGrupo = ctx.folgasDoGrupo?.(v.grupo, dia) ?? null;
    if (doGrupo == null) {
      // Grupo sem rodízio vigente: não dá para dizer se folga nem cobrar turno
      // (mesmo cuidado do domingo sem âncora no regime legado).
      folga = false;
      afirmaTurno = false;
    } else {
      folga = doGrupo.includes(dow);
    }
  } else {
    const padrao = ctx.folgasFixasPadrao?.(v.tipoContratoJornadaId) ?? [];
    folga = folgasFixasEfetivas(v, padrao).includes(dow);
  }
  // Feriado usa a disponibilidade do próprio dia da semana (decisão 9).
  const horario = folga || !afirmaTurno ? null : v.disponibilidade.get(dow);
  return montar('SEMANAL', v.id, v.tipoContratoJornadaId, regras, {
    grupo: v.grupo,
    folga,
    entrada: horario?.entrada ?? null,
    saida: horario?.saida ?? null,
    dow,
    ehFeriado: ctx.ehFeriado,
  });
}

function montar(
  regime: RegimeJornada,
  vigenciaId: string | null,
  tipoContratoJornadaId: string,
  regras: RegrasContrato,
  dados: {
    grupo: GrupoDomingo | null;
    folga: boolean;
    entrada: string | null;
    saida: string | null;
    dow: number;
    ehFeriado: boolean;
  },
): JornadaPrevista {
  const contaComo100 = diaPagaAdicional100(dados.dow, dados.ehFeriado, regras);
  return {
    regime,
    vigenciaId,
    tipoContratoJornadaId,
    regras,
    grupo: dados.grupo,
    folga: dados.folga,
    entrada: dados.entrada,
    saida: dados.saida,
    escalado: !dados.folga && dados.entrada != null,
    cargaMs: cargaBaseDoDia(dados.dow, dados.ehFeriado, regras),
    contaComo100,
    geraDebito: !contaComo100,
  };
}

// ---------------------------------------------------------------------------
// Conferência da vigência (R4.6, decisão 16) — avisa, não bloqueia.
// ---------------------------------------------------------------------------

export type TipoAvisoJornada =
  'DIA_SEM_HORARIO' | 'DISPONIBILIDADE_FORA_DA_CARGA' | 'SEM_FOLGA';

export interface AvisoJornada {
  tipo: TipoAvisoJornada;
  /** Dia da semana (0=domingo) a que o aviso se refere, quando há um. */
  diaSemana: number | null;
  mensagem: string;
}

/** "HH:mm" → minutos do dia; null se o texto não for um horário. */
export function minutosDoDia(hhmm: string): number | null {
  if (!HHMM.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

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
 * Avisos sobre uma vigência (sem bloquear o salvamento).
 *
 * Para cada dia que **pode** ser de trabalho — com grupo, todos (o rodízio gira
 * e o sábado nunca é folga de grupo); sem grupo, os que não são folga fixa:
 *
 * - `DIA_SEM_HORARIO`: falta a disponibilidade (o sistema não cobra ponto).
 * - `DISPONIBILIDADE_FORA_DA_CARGA`: o intervalo que a disponibilidade deixa,
 *   `(saída − entrada) − carga do dia`, não cabe entre o intervalo mínimo e o
 *   máximo do contrato. A tolerância é o próprio contrato: a equipe hoje faz 2h
 *   e pode passar a 1h ou 1h30 sem mexer em nada. Intervalo **zero** é aceito
 *   numa jornada curta, quando o contrato não exige intervalo.
 *
 * E, sem grupo e sem nenhuma folga (nem na ficha nem no contrato), `SEM_FOLGA`.
 */
export function avisosDaVigencia(
  vigencia: Pick<VigenciaJornada, 'grupo' | 'folgasFixas' | 'disponibilidade'>,
  regras: RegrasContrato,
  folgasFixasPadrao: readonly number[] = [],
): AvisoJornada[] {
  const avisos: AvisoJornada[] = [];
  const folgas = vigencia.grupo
    ? []
    : folgasFixasEfetivas(vigencia, folgasFixasPadrao);

  if (!vigencia.grupo && folgas.length === 0) {
    avisos.push({
      tipo: 'SEM_FOLGA',
      diaSemana: null,
      mensagem:
        'Sem grupo e sem folga fixa: a pessoa fica escalada os sete dias da semana.',
    });
  }

  for (const dow of DIAS_SEGUNDA_A_DOMINGO) {
    if (folgas.includes(dow)) continue;
    const horario = vigencia.disponibilidade.get(dow);
    if (!horario) {
      avisos.push({
        tipo: 'DIA_SEM_HORARIO',
        diaSemana: dow,
        mensagem: `Sem horário na ${NOMES_DIA[dow]}: nesse dia o sistema não cobra ponto.`,
      });
      continue;
    }
    const inicio = minutosDoDia(horario.entrada);
    const fim = minutosDoDia(horario.saida);
    if (inicio == null || fim == null) continue; // `validarVigencia` recusa
    const cargaMin = regras.cargaBaseMs(dow) / MINUTO_MS;
    const intervaloMin = fim - inicio - cargaMin;
    if (cabeNoContrato(intervaloMin, cargaMin, regras)) continue;
    avisos.push({
      tipo: 'DISPONIBILIDADE_FORA_DA_CARGA',
      diaSemana: dow,
      mensagem:
        `Na ${NOMES_DIA[dow]}, ${horario.entrada}–${horario.saida} deixa ` +
        `${textoDuracao(intervaloMin)} de intervalo para a carga de ` +
        `${textoDuracao(cargaMin)}; o contrato aceita de ` +
        `${textoDuracao(regras.intervaloMinimoMs / MINUTO_MS)} a ` +
        `${textoDuracao(regras.intervaloMaximoMs / MINUTO_MS)}.`,
    });
  }
  return avisos;
}

function cabeNoContrato(
  intervaloMin: number,
  cargaMin: number,
  regras: RegrasContrato,
): boolean {
  const minimo = regras.intervaloMinimoMs / MINUTO_MS;
  const maximo = regras.intervaloMaximoMs / MINUTO_MS;
  if (intervaloMin >= minimo && intervaloMin <= maximo) return true;
  // Jornada curta sem intervalo, permitida quando o contrato não o exige.
  return (
    intervaloMin === 0 &&
    !regras.intervaloObrigatorio &&
    cargaMin <= regras.maxTrabalhoSemIntervaloMs / MINUTO_MS
  );
}

// ---------------------------------------------------------------------------
// Validação da vigência (bloqueia o salvamento — 400).
// ---------------------------------------------------------------------------

/** O que se grava numa vigência, como chega da API. */
export interface EntradaVigencia {
  grupo: string | null;
  folgasFixas: readonly number[];
  disponibilidade: readonly {
    diaSemana: number;
    entrada: string;
    saida: string;
  }[];
}

/** Limites que vêm do contrato (Fase 2). */
export interface LimitesDeFolga {
  maxFolgasFixas: number;
  permiteFolgaSabado: boolean;
}

/** Erros que impedem gravar a vigência (lista vazia = válida). */
export function validarVigencia(
  entrada: EntradaVigencia,
  limites: LimitesDeFolga,
): string[] {
  const erros: string[] = [];

  if (entrada.grupo != null && !ehGrupoValido(entrada.grupo)) {
    erros.push('Grupo deve ser G1, G2 ou G3.');
  }
  if (entrada.grupo != null && entrada.folgasFixas.length > 0) {
    erros.push('Quem tem grupo folga pelo rodízio; não informe folgas fixas.');
  }

  const folgas = new Set<number>();
  for (const d of entrada.folgasFixas) {
    if (!Number.isInteger(d) || d < 0 || d > 6) {
      erros.push(`Folga fixa inválida: ${d}.`);
      continue;
    }
    if (folgas.has(d)) erros.push(`Folga fixa repetida: ${NOMES_DIA[d]}.`);
    folgas.add(d);
  }
  if (folgas.size > limites.maxFolgasFixas) {
    erros.push(
      `No máximo ${limites.maxFolgasFixas} folga(s) fixa(s) por semana neste contrato.`,
    );
  }
  if (folgas.has(SABADO) && !limites.permiteFolgaSabado) {
    erros.push('Este contrato não permite folga no sábado.');
  }

  const dias = new Set<number>();
  for (const h of entrada.disponibilidade) {
    if (!Number.isInteger(h.diaSemana) || h.diaSemana < 0 || h.diaSemana > 6) {
      erros.push(`Dia da semana inválido: ${h.diaSemana}.`);
      continue;
    }
    const nome = NOMES_DIA[h.diaSemana];
    if (dias.has(h.diaSemana)) erros.push(`Horário repetido na ${nome}.`);
    dias.add(h.diaSemana);
    const inicio = minutosDoDia(h.entrada);
    const fim = minutosDoDia(h.saida);
    if (inicio == null || fim == null) {
      erros.push(`Na ${nome}, entrada e saída devem ser HH:mm.`);
      continue;
    }
    if (fim <= inicio) {
      erros.push(`Na ${nome}, a saída deve ser depois da entrada.`);
    }
  }
  return erros;
}
