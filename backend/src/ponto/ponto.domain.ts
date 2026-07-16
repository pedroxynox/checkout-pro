/**
 * Lógica pura do Registro de Ponto (leitor de comprovante) — Fase A.
 *
 * A partir das batidas do dia (uma por marcação do relógio físico), classifica
 * cada uma pela ordem cronológica. Duas batidas com até 4h50 representam uma
 * jornada encerrada sem intervalo; acima disso seguem como saída para intervalo.
 * A 3ª é retorno e a 4ª é encerramento. Também calcula a jornada do dia: tempo
 * trabalhado (o intervalo NÃO conta), tempo de intervalo, horas extras (com o
 * adicional 50%/100%), alerta de excesso e classificação TAC.
 *
 * Sem efeitos colaterais — testável sem banco. A hora que vale é sempre a do
 * comprovante (a hora da batida), nunca a de carregamento.
 */
import { StatusFiscal, jornadaEsperadaMs } from '../fiscais/fiscais.domain';

export const TIPOS_BATIDA = [
  'ENTRADA',
  'SAIDA_INTERVALO',
  'RETORNO_INTERVALO',
  'ENCERRAMENTO',
  'EXTRA',
] as const;

export type TipoBatida = (typeof TIPOS_BATIDA)[number];

/** Estado da jornada do dia. */
export type StatusJornadaPonto =
  'SEM_REGISTRO' | 'TRABALHANDO' | 'EM_INTERVALO' | 'ENCERRADO' | 'INCOMPLETO';

// Parâmetros (ver spec). Constantes em milissegundos.
export const RISCO_TAC_1H30_MS = 90 * 60_000;
export const RISCO_TAC_1H40_MS = 100 * 60_000;
export const ALERTA_EXTRAS_MS = RISCO_TAC_1H30_MS;
export const LIMITE_EXTRAS_MS = 110 * 60_000; // 1h50 — acima disso é TAC
export const INTERVALO_ESPERADO_MS = 7_200_000; // 2h
export const INTERVALO_MINIMO_MS = 3_600_000; // 1h — abaixo disso é TAC
export const INTERVALO_MAXIMO_MS = 10_800_000; // 3h — acima disso é TAC
/** Jornada que pode ser encerrada sem intervalo no contrato 6x1–2x1. */
export const MAX_TRABALHO_SEM_INTERVALO_MS = 4 * 60 * 60_000 + 50 * 60_000; // 4h50
/**
 * Distância mínima entre duas batidas da mesma pessoa no dia. Abaixo dela a
 * nova batida é tratada como duplicada (toque duplo, reenvio ou sincronização
 * repetida): no contrato 6x1–2x1 duas marcações legítimas nunca ficam a poucos
 * minutos uma da outra (o menor intervalo real, mesmo irregular, é bem maior),
 * então a janela pega apenas repetições acidentais sem barrar registros válidos.
 */
export const INTERVALO_MINIMO_ENTRE_BATIDAS_MS = 2 * 60_000; // 2 min

/**
 * true se `horaMs` está a menos de `intervaloMinimoMs` de alguma das horas já
 * registradas (horas iguais ou próximas demais). Puro e sem efeitos colaterais.
 */
export function batidaDuplicada(
  horaMs: number,
  horasExistentesMs: readonly number[],
  intervaloMinimoMs: number = INTERVALO_MINIMO_ENTRE_BATIDAS_MS,
): boolean {
  return horasExistentesMs.some(
    (existente) => Math.abs(existente - horaMs) < intervaloMinimoMs,
  );
}

/** Etapas crescentes dos avisos preventivos/de TAC. */
export type EtapaAlertaTac = 'RISCO_1H30' | 'RISCO_1H40' | 'TAC';

/**
 * Retorna somente a etapa mais grave da jornada atual. Assim, se a primeira
 * verificação já ocorrer após 1h50, envia apenas TAC (não três mensagens de
 * uma vez). Um TAC por intervalo irregular também prevalece sobre os riscos
 * calculados apenas pelas horas extras.
 */
export function etapaAlertaTac(
  horasExtrasMs: number,
  tac: boolean,
): EtapaAlertaTac | null {
  if (tac) return 'TAC';
  if (horasExtrasMs >= RISCO_TAC_1H40_MS) return 'RISCO_1H40';
  if (horasExtrasMs >= RISCO_TAC_1H30_MS) return 'RISCO_1H30';
  return null;
}

/** Uma batida como entra no cálculo (só precisamos de id e hora). */
export interface BatidaEntrada {
  id: string;
  hora: Date;
}

/** Uma batida já classificada pela ordem do dia. */
export interface BatidaClassificada {
  id: string;
  hora: Date;
  tipo: TipoBatida;
}

