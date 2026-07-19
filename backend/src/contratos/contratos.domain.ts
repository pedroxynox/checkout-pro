/**
 * Lógica de domínio **pura** dos Contratos de experiência (45 + 45 dias).
 *
 * Não depende do Nest nem do Prisma. Concentra toda a matemática do ciclo de
 * vida do contrato de experiência brasileiro, derivada de forma determinista
 * a partir de DUAS entradas apenas:
 *   - a `dataAdmissao` (fonte única do tempo de casa e dos marcos);
 *   - as DECISÕES já tomadas nos marcos de 45 e 90 dias.
 *
 * O ESTADO (experiência/efetivado/encerrado) é sempre **derivado** — nunca
 * gravado —, o que mantém a fonte de verdade única e o cálculo testável por
 * propriedades (fast-check) sem qualquer infraestrutura. Ver ADR 0008.
 *
 * Regras de negócio (aprovadas) — ciclo AUTOMÁTICO, sem decisão manual:
 *  - Dentro dos 90 dias: EXPERIÊNCIA. O marco de 45 dias é aprovado
 *    automaticamente por decurso — nunca gera "decisão em atraso" nem pede
 *    aprovação/reprovação manual.
 *  - A partir do dia 91 (mais de 90 dias de casa): vira EFETIVADO
 *    automaticamente.
 *  - Aviso de vencimento: nos 5 dias antes de completar 90 dias, um alerta por
 *    dia (consecutivo) para o gestor decidir se encerra antes da efetivação
 *    automática.
 *  - Não há mais decisão manual de marcos (nada a aprovar/reprovar na tela).
 *    Uma reprovação explícita registrada via API (para casos históricos) ainda
 *    encerra o contrato; o encerramento operacional de um colaborador é feito
 *    por "excluir do quadro".
 */
import { inicioDoDia } from '../common/datas';

/** Marco (hito) do contrato de experiência. */
export type MarcoContrato = 'MARCO_45' | 'MARCO_90';

/** Resultado de uma decisão num marco. */
export type ResultadoDecisao = 'APROVADO' | 'REPROVADO';

/** Estado (derivado) do contrato. */
export type EstadoContrato =
  | 'SEM_ADMISSAO'
  | 'EXPERIENCIA'
  | 'EFETIVADO'
  | 'ENCERRADO';

/** Etiqueta curta exibida no card/perfil (espelho minúsculo do estado). */
export type EtiquetaContrato =
  | 'sem_admissao'
  | 'experiencia'
  | 'efetivado'
  | 'encerrado';

/** Nível de urgência para o semáforo do card (mapeado a cor no app). */
export type UrgenciaContrato = 'INATIVO' | 'OK' | 'ATENCAO' | 'CRITICO';

/** Duração da 1ª fase da experiência (dias). */
export const DIAS_MARCO_45 = 45;
/** Duração total máxima da experiência (dias). */
export const DIAS_MARCO_90 = 90;
/** Antecedência (dias) com que o alerta de vencimento começa a ser enviado. */
export const ANTECEDENCIA_ALERTA_DIAS = 5;

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/** Uma decisão já tomada (por marco). */
export interface DecisaoRegistro {
  marco: MarcoContrato;
  resultado: ResultadoDecisao;
}

/** Entradas do cálculo: admissão + decisões conhecidas. */
export interface EntradaContrato {
  dataAdmissao: Date | null;
  decisoes: readonly DecisaoRegistro[];
}

/** Resumo derivado do contrato (base dos cards, do perfil e do cron). */
export interface ResumoContrato {
  estado: EstadoContrato;
  etiqueta: EtiquetaContrato;
  /** Dias de casa (civis, UTC). Pode ser negativo se a admissão for futura. */
  diasDeCasa: number;
  dataAdmissao: Date | null;
  dataMarco45: Date | null;
  dataMarco90: Date | null;
  /** Próximo marco a decidir (apenas em EXPERIÊNCIA). */
  proximoMarco: MarcoContrato | null;
  dataProximoMarco: Date | null;
  /** Dias para o próximo marco: >0 faltam, 0 é hoje, <0 vencido. */
  diasParaProximoMarco: number | null;
  /** Efetivado automaticamente por ter cruzado 90 dias sem reprovação. */
  efetivadoPorDecurso: boolean;
  decisao45: ResultadoDecisao | null;
  decisao90: ResultadoDecisao | null;
}

