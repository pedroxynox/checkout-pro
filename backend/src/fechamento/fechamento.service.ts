import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { inicioDoDia, inicioDoProximoDia } from '../common/datas';
import {
  TIPOS_ARRECADACAO,
  TipoArrecadacao,
} from '../arrecadacao/arrecadacao.domain';
import {
  ResumoFechamento,
  StatusArrecadacaoBruto,
  StatusChecklistBruto,
  montarResumoFechamento,
} from './fechamento.domain';

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
   * Resumo inteligente do fechamento do dia (Fase 1): o estado de cada item
   * (5 arrecadações + vendas + 2 checklists), o que falta e alertas de
   * consistência. Somente leitura — não altera nada nem dispara notificações.
   */
  async resumo(data: Date): Promise<ResumoFechamento & { dataISO: string }> {
    const dia = inicioDoDia(data);
    const proximo = inicioDoProximoDia(data);
    const [grupos, marcas, vendasQtd, checklists] = await Promise.all([
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
      this.prisma.checklist.findMany({
        where: { data: { gte: dia, lt: proximo } },
        select: { tipo: true, status: true },
      }),
    ]);

    const enviados = new Set<string>();
    for (const g of grupos) {
      if ((g._count?._all ?? 0) > 0) enviados.add(g.tipo);
    }
    const semMovimento = new Set(marcas.map((m) => m.tipo));
    const arrecadacao = {} as Record<TipoArrecadacao, StatusArrecadacaoBruto>;
    for (const tipo of TIPOS_ARRECADACAO) {
      arrecadacao[tipo] = enviados.has(tipo)
        ? 'ENVIADO'
        : semMovimento.has(tipo)
          ? 'SEM_MOVIMENTO'
          : 'PENDENTE';
    }

    const statusChecklist = (
      tipo: 'ABERTURA' | 'FECHAMENTO',
    ): StatusChecklistBruto =>
      checklists.find((c) => c.tipo === tipo)?.status === 'FEITO'
        ? 'FEITO'
        : 'PENDENTE';

    const diaPassou = dia.getTime() < inicioDoDia(new Date()).getTime();

    const resumo = montarResumoFechamento({
      arrecadacao,
      vendasEnviado: vendasQtd > 0,
      checklistAbertura: statusChecklist('ABERTURA'),
      checklistFechamento: statusChecklist('FECHAMENTO'),
      diaPassou,
    });

    return { ...resumo, dataISO: dia.toISOString().slice(0, 10) };
  }

  /**
   * Após uma operação (upload ou marcação), verifica a transição para
   * concluído e notifica os gestores **exatamente uma vez** — mesmo sob
   * uploads concorrentes. A notificação única é garantida por uma marca
   * idempotente por dia (`FechamentoConcluido`), cuja unicidade de `data` atua
   * como trava atômica. Retorna `true` se o fechamento foi concluído (e
   * notificado) agora; `false` se ainda incompleto ou se já havia sido
   * concluído.
   */
  async concluirSeCompletou(data: Date): Promise<boolean> {
    const completoAgora = await this.estaCompleto(data);
    if (!completoAgora) {
      return false;
    }
    const dia = inicioDoDia(data);
    try {
      // Insere a marca do dia. A unicidade de `data` atua como trava atômica:
      // sob concorrência, apenas UMA inserção vence e notifica.
      await this.prisma.fechamentoConcluido.create({ data: { data: dia } });
    } catch (erro) {
      // P2002 = violação de unicidade → já concluído/notificado. Idempotente.
      if ((erro as { code?: string }).code === 'P2002') {
        return false;
      }
      throw erro;
    }
    await this.notificar(dia);
    return true;
  }

  /** Notifica os gestores que o fechamento do dia foi concluído com sucesso. */
  private async notificar(dia: Date): Promise<void> {
    try {
      const gestores = await this.notificacoes.destinatariosComPermissao('FECHAMENTO');
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
