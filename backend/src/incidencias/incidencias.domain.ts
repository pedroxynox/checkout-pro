/**
 * Lógica de domínio **pura** das Incidências de Escala.
 *
 * Não depende do Nest nem do Prisma. Concentra:
 *  - a derivação do horário esperado de retorno do intervalo a partir do
 *    horário de saída + a duração do intervalo (da escala);
 *  - a detecção do "não retorno do intervalo" a partir do log de transições de
 *    ponto (para fiscais);
 *  - a analítica inteligente das incidências (taxa, padrões, tendência e
 *    risco), espelhando as heurísticas de `analisarFaltas` do módulo de
 *    operadores para manter consistência;
 *  - a linha do tempo unificada (faltas + incidências) e o ranking por
 *    colaborador.
 *
 * Por serem puras e determinísticas, podem ser exercitadas por testes de
 * propriedade (fast-check) sem qualquer infraestrutura.
 */

/**
 * Tipos de incidência de escala (espelho do enum Prisma). O desenho é genérico
 * por `tipo` (ver ADR 0007), então novos eventos entram apenas somando um valor
 * aqui (+ enum Prisma + espelho mobile), sem tabelas novas.
 */
export type TipoIncidencia =
  | 'NAO_RETORNO_INTERVALO'
  | 'ATRASO'
  | 'SAIDA_ANTECIPADA'
  | 'RETORNO_TARDIO'
  | 'ADVERTENCIA'
  | 'SUSPENSAO';

/** Todos os tipos conhecidos (fonte única para partições e mapas). */
export const TIPOS_INCIDENCIA: readonly TipoIncidencia[] = [
  'NAO_RETORNO_INTERVALO',
  'ATRASO',
  'SAIDA_ANTECIPADA',
  'RETORNO_TARDIO',
  'ADVERTENCIA',
  'SUSPENSAO',
] as const;

/**
 * Onde uma incidência é **registrada** na experiência:
 * - `ESCALA`: marcada com um toque na tela de Escala (ex.: não-retorno);
 * - `PERFIL`: lançada no perfil do colaborador (ex.: advertência, suspensão);
 * - `null`: **legado** — o tipo existe (dados/histórico) mas não é mais
 *   oferecido para registro em nenhuma tela.
 */
export type LocalRegistro = 'ESCALA' | 'PERFIL' | null;

/** Metadados de um tipo de incidência (fonte única de rótulo/regras). */
export interface MetaTipoIncidencia {
  /** Rótulo curto em pt-BR para exibição/avisos. */
  rotulo: string;
  /**
   * Penaliza a **Disciplina** no Score de Saúde do colaborador. Hoje todos os
   * tipos são disciplinares; a coluna existe para permitir, no futuro, tipos
   * puramente informativos sem tocar no cálculo do score.
   */
  penalizaDisciplina: boolean;
  /**
   * Pode ser **auto-detectado** a partir do ponto dos fiscais. Só o não-retorno
   * do intervalo é derivável do ponto; os demais são lançamentos manuais.
   */
  autoDetectavel: boolean;
  /** Faz uso dos horários (saída/esperado/real). Ex.: advertência/suspensão não. */
  usaHorarios: boolean;
  /** Onde o tipo é registrado (ou `null` se legado/não registrável). */
  registro: LocalRegistro;
}

/** Mapa de metadados por tipo (partição total de `TIPOS_INCIDENCIA`). */
export const META_TIPO_INCIDENCIA: Record<TipoIncidencia, MetaTipoIncidencia> =
  {
    // Marcado na Escala com um toque ("Sem retorno"); sem horário.
    NAO_RETORNO_INTERVALO: {
      rotulo: 'Não retorno do intervalo',
      penalizaDisciplina: true,
      autoDetectavel: true,
      usaHorarios: false,
      registro: 'ESCALA',
    },
    // Legado (não mais oferecido para registro; mantido para dados/histórico).
    ATRASO: {
      rotulo: 'Atraso',
      penalizaDisciplina: true,
      autoDetectavel: false,
      usaHorarios: true,
      registro: null,
    },
    SAIDA_ANTECIPADA: {
      rotulo: 'Saída antecipada',
      penalizaDisciplina: true,
      autoDetectavel: false,
      usaHorarios: true,
      registro: null,
    },
    RETORNO_TARDIO: {
      rotulo: 'Retorno tardio',
      penalizaDisciplina: true,
      autoDetectavel: false,
      usaHorarios: true,
      registro: null,
    },
    // Lançadas no perfil do colaborador; sem horário.
    ADVERTENCIA: {
      rotulo: 'Advertência',
      penalizaDisciplina: true,
      autoDetectavel: false,
      usaHorarios: false,
      registro: 'PERFIL',
    },
    SUSPENSAO: {
      rotulo: 'Suspensão',
      penalizaDisciplina: true,
      autoDetectavel: false,
      usaHorarios: false,
      registro: 'PERFIL',
    },
  };