/** Tipo canônico da batida conforme a sua posição (0-based) no dia. */
export function tipoPorOrdem(indice: number): TipoBatida {
  switch (indice) {
    case 0:
      return 'ENTRADA';
    case 1:
      return 'SAIDA_INTERVALO';
    case 2:
      return 'RETORNO_INTERVALO';
    case 3:
      return 'ENCERRAMENTO';
    default:
      return 'EXTRA';
  }
}

/**
 * Ordena as batidas por hora e atribui o tipo pela ordem (1ª=entrada, etc.).
 * Empates de hora preservam a ordem informada (sort estável).
 */
export function classificarBatidas(
  batidas: readonly BatidaEntrada[],
): BatidaClassificada[] {
  const ordenadas = [...batidas].sort(
    (a, b) => a.hora.getTime() - b.hora.getTime(),
  );
  const jornadaSemIntervalo =
    ordenadas.length === 2 &&
    ordenadas[1].hora.getTime() - ordenadas[0].hora.getTime() <=
      MAX_TRABALHO_SEM_INTERVALO_MS;

  return ordenadas.map((b, i) => ({
    id: b.id,
    hora: b.hora,
    tipo: jornadaSemIntervalo && i === 1 ? 'ENCERRAMENTO' : tipoPorOrdem(i),
  }));
}

/**
 * Estado de fiscal (DISPONIVEL/INTERVALO/FORA_EXPEDIENTE) correspondente a cada
 * tipo de batida — usado para ligar as batidas ao status do fiscal:
 *  - entrada e retorno do intervalo → DISPONIVEL (trabalhando);
 *  - saída p/ intervalo → INTERVALO;
 *  - encerramento → FORA_EXPEDIENTE;
 *  - batida extra → sem transição (null).
 */
export function statusFiscalDeTipoBatida(
  tipo: TipoBatida,
): StatusFiscal | null {
  switch (tipo) {
    case 'ENTRADA':
    case 'RETORNO_INTERVALO':
      return 'DISPONIVEL';
    case 'SAIDA_INTERVALO':
      return 'INTERVALO';
    case 'ENCERRAMENTO':
      return 'FORA_EXPEDIENTE';
    default:
      return null;
  }
}

/**
 * Status de fiscal (DISPONIVEL/INTERVALO/FORA_EXPEDIENTE) equivalente ao estado
 * da jornada por batidas. Usado para que colaboradores não-fiscais apareçam no
 * painel de jornada da equipe com um chip de status coerente (mesmo sem o
 * painel em tempo real, que é exclusivo dos fiscais).
 */
export function statusFiscalDeJornada(
  status: StatusJornadaPonto,
): StatusFiscal {
  if (status === 'TRABALHANDO') return 'DISPONIVEL';
  if (status === 'EM_INTERVALO') return 'INTERVALO';
  return 'FORA_EXPEDIENTE';
}

/** Jornada calculada de um dia. */
export interface JornadaPonto {
  /** Tempo trabalhado (sem o intervalo), em ms. */
  trabalhadoMs: number;
  /** Tempo de intervalo, em ms. */
  intervaloMs: number;
  status: StatusJornadaPonto;
  /** Carga horária base esperada do dia, em ms. */
  baseMs: number;
  /** Horas extras totais (trabalhado acima da base), em ms. */
  horasExtrasMs: number;
  /** Extras com adicional de 50% (segunda a sábado). */
  horasExtras50Ms: number;
  /** Extras com adicional de 100% (domingo). */
  horasExtras100Ms: number;
  /** true quando entrou no primeiro risco preventivo (≥ 1h30). */
  alertaIminente: boolean;
  /** true quando o dia é irregular (Termo de Ajustamento de Conduta). */
  tac: boolean;
  /** Motivos do TAC (ex.: "Excedeu 1h50 de horas extras"). */
  motivosTac: string[];
  /** O que falta para completar o dia (ex.: "retorno do intervalo"). */
  faltando: string[];
  /** Batidas do dia, já classificadas. */
  batidas: BatidaClassificada[];
}

/**
 * Calcula a jornada do dia a partir das batidas, até o instante `agora`.
 *
 * Trabalho = (saída_intervalo − entrada) + (encerramento − retorno). O intervalo
 * não conta como jornada. Segmentos abertos contam até `agora` somente no dia
 * em andamento; com `diaEncerrado`, permanecem desconhecidos e o dia fica
 * incompleto. Duas batidas separadas por até 4h50 encerram uma jornada válida
 * sem intervalo. `diaSemana` (0=domingo) define a base e o adicional.
 */
