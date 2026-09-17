/**
 * A ÚNICA leitura das compensações de horas APROVADAS (ADR 0021).
 *
 * Existe como **função livre**, e não como método de serviço, pelo mesmo motivo
 * de `carregarMapaDeFeriados`: o único ingrediente
 * é o Prisma, e os dois lados que precisam dela — a Central de Jornada (que
 * apura as horas) e a própria seção de Compensação (que sugere e grava) — se
 * referenciariam em círculo se isto fosse um serviço injetado.
 *
 * A alternativa era a Central importar o `CompensacaoHorasService` com
 * `forwardRef`. Um ciclo de injeção resolvido por `forwardRef` funciona, mas
 * transforma qualquer erro de ordem de inicialização num `undefined` silencioso
 * no meio do cálculo de horas — o pior lugar possível para uma dependência
 * frágil.
 */
import { PrismaService } from '../prisma/prisma.service';

/** Uma compensação aprovada, no formato que o cálculo da jornada consome. */
export interface CompensacaoAplicada {
  colaboradorId: string;
  /** Dia em meia-noite UTC. */
  data: Date;
  /** Horas de 50% que este dia consome. */
  compensadoMs: number;
  /** Horas que a pessoa ainda trabalha no dia. Zero = dia inteiro livre. */
  trabalharMs: number;
  /** true quando a jornada curta encerra sem intervalo (duas batidas). */
  semIntervalo: boolean;
  /** Início da faixa de trabalho ("HH:mm"), quando o dia é parcial. */
  horaInicio: string | null;
  horaFim: string | null;
}

/** Chave do mapa: `colaboradorId|diaISO`. */
export function chaveCompensacao(
  colaboradorId: string,
  diaISO: string,
): string {
  return `${colaboradorId}|${diaISO}`;
}

/**
 * Compensações **aprovadas** de um período, indexadas por `colaboradorId|diaISO`.
 *
 * Só `APROVADA` entra: `RECUSADA` é uma sugestão descartada (nunca existiu como
 * fato) e `CANCELADA` é uma concessão desfeita — nenhuma das duas pode alterar
 * uma hora de ninguém.
 */
export async function carregarCompensacoesAprovadas(
  prisma: PrismaService,
  inicio: Date,
  fimExclusivo: Date,
): Promise<Map<string, CompensacaoAplicada>> {
  const linhas = await prisma.compensacaoHoras.findMany({
    where: { status: 'APROVADA', data: { gte: inicio, lt: fimExclusivo } },
    select: {
      colaboradorId: true,
      data: true,
      minutosCompensados: true,
      minutosTrabalhados: true,
      semIntervalo: true,
      horaInicio: true,
      horaFim: true,
    },
  });

  const mapa = new Map<string, CompensacaoAplicada>();
  for (const l of linhas) {
    mapa.set(chaveCompensacao(l.colaboradorId, l.data.toISOString()), {
      colaboradorId: l.colaboradorId,
      data: l.data,
      compensadoMs: l.minutosCompensados * 60_000,
      trabalharMs: l.minutosTrabalhados * 60_000,
      semIntervalo: l.semIntervalo,
      horaInicio: l.horaInicio,
      horaFim: l.horaFim,
    });
  }
  return mapa;
}