/**
 * Tipos que penalizam a Disciplina no score (fonte única para a soma ponderada
 * de incidências do perfil). Derivado de `META_TIPO_INCIDENCIA`.
 */
export const TIPOS_DISCIPLINARES: readonly TipoIncidencia[] =
  TIPOS_INCIDENCIA.filter((t) => META_TIPO_INCIDENCIA[t].penalizaDisciplina);

/** Tipos lançados no **perfil** do colaborador (advertência, suspensão). */
export const TIPOS_PERFIL: readonly TipoIncidencia[] = TIPOS_INCIDENCIA.filter(
  (t) => META_TIPO_INCIDENCIA[t].registro === 'PERFIL',
);

/** Rótulo curto (pt-BR) de um tipo de incidência. */
export function rotuloTipoIncidencia(tipo: TipoIncidencia): string {
  return META_TIPO_INCIDENCIA[tipo]?.rotulo ?? tipo;
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Converte "HH:mm" válido em minutos desde a meia-noite, ou null se inválido. */
function hhmmParaMinutos(hhmm: string): number | null {
  if (!HHMM_RE.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Formata minutos desde a meia-noite (0..1439) como "HH:mm". */
function minutosParaHhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Deriva o horário esperado de retorno do intervalo: `horaSaida` + `intervaloMin`
 * minutos, formatado como "HH:mm". O resultado é limitado a "23:59" (não vira o
 * dia). Retorna "" quando a entrada é inválida (horário fora do formato ou
 * intervalo negativo/não-finito).
 */
export function derivarHoraEsperadaRetorno(
  horaSaida: string,
  intervaloMin: number,
): string {
  const base = hhmmParaMinutos(horaSaida);
  if (base === null) return '';
  if (!Number.isFinite(intervaloMin) || intervaloMin < 0) return '';
  const total = base + Math.floor(intervaloMin);
  const limitado = Math.min(total, 23 * 60 + 59);
  return minutosParaHhmm(limitado);
}

/** Uma transição de ponto já ordenada no tempo (status + horário "HH:mm"). */
export interface TransicaoPonto {
  status: 'DISPONIVEL' | 'INTERVALO' | 'FORA_EXPEDIENTE';
  hhmm: string;
}

/** Resultado da detecção de não retorno do intervalo. */
export interface DeteccaoNaoRetorno {
  horaSaida: string;
  horaEsperadaRetorno: string;
}

/**
 * Detecta o "não retorno do intervalo" a partir do log de transições (já
 * ordenado no tempo): procura uma transição para `INTERVALO` que **não** seja
 * seguida por um `DISPONIVEL` antes do próximo `FORA_EXPEDIENTE` (ou do fim do
 * log). Ou seja: o fiscal entrou em intervalo e não voltou a ficar disponível.
 *
 * Retorna o horário de início do intervalo + o horário esperado de retorno
 * (derivado de `intervaloMin`), ou `null` quando todo intervalo teve retorno.
 *
 * Quando `intervaloMin <= 0` (dia sem intervalo previsto na escala, ou valor
 * inválido), não pode existir um "não retorno do intervalo": retorna `null`
 * sem inspecionar o log (Req 4.4).
 */
export function detectarNaoRetorno(
  transicoes: readonly TransicaoPonto[],
  intervaloMin: number,
): DeteccaoNaoRetorno | null {
  if (!Number.isFinite(intervaloMin) || intervaloMin <= 0) return null;
  for (let i = 0; i < transicoes.length; i++) {
    if (transicoes[i].status !== 'INTERVALO') continue;
    // Verifica se, após este INTERVALO, houve DISPONIVEL antes do próximo
    // FORA_EXPEDIENTE (ou do fim). Se não houve, é um não retorno.
    let voltou = false;
    for (let j = i + 1; j < transicoes.length; j++) {
      if (transicoes[j].status === 'DISPONIVEL') {
        voltou = true;
        break;
      }
      if (transicoes[j].status === 'FORA_EXPEDIENTE') {
        break;
      }
    }
    if (!voltou) {
      const horaSaida = transicoes[i].hhmm;
      return {
        horaSaida,
        horaEsperadaRetorno: derivarHoraEsperadaRetorno(
          horaSaida,
          intervaloMin,
        ),
      };
    }
  }
  return null;
}

/** Registro mínimo de incidência para a analítica (tipo + data). */
export interface IncidenciaRegistro {
  tipo: TipoIncidencia;
  data: Date;
}

export type RiscoIncidencia = 'BAIXO' | 'MEDIO' | 'ALTO';
export type TendenciaIncidencia = 'MELHORANDO' | 'ESTAVEL' | 'PIORANDO';

/** Resultado da analítica de incidências de um colaborador no período. */
export interface AnaliseIncidencias {
  total: number;
  porTipo: Record<TipoIncidencia, number>;
  ultimaPorTipo: Record<TipoIncidencia, string | null>;
  frequenciaMensal: number;
  porDiaSemana: number[];
  reincidencia: boolean;
  sequenciaMax: number;
  diasConsecutivosSemIncidencia: number;
  percentualSobreEscalados: number;
  tendencia: TendenciaIncidencia;
  risco: RiscoIncidencia;
}

/** Chave de dia (UTC) em milissegundos (meia-noite). */
function diaUTC(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Maior sequência de incidências em dias civis consecutivos (UTC). */
function maiorSequencia(datas: readonly Date[]): number {
  if (datas.length === 0) return 0;
  const dias = Array.from(new Set(datas.map(diaUTC))).sort((a, b) => a - b);
  const UM_DIA = 24 * 60 * 60 * 1000;
  let melhor = 1;
  let atual = 1;
  for (let i = 1; i < dias.length; i++) {
    if (dias[i] - dias[i - 1] === UM_DIA) {
      atual += 1;
      melhor = Math.max(melhor, atual);
    } else {
      atual = 1;
    }
  }
  return melhor;
}

/** Mapa zerado por tipo (partição total dos tipos conhecidos). */
function zeroPorTipo(): Record<TipoIncidencia, number> {
  const out = {} as Record<TipoIncidencia, number>;
  for (const t of TIPOS_INCIDENCIA) out[t] = 0;
  return out;
}

/** Classifica o risco a partir dos sinais das incidências (espelha faltas). */
function classificarRisco(sinais: {
  frequenciaMensal: number;
  total: number;
  percentualSobreEscalados: number;
  sequenciaMax: number;
  reincidencia: boolean;
  tendencia: TendenciaIncidencia;
}): RiscoIncidencia {
  let pontos = 0;
  if (sinais.percentualSobreEscalados >= 20) pontos += 2;
  else if (sinais.percentualSobreEscalados >= 10) pontos += 1;
  if (sinais.total >= 4) pontos += 2;
  else if (sinais.total >= 2) pontos += 1;
  if (sinais.sequenciaMax >= 2) pontos += 1;
  if (sinais.reincidencia) pontos += 1;
  if (sinais.tendencia === 'PIORANDO') pontos += 1;
  if (pontos >= 4) return 'ALTO';
  if (pontos >= 2) return 'MEDIO';
  return 'BAIXO';
}

/**
 * Analítica inteligente das incidências de um colaborador no período.
 *
 * Espelha o estilo de `analisarFaltas` (operadores): particiona por tipo,
 * calcula taxa (% sobre dias escalados), padrões (dia da semana, sequência
 * máxima, reincidência), tendência (comparando a 1ª e a 2ª metade do período)
 * e um nível de risco combinando os sinais.
 *
 * `diasEscalados` é o total de dias em que o colaborador estava escalado no
 * período (base justa da taxa). `hoje` limita o cálculo de dias consecutivos
 * sem incidência.
 */
export function analisarIncidencias(
  incidencias: readonly IncidenciaRegistro[],
  diasEscalados: number,
  hoje: Date,
): AnaliseIncidencias {
  const total = incidencias.length;

  const porTipo = zeroPorTipo();
  const ultimaPorTipo = {} as Record<TipoIncidencia, string | null>;
  for (const t of TIPOS_INCIDENCIA) ultimaPorTipo[t] = null;

  const porDiaSemana = new Array<number>(7).fill(0);
  for (const inc of incidencias) {
    porTipo[inc.tipo] += 1;
    porDiaSemana[inc.data.getUTCDay()] += 1;
    const iso = new Date(diaUTC(inc.data)).toISOString().slice(0, 10);
    const atual = ultimaPorTipo[inc.tipo];
    if (atual === null || iso > atual) ultimaPorTipo[inc.tipo] = iso;
  }

  const percentualSobreEscalados =
    diasEscalados > 0
      ? Math.min(100, Math.round((total / diasEscalados) * 100))
      : 0;

  // Frequência mensal projetada: total / dias escalados * 30 (aprox.).
  const frequenciaMensal =
    diasEscalados > 0 ? Math.round((total / diasEscalados) * 30 * 10) / 10 : 0;

  const diasDistintos = Array.from(
    new Set(incidencias.map((i) => diaUTC(i.data))),
  );
  const reincidencia = diasDistintos.length >= 2;
  const sequenciaMax = maiorSequencia(incidencias.map((i) => i.data));

  // Dias consecutivos sem incidência até hoje (a partir da última incidência).
  let diasConsecutivosSemIncidencia = 0;
  if (diasDistintos.length > 0) {
    const ultima = Math.max(...diasDistintos);
    const hojeUTC = diaUTC(hoje);
    const diff = Math.floor((hojeUTC - ultima) / (24 * 60 * 60 * 1000));
    diasConsecutivosSemIncidencia = Math.max(0, diff);
  }

  // Tendência: compara a 1ª metade com a 2ª metade do período (por data).
  let tendencia: TendenciaIncidencia = 'ESTAVEL';
  if (total >= 2) {
    const ordenadas = incidencias
      .map((i) => diaUTC(i.data))
      .sort((a, b) => a - b);
    const min = ordenadas[0];
    const max = ordenadas[ordenadas.length - 1];
    if (max > min) {
      const meio = min + (max - min) / 2;
      let primeira = 0;
      let segunda = 0;
      for (const d of ordenadas) {
        if (d <= meio) primeira += 1;
        else segunda += 1;
      }
      if (segunda > primeira) tendencia = 'PIORANDO';
      else if (segunda < primeira) tendencia = 'MELHORANDO';
    }
  }

  const risco = classificarRisco({
    frequenciaMensal,
    total,
    percentualSobreEscalados,
    sequenciaMax,
    reincidencia,
    tendencia,
  });

  return {
    total,
    porTipo,
    ultimaPorTipo,
    frequenciaMensal,
    porDiaSemana,
    reincidencia,
    sequenciaMax,
    diasConsecutivosSemIncidencia,
    percentualSobreEscalados,
    tendencia,
    risco,
  };
}

/** Um item da linha do tempo unificada (faltas + incidências). */
export interface ItemTimeline {
  data: Date;
  /** 'FALTA' para ausências; o próprio tipo para incidências. */
  kind: 'FALTA' | TipoIncidencia;
}

/**
 * Linha do tempo unificada: junta ausências (faltas) e incidências num único
 * array ordenado do mais recente para o mais antigo (desc por data). Preserva
 * a contagem total (= ausências + incidências).
 */
export function timelineUnificada(
  ausencias: readonly { data: Date }[],
  incidencias: readonly IncidenciaRegistro[],
): ItemTimeline[] {
  const itens: ItemTimeline[] = [
    ...ausencias.map((a) => ({ data: a.data, kind: 'FALTA' as const })),
    ...incidencias.map((i) => ({ data: i.data, kind: i.tipo })),
  ];
  return itens.sort((a, b) => b.data.getTime() - a.data.getTime());
}

/** Uma linha do ranking de incidências por colaborador. */
export interface ItemRankingIncidencias {
  colaboradorId: string;
  nome: string;
  total: number;
}

/**
 * Ranking de incidências por colaborador, ordenado de forma decrescente pelo
 * total. Em caso de empate, ordena por nome (determinístico).
 */
export function rankingIncidencias(
  porColaborador: readonly ItemRankingIncidencias[],
): ItemRankingIncidencias[] {
  return [...porColaborador].sort(
    (a, b) => b.total - a.total || a.nome.localeCompare(b.nome),
  );
}
