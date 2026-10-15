/**
 * Cálculo **puro** do resumo de evolução do feedforward de um colaborador,
 * exibido no topo da seção (e na capa do histórico impresso). Não depende de
 * React Native nem do relógio: "hoje" é recebido por parâmetro.
 */
import {
  PontoFeedforward,
  RodadaFeedforward,
  SituacaoPontoFeedforward,
} from '../api/types';
import { ResumoHistorico, resumoHistorico } from './relatorioFeedforward';

/** Direção da nota entre a penúltima e a última rodada com nota. */
export type TendenciaNota = 'SUBIU' | 'CAIU' | 'ESTAVEL';

/** Próximo ponto pendente a acompanhar (o de prazo mais próximo). */
export interface ProximoPrazoFeedforward {
  descricao: string;
  prazo: string;
  situacao: SituacaoPontoFeedforward;
  /** Dias até o prazo (negativo = vencido há N dias; 0 = hoje). */
  dias: number;
}

/** Resumo de evolução exibido no topo da seção. */
export interface EvolucaoFeedforward extends ResumoHistorico {
  /** Data (ISO) da conversa mais recente, ou null sem rodadas. */
  ultimaConversa: string | null;
  /** Dias desde a conversa mais recente (null sem rodadas). */
  diasDesdeUltima: number | null;
  /**
   * % de pontos atingidos entre os já revisados (0–100, inteiro); null se
   * nenhum ponto foi revisado ainda — pendente não conta contra.
   */
  taxaAtingimento: number | null;
  /** Notas em ordem cronológica (só rodadas com nota). */
  notas: number[];
  notaAtual: number | null;
  notaAnterior: number | null;
  tendenciaNota: TendenciaNota | null;
  /** Média das notas com 1 casa decimal (null sem notas). */
  mediaNota: number | null;
  proximoPrazo: ProximoPrazoFeedforward | null;
}

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/** Diferença em dias civis (UTC) entre duas datas ISO (`ate - de`). */
export function diasEntreISO(de: string, ate: string): number {
  const a = Date.parse(`${de.slice(0, 10)}T00:00:00.000Z`);
  const b = Date.parse(`${ate.slice(0, 10)}T00:00:00.000Z`);
  return Math.round((b - a) / UM_DIA_MS);
}

/** Monta o resumo de evolução a partir das rodadas (em qualquer ordem). */
export function evolucaoFeedforward(
  rodadas: RodadaFeedforward[],
  hojeISO: string,
): EvolucaoFeedforward {
  const base = resumoHistorico(rodadas);
  const cronologicas = [...rodadas].sort((a, b) => a.data.localeCompare(b.data));
  const ultima = cronologicas[cronologicas.length - 1] ?? null;

  const notas = cronologicas
    .map((r) => r.evolucaoNota)
    .filter((n): n is number => n != null);
  const notaAtual = notas.length ? notas[notas.length - 1] : null;
  const notaAnterior = notas.length > 1 ? notas[notas.length - 2] : null;
  const tendenciaNota: TendenciaNota | null =
    notaAtual == null || notaAnterior == null
      ? null
      : notaAtual > notaAnterior
        ? 'SUBIU'
        : notaAtual < notaAnterior
          ? 'CAIU'
          : 'ESTAVEL';
  const mediaNota = notas.length
    ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10
    : null;

  const revisados = base.atingidos + base.naoAtingidos;
  const taxaAtingimento = revisados
    ? Math.round((base.atingidos / revisados) * 100)
    : null;

  const pendentes: PontoFeedforward[] = rodadas
    .flatMap((r) => r.pontos)
    .filter((p) => p.status === 'PENDENTE')
    .sort((a, b) => a.prazo.localeCompare(b.prazo));
  const prox = pendentes[0];

  return {
    ...base,
    ultimaConversa: ultima ? ultima.data : null,
    diasDesdeUltima: ultima ? diasEntreISO(ultima.data, hojeISO) : null,
    taxaAtingimento,
    notas,
    notaAtual,
    notaAnterior,
    tendenciaNota,
    mediaNota,
    proximoPrazo: prox
      ? {
          descricao: prox.descricao,
          prazo: prox.prazo,
          situacao: prox.situacao,
          dias: diasEntreISO(hojeISO, prox.prazo),
        }
      : null,
  };
}

/** Texto curto do próximo prazo ("vence hoje", "em 3 dias", "vencido há 2 dias"). */
export function textoPrazo(dias: number): string {
  if (dias === 0) return 'vence hoje';
  if (dias > 0) return dias === 1 ? 'em 1 dia' : `em ${dias} dias`;
  const n = -dias;
  return n === 1 ? 'vencido há 1 dia' : `vencido há ${n} dias`;
}
