/**
 * Lógica pura do Registro de Ponto (leitor de comprovante) — Fase A.
 *
 * A partir das batidas do dia (uma por marcação do relógio físico), classifica
 * cada uma pela ordem cronológica (1=entrada, 2=saída p/ intervalo, 3=retorno,
 * 4=encerramento; 5ª em diante = extra) e calcula a jornada do dia: tempo
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
  | 'SEM_REGISTRO'
  | 'TRABALHANDO'
  | 'EM_INTERVALO'
  | 'ENCERRADO'
  | 'INCOMPLETO';

// Parâmetros (ver spec). Constantes em milissegundos.
export const ALERTA_EXTRAS_MS = 6_300_000; // 1h45 — início dos avisos por minuto
export const LIMITE_EXTRAS_MS = 6_600_000; // 1h50 — acima disso é TAC
export const INTERVALO_ESPERADO_MS = 7_200_000; // 2h
export const INTERVALO_MINIMO_MS = 3_600_000; // 1h — abaixo disso é TAC
export const INTERVALO_MAXIMO_MS = 10_800_000; // 3h — acima disso é TAC

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
  return [...batidas]
    .sort((a, b) => a.hora.getTime() - b.hora.getTime())
    .map((b, i) => ({ id: b.id, hora: b.hora, tipo: tipoPorOrdem(i) }));
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
  /** true quando está prestes a exceder (≥ 1h45 e ainda trabalhando). */
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
 * não conta como jornada. Se um segmento estiver aberto (sem a batida seguinte),
 * conta até `agora`. `diaSemana` (0=domingo) define a base e o adicional.
 */
export function calcularJornadaDia(
  batidas: readonly BatidaEntrada[],
  agora: Date,
  diaSemana: number,
): JornadaPonto {
  const classificadas = classificarBatidas(batidas);
  const baseMs = jornadaEsperadaMs(diaSemana);

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

  const porTipo = (t: TipoBatida): BatidaClassificada | undefined =>
    classificadas.find((b) => b.tipo === t);
  const entrada = porTipo('ENTRADA');
  const saida = porTipo('SAIDA_INTERVALO');
  const retorno = porTipo('RETORNO_INTERVALO');
  const encerramento = porTipo('ENCERRAMENTO');
  const agoraMs = agora.getTime();
  const dur = (ini: Date, fim: number): number =>
    Math.max(0, fim - ini.getTime());

  let trabalhadoMs = 0;
  let intervaloMs = 0;

  // 1º segmento de trabalho: da entrada até a saída p/ intervalo (ou até o
  // encerramento se não houve intervalo, ou até agora se ainda em curso).
  if (entrada) {
    const fim1 =
      saida?.hora.getTime() ?? encerramento?.hora.getTime() ?? agoraMs;
    trabalhadoMs += dur(entrada.hora, fim1);
  }
  // Intervalo: da saída até o retorno (ou até agora se ainda em intervalo).
  if (saida) {
    const fimInt = retorno?.hora.getTime() ?? agoraMs;
    intervaloMs += dur(saida.hora, fimInt);
  }
  // 2º segmento de trabalho: do retorno até o encerramento (ou até agora).
  if (retorno) {
    const fim2 = encerramento?.hora.getTime() ?? agoraMs;
    trabalhadoMs += dur(retorno.hora, fim2);
  }

  // O que falta / incompleto.
  const faltando: string[] = [];
  if (encerramento) {
    if (!entrada) faltando.push('entrada');
    if (saida && !retorno) faltando.push('retorno do intervalo');
  }

  let status: StatusJornadaPonto;
  if (faltando.length > 0) {
    status = 'INCOMPLETO';
  } else if (encerramento) {
    status = 'ENCERRADO';
  } else if (saida && !retorno) {
    status = 'EM_INTERVALO';
  } else {
    status = 'TRABALHANDO';
  }

  const horasExtrasMs = Math.max(0, trabalhadoMs - baseMs);
  const domingo = diaSemana === 0;
  const horasExtras50Ms = domingo ? 0 : horasExtrasMs;
  const horasExtras100Ms = domingo ? horasExtrasMs : 0;

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
