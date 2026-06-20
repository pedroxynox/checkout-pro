import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import {
  TIPOS_ARRECADACAO,
  inicioDoDia,
  inicioDoProximoDia,
} from '../arrecadacao/arrecadacao.domain';

/**
 * Serviço de Fechamento do dia: decide quando **todos os arquivos do dia** já
 * estão resolvidos (as 5 arrecadações enviadas OU marcadas como "sem
 * movimento" + as vendas por hora enviadas) e, na transição para concluído,
 * notifica os gestores (gerentes e supervisores) uma única vez.
 */
@Injectable()
export class FechamentoService {
  private readonly logger = new Logger(FechamentoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  /**
   * Indica se o fechamento do dia está completo: cada uma das 5 arrecadações
   * está enviada ou marcada como "sem movimento", e há vendas por hora no dia.
   */
  async estaCompleto(data: Date): Promise<boolean> {
    const dia = inicioDoDia(data);
    const proximo = inicioDoProximoDia(data);
    const [grupos, marcas, vendasQtd] = await Promise.all([
      this.prisma.registroArrecadacao.groupBy({
        by: ['tipo'],
        where: { data: { gte: dia, lt: proximo } },
        _count: { _all: true },
      }),
      this.prisma.arrecadacaoSemMovimento.findMany({
        where: { data: { gte: dia, lt: proximo } },
        select: { tipo: true },
      }),
      this.prisma.vendaHora.count({
        where: { data: { gte: dia, lt: proximo } },
      }),
    ]);
    const resolvidos = new Set<string>();
    for (const g of grupos) {
      if ((g._count?._all ?? 0) > 0) {
        resolvidos.add(g.tipo);
      }
    }
    for (const m of marcas) {
      resolvidos.add(m.tipo);
    }
    const arrecadacaoOk = TIPOS_ARRECADACAO.every((t) => resolvidos.has(t));
    const vendasOk = vendasQtd > 0;
    return arrecadacaoOk && vendasOk;
  }

  /**
   * Após uma operação (upload ou marcação), verifica a transição para
   * concluído. Recebe se já estava completo ANTES da operação para notificar
   * apenas uma vez. Retorna `true` se o fechamento foi concluído agora.
   */
  async concluirSeCompletou(
    data: Date,
    completoAntes: boolean,
  ): Promise<boolean> {
    if (completoAntes) {
      return false;
    }
    const completoAgora = await this.estaCompleto(data);
    if (!completoAgora) {
      return false;
    }
    await this.notificar(inicioDoDia(data));
    return true;
  }

  /** Notifica os gestores que o fechamento do dia foi concluído com sucesso. */
  private async notificar(dia: Date): Promise<void> {
    try {
      const gestores = await this.notificacoes.gestores();
      if (gestores.length === 0) {
        return;
      }
      const dataBR = new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(dia);
      await this.notificacoes.enviar(gestores, {
        titulo: 'Fechamento concluído',
        mensagem: `O fechamento da loja do dia ${dataBR} foi concluído com sucesso.`,
      });
    } catch (erro) {
      this.logger.error(
        `Falha ao notificar fechamento concluído: ${(erro as Error).message}`,
      );
    }
  }
}