export function calcularJornadaDia(
  batidas: readonly BatidaEntrada[],
  agora: Date,
  diaSemana: number,
  ehFeriado = false,
  diaEncerrado = false,
): JornadaPonto {
  const classificadas = classificarBatidas(batidas);
  // Feriado segue a MESMA regra do domingo: carga-base de domingo e extras a
  // 100% (o rodízio por grupos, esse sim, é exclusivo do domingo).
  const contaComo100 = diaSemana === 0 || ehFeriado;
  const baseMs = ehFeriado
    ? jornadaEsperadaMs(0)
    : jornadaEsperadaMs(diaSemana);

  if (classificadas.length === 0) {
    return {
      trabalhadoMs: 0,
      intervaloMs: 0,
      status: 'SEM_REGISTRO',
      baseMs,
      horasExtrasMs: 0,
      horasExtras50Ms: 0,
      horasExtras100Ms: 0,
      alertaIminente: false,
      tac: false,
      motivosTac: [],
      faltando: [],
      batidas: classificadas,
    };
  }

  const entrada = classificadas[0];
  const segunda = classificadas[1];
  const retorno = classificadas[2];
  const encerramento = classificadas[3];
  const saida = segunda?.tipo === 'SAIDA_INTERVALO' ? segunda : undefined;
  const agoraMs = agora.getTime();
  const dur = (ini: Date, fim: number): number =>
    Math.max(0, fim - ini.getTime());

  let trabalhadoMs = 0;
  let intervaloMs = 0;
  let status: StatusJornadaPonto;
  const faltando: string[] = [];

  if (classificadas.length === 1) {
    if (diaEncerrado) {
      // Sem uma saída não há como afirmar quanto foi trabalhado no passado.
      status = 'INCOMPLETO';
      faltando.push('encerramento');
    } else {
      trabalhadoMs = dur(entrada.hora, agoraMs);
      status = 'TRABALHANDO';
    }
  } else if (classificadas.length === 2) {
    trabalhadoMs = dur(entrada.hora, segunda.hora.getTime());
    if (segunda.tipo === 'ENCERRAMENTO') {
      // Até 4h50, duas batidas formam uma jornada válida sem intervalo.
      status = 'ENCERRADO';
    } else if (diaEncerrado) {
      // A segunda batida abriu um intervalo que nunca foi encerrado. Não se
      // projeta esse intervalo até meia-noite, pois sua duração é desconhecida.
      status = 'INCOMPLETO';
      faltando.push('retorno do intervalo', 'encerramento');
    } else {
      intervaloMs = dur(segunda.hora, agoraMs);
      status = 'EM_INTERVALO';
    }
  } else if (classificadas.length === 3) {
    trabalhadoMs = dur(entrada.hora, segunda.hora.getTime());
    intervaloMs = dur(segunda.hora, retorno.hora.getTime());
    if (diaEncerrado) {
      // O retorno existe, mas sem fechamento não se conhece o segundo segmento.
      status = 'INCOMPLETO';
      faltando.push('encerramento');
    } else {
      trabalhadoMs += dur(retorno.hora, agoraMs);
      status = 'TRABALHANDO';
    }
  } else {
    // Quatro batidas encerram a jornada. Registros EXTRA antigos permanecem
    // visíveis por compatibilidade, mas não alteram os segmentos canônicos.
    trabalhadoMs =
      dur(entrada.hora, segunda.hora.getTime()) +
      dur(retorno.hora, encerramento.hora.getTime());
    intervaloMs = dur(segunda.hora, retorno.hora.getTime());
    status = 'ENCERRADO';
  }

  const horasExtrasMs = Math.max(0, trabalhadoMs - baseMs);
  const horasExtras50Ms = contaComo100 ? 0 : horasExtrasMs;
  const horasExtras100Ms = contaComo100 ? horasExtrasMs : 0;

  const emAndamento = status === 'TRABALHANDO' || status === 'EM_INTERVALO';
  const alertaIminente = emAndamento && horasExtrasMs >= ALERTA_EXTRAS_MS;

  const motivosTac: string[] = [];
  if (horasExtrasMs > LIMITE_EXTRAS_MS) {
    motivosTac.push('Excedeu 1h50 de horas extras');
  }
  // Intervalo abaixo de 1h só é conclusivo quando o intervalo terminou.
  if (retorno && intervaloMs < INTERVALO_MINIMO_MS) {
    motivosTac.push('Intervalo abaixo de 1h');
  }
  // Intervalo acima de 3h vale mesmo se ainda estiver em intervalo.
  if (saida && intervaloMs > INTERVALO_MAXIMO_MS) {
    motivosTac.push('Intervalo acima de 3h');
  }

  return {
    trabalhadoMs,
    intervaloMs,
    status,
    baseMs,
    horasExtrasMs,
    horasExtras50Ms,
    horasExtras100Ms,
    alertaIminente,
    tac: motivosTac.length > 0,
    motivosTac,
    faltando,
    batidas: classificadas,
  };
}
