import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { InsumosService } from './insumos.service';

/**
 * Serviço proativo de insumos.
 *
 * Crons:
 * 1. Verificação diária (07:00): analisa estoque e gera requisições automáticas
 *    para insumos em nível CRITICO. Notifica gestores.
 * 2. Alerta de ruptura iminente (12:00): notifica se algum insumo vai acabar
 *    em 3 dias ou menos (predicción ponderada).
 *
 * A auto-reposição NÃO substitui a aprovação — cria requisições com status
 * PENDENTE para casos normais (nível CRITICO). O gestor é notificado e pode
 * negar se quiser. Para casos ATENCAO, apenas notifica sem criar requisição.
 *
 * Fuso: America/Sao_Paulo.
 */
@Injectable()
export class InsumosProativoService {
  private readonly logger = new Logger(InsumosProativoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly insumos: InsumosService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  /**
   * CRON 1: Auto-reposição para insumos em nível CRITICO.
   * Roda todo dia às 07:00 (antes da abertura).
   * Cria requisição automática com a quantidade sugerida.
   */
  @Cron('0 7 * * *', { timeZone: 'America/Sao_Paulo' })
  async autoReposicao(): Promise<void> {
    const criticos = await this.insumos.insumosParaRepor();
    const apenasUrgentes = criticos.filter((i) => i.nivel === 'CRITICO');

    if (apenasUrgentes.length === 0) {
      this.logger.log(
        'Auto-reposição: todos os insumos em nível OK ou ATENÇÃO.',
      );
      return;
    }

    const gestores = await this.notificacoes.gestores();
    const linhas: string[] = [];

    for (const insumo of apenasUrgentes) {
      // Verificar se já existe requisição pendente para esse insumo.
      const pendente = await this.prisma.requisicao.findFirst({
        where: { insumoId: insumo.id, status: 'PENDENTE' },
      });
      if (pendente) continue; // Já tem requisição pendente, não duplicar.

      // Criar requisição automática.
      await this.prisma.requisicao.create({
        data: {
          insumoId: insumo.id,
          quantidade: insumo.sugestaoReposicao,
          status: 'PENDENTE',
          observacao: `[Auto] Reposição automática — estoque crítico (${insumo.saldo} ${insumo.unidade}s restantes).`,
          solicitanteNome: 'Sistema (auto-reposição)',
        },
      });

      const plural =
        insumo.sugestaoReposicao === 1
          ? insumo.embalagem
          : `${insumo.embalagem}s`;
      linhas.push(
        `• ${insumo.nome}: ${insumo.sugestaoReposicao} ${plural} (saldo: ${insumo.saldo})`,
      );
      this.logger.log(
        `Auto-requisição: ${insumo.nome} — ${insumo.sugestaoReposicao} ${plural}.`,
      );
    }

    if (linhas.length > 0) {
      await this.notificacoes.enviar(gestores, {
        titulo: '📦 Reposição automática criada',
        mensagem: `Insumos em nível crítico precisam de reposição:\n${linhas.join('\n')}\n\nAprove as requisições para dar entrada no estoque.`,
      });
    }
  }

  /**
   * CRON 2: Alerta de ruptura iminente (≤3 dias).
   * Roda todo dia às 12:00 (meio do expediente).
   */
  @Cron('0 12 * * *', { timeZone: 'America/Sao_Paulo' })
  async alertaRupturaIminente(): Promise<void> {
    const todos = await this.insumos.listarProativo();
    const iminentes = todos.filter(
      (i) => i.diasAteRuptura !== null && i.diasAteRuptura <= 3,
    );

    if (iminentes.length === 0) return;

    const gestores = await this.notificacoes.gestores();
    const linhas = iminentes.map(
      (i) =>
        `• ${i.nome}: ~${i.diasAteRuptura} dia${i.diasAteRuptura === 1 ? '' : 's'} até acabar (saldo: ${i.saldo})`,
    );

    await this.notificacoes.enviar(gestores, {
      titulo: '🚨 Ruptura iminente de insumos',
      mensagem: `Os seguintes insumos podem acabar em breve:\n${linhas.join('\n')}\n\nVerifique o estoque e providencie reposição.`,
    });

    this.logger.warn(
      `Alerta de ruptura: ${iminentes.length} insumo(s) iminente(s).`,
    );
  }

  /**
   * CRON 3: Relatório semanal de consumo (segunda-feira 08:00).
   * Envia resumo da semana anterior aos gestores.
   */
  @Cron('0 8 * * 1', { timeZone: 'America/Sao_Paulo' })
  async relatorioSemanal(): Promise<void> {
    const todos = await this.insumos.listarProativo();
    const gestores = await this.notificacoes.gestores();

    const linhas = todos.map((i) => {
      const nivel =
        i.nivel === 'CRITICO' ? '🔴' : i.nivel === 'ATENCAO' ? '🟡' : '🟢';
      return `${nivel} ${i.nome}: consumo ${i.consumoSemana} | entrada ${i.entradaSemana} | saldo ${i.saldo}`;
    });

    await this.notificacoes.enviar(gestores, {
      titulo: '📊 Relatório semanal de insumos',
      mensagem: linhas.join('\n'),
    });
  }
}