/**
 * Alerta a enviar aos gestores (consumido pelo cron diário).
 *
 * No ciclo automático o único alerta possível é o aviso de VENCIMENTO do marco
 * de 90 dias — enviado nos dias imediatamente anteriores à efetivação
 * automática, para o gestor decidir se encerra antes.
 */
export interface AlertaContrato {
  tipo: 'VENCIMENTO';
  marco: MarcoContrato;
  /** Dias que faltam para o marco (0..ANTECEDENCIA; 0 = vence hoje). */
  dias: number;
}

/** Diferença em dias civis (UTC, date-only) entre `de` e `ate`. */
export function diffEmDias(de: Date, ate: Date): number {
  return Math.round(
    (inicioDoDia(ate).getTime() - inicioDoDia(de).getTime()) / UM_DIA_MS,
  );
}

/** Data (00:00 UTC) resultante de somar `dias` a `base`. */
export function adicionarDias(base: Date, dias: number): Date {
  const d = inicioDoDia(base);
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

/** Dias de casa (civis) de uma admissão até `hoje`. 0 quando não há admissão. */
export function calcularDiasDeCasa(
  dataAdmissao: Date | null,
  hoje: Date,
): number {
  if (!dataAdmissao) return 0;
  return diffEmDias(dataAdmissao, hoje);
}

/** Resultado de um marco a partir da lista de decisões (null se não decidido). */
function resultadoDoMarco(
  decisoes: readonly DecisaoRegistro[],
  marco: MarcoContrato,
): ResultadoDecisao | null {
  return decisoes.find((d) => d.marco === marco)?.resultado ?? null;
}

/**
 * Deriva o resumo completo do contrato a partir da admissão + decisões, na
 * data `hoje`. Função central e pura do módulo.
 */
export function derivarResumoContrato(
  entrada: EntradaContrato,
  hoje: Date,
): ResumoContrato {
  const decisao45 = resultadoDoMarco(entrada.decisoes, 'MARCO_45');
  const decisao90 = resultadoDoMarco(entrada.decisoes, 'MARCO_90');

  if (!entrada.dataAdmissao) {
    return {
      estado: 'SEM_ADMISSAO',
      etiqueta: 'sem_admissao',
      diasDeCasa: 0,
      dataAdmissao: null,
      dataMarco45: null,
      dataMarco90: null,
      proximoMarco: null,
      dataProximoMarco: null,
      diasParaProximoMarco: null,
      efetivadoPorDecurso: false,
      decisao45,
      decisao90,
    };
  }

  const admissao = inicioDoDia(entrada.dataAdmissao);
  const diasDeCasa = diffEmDias(admissao, hoje);
  const dataMarco45 = adicionarDias(admissao, DIAS_MARCO_45);
  const dataMarco90 = adicionarDias(admissao, DIAS_MARCO_90);

  const base = {
    diasDeCasa,
    dataAdmissao: admissao,
    dataMarco45,
    dataMarco90,
    decisao45,
    decisao90,
  };

  // Reprovação explícita (registrada via API — casos históricos) encerra o
  // contrato. Não há mais botão de reprovar; o encerramento operacional é por
  // "excluir do quadro".
  if (decisao45 === 'REPROVADO' || decisao90 === 'REPROVADO') {
    return {
      ...base,
      estado: 'ENCERRADO',
      etiqueta: 'encerrado',
      proximoMarco: null,
      dataProximoMarco: null,
      diasParaProximoMarco: null,
      efetivadoPorDecurso: false,
    };
  }

  // EFETIVADO: automaticamente ao passar de 90 dias (a partir do dia 91) ou por
  // aprovação explícita já registrada no marco de 90. Sem decisões pendentes.
  if (diasDeCasa > DIAS_MARCO_90 || decisao90 === 'APROVADO') {
    return {
      ...base,
      estado: 'EFETIVADO',
      etiqueta: 'efetivado',
      proximoMarco: null,
      dataProximoMarco: null,
      diasParaProximoMarco: null,
      // "por decurso" quando a efetivação veio do tempo (sem aprovação manual).
      efetivadoPorDecurso: decisao90 !== 'APROVADO',
    };
  }

  // Dentro dos 90 dias → EXPERIÊNCIA. O marco de 45 aprova-se por decurso (nunca
  // "em atraso") e a efetivação acontece sozinha no dia 91. Não há decisão
  // manual. O "próximo marco" aponta para os 90 dias APENAS para o aviso de
  // vencimento (5 dias antes, diariamente) e o semáforo de urgência.
  return {
    ...base,
    estado: 'EXPERIENCIA',
    etiqueta: 'experiencia',
    proximoMarco: 'MARCO_90',
    dataProximoMarco: dataMarco90,
    diasParaProximoMarco: diffEmDias(hoje, dataMarco90),
    efetivadoPorDecurso: false,
  };
}

/**
 * Avalia o alerta a enviar num dado dia (ou `null` se não há nada a alertar).
 * No ciclo automático o único alerta é o aviso de vencimento do marco de 90,
 * enviado nos 5 dias que antecedem a efetivação automática.
 */
export function avaliarAlerta(resumo: ResumoContrato): AlertaContrato | null {
  if (
    resumo.estado === 'EXPERIENCIA' &&
    resumo.proximoMarco &&
    resumo.diasParaProximoMarco !== null &&
    resumo.diasParaProximoMarco >= 0 &&
    resumo.diasParaProximoMarco <= ANTECEDENCIA_ALERTA_DIAS
  ) {
    return {
      tipo: 'VENCIMENTO',
      marco: resumo.proximoMarco,
      dias: resumo.diasParaProximoMarco,
    };
  }
  return null;
}

/**
 * Classifica a urgência do card (semáforo):
 *  - INATIVO (cinza): sem admissão ou contrato encerrado;
 *  - OK (verde): efetivado, sem decisão pendente;
 *  - ATENCAO (amarelo): em experiência, dentro do prazo normal;
 *  - CRITICO (vermelho): vencendo em <= 5 dias (véspera da efetivação).
 */
export function classificarUrgencia(resumo: ResumoContrato): UrgenciaContrato {
  if (resumo.estado === 'SEM_ADMISSAO' || resumo.estado === 'ENCERRADO') {
    return 'INATIVO';
  }
  if (resumo.estado === 'EFETIVADO') return 'OK';
  // EXPERIÊNCIA sem atraso: crítico se vencendo em <= antecedência, senão atenção.
  if (
    resumo.diasParaProximoMarco !== null &&
    resumo.diasParaProximoMarco >= 0 &&
    resumo.diasParaProximoMarco <= ANTECEDENCIA_ALERTA_DIAS
  ) {
    return 'CRITICO';
  }
  return 'ATENCAO';
}

/**
 * Decide, de forma pura, se um marco pode ser decidido agora, dadas as decisões
 * já tomadas. Regras: o marco de 90 só pode ser decidido após o marco de 45 ser
 * APROVADO; nenhum marco pode ser decidido depois de uma reprovação (contrato
 * encerrado).
 */
export function podeDecidirMarco(
  marco: MarcoContrato,
  decisoes: readonly DecisaoRegistro[],
): boolean {
  const decisao45 = resultadoDoMarco(decisoes, 'MARCO_45');
  const decisao90 = resultadoDoMarco(decisoes, 'MARCO_90');
  if (decisao45 === 'REPROVADO' || decisao90 === 'REPROVADO') return false;
  if (marco === 'MARCO_90') return decisao45 === 'APROVADO';
  return true; // MARCO_45 sempre pode (enquanto não houve reprovação)
}

/** Contagens agregadas da carteira de contratos (resumo do topo da seção). */
export interface ResumoCarteira {
  total: number;
  emExperiencia: number;
  efetivados: number;
  encerrados: number;
  semAdmissao: number;
  vencendoSemana: number;
}

/** Agrega a carteira de contratos a partir dos resumos individuais. */
export function resumirCarteira(
  resumos: readonly ResumoContrato[],
): ResumoCarteira {
  const out: ResumoCarteira = {
    total: resumos.length,
    emExperiencia: 0,
    efetivados: 0,
    encerrados: 0,
    semAdmissao: 0,
    vencendoSemana: 0,
  };
  for (const r of resumos) {
    if (r.estado === 'EXPERIENCIA') out.emExperiencia += 1;
    else if (r.estado === 'EFETIVADO') out.efetivados += 1;
    else if (r.estado === 'ENCERRADO') out.encerrados += 1;
    else out.semAdmissao += 1;

    if (
      r.estado === 'EXPERIENCIA' &&
      r.diasParaProximoMarco !== null &&
      r.diasParaProximoMarco >= 0 &&
      r.diasParaProximoMarco <= ANTECEDENCIA_ALERTA_DIAS
    ) {
      out.vencendoSemana += 1;
    }
  }
  return out;
}
