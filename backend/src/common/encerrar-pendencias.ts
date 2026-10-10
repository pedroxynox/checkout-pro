import { Prisma } from '@prisma/client';
import { dadosEncerramentoAutomatico } from './justificativas';

/** O mínimo do Prisma que o encerramento usa (facilita o fake nos testes). */
export interface PrismaEncerramento {
  ausencia: {
    updateMany(args: Prisma.AusenciaUpdateManyArgs): Promise<{ count: number }>;
  };
  incidenciaEscala: {
    updateMany(
      args: Prisma.IncidenciaEscalaUpdateManyArgs,
    ): Promise<{ count: number }>;
  };
}

/** Janela do encerramento. */
export interface JanelaEncerramento {
  /** Primeiro dia incluído (00:00 UTC). Sem ele, não há limite inferior. */
  desde?: Date;
  /** Corte EXCLUSIVO (00:00 UTC): só ocorrências com `data` antes dele. */
  ate: Date;
  /**
   * Intervalos que NÃO podem ser tocados — os ciclos de folha já fechados (são
   * história; o mês já foi apurado).
   */
  excluir?: readonly { inicio: Date; fimExclusivo: Date }[];
}

/** Quantas ocorrências foram encerradas. */
export interface ResultadoEncerramento {
  faltas: number;
  naoRetornos: number;
}

/**
 * Encerra como "não justificada" (autor: o sistema) as faltas e os
 * não-retornos de intervalo ainda PENDENTES dentro da janela.
 *
 * Função livre, e não serviço injetado, porque tem dois chamadores em módulos
 * que não podem depender um do outro: o cron diário (`operadores`) e o
 * fechamento do ciclo (`ciclo-folha`, que o próprio `operadores` importa).
 *
 * Só toca `PENDENTE`: o que o gestor já decidiu (justificada ou não) fica como
 * está. **Não mexe em `debitoHoras`.** Dos tipos de incidência, só o
 * não-retorno: advertência e suspensão também têm `statusJustificativa`, mas não
 * são ocorrências a justificar.
 */
export async function encerrarPendencias(
  prisma: PrismaEncerramento,
  janela: JanelaEncerramento,
  agora: Date = new Date(),
): Promise<ResultadoEncerramento> {
  const data: { lt: Date; gte?: Date } = { lt: janela.ate };
  if (janela.desde) data.gte = janela.desde;
  const fora = (janela.excluir ?? []).map((c) => ({
    data: { gte: c.inicio, lt: c.fimExclusivo },
  }));
  const naoFechado = fora.length > 0 ? { NOT: { OR: fora } } : {};
  const dados = dadosEncerramentoAutomatico(agora);

  const [faltas, naoRetornos] = await Promise.all([
    prisma.ausencia.updateMany({
      where: { statusJustificativa: 'PENDENTE', data, ...naoFechado },
      data: dados,
    }),
    prisma.incidenciaEscala.updateMany({
      where: {
        tipo: 'NAO_RETORNO_INTERVALO',
        statusJustificativa: 'PENDENTE',
        data,
        ...naoFechado,
      },
      data: dados,
    }),
  ]);
  return { faltas: faltas.count, naoRetornos: naoRetornos.count };
}
