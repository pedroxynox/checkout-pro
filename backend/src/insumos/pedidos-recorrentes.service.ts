import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { InsumosService } from './insumos.service';

/**
 * Serviço de Pedidos Recorrentes de Insumos.
 *
 * O gestor configura um padrão de compra (ex.: toda segunda, 4 galões de
 * álcool + 6 caixas de bobina + 2 rolos de pano). O sistema gera sugestões
 * automáticas no domingo à noite (20:00) para pedidos semanais, ou no dia
 * anterior para pedidos quinzenais.
 *
 * Fluxo:
 * 1. Cron gera SugestaoPedido com status PENDENTE (agrupadas por lote).
 * 2. O gestor vê o "Pedido da semana" no app.
 * 3. Pode ajustar quantidades ou confirmar direto.
 * 4. Ao confirmar, registra a entrada no estoque (ou gera requisição).
 *
 * Inteligência:
 * - Se o saldo atual já cobre a demanda, reduz a sugestão.
 * - Se o consumo recente foi maior que o habitual, aumenta a sugestão.
 */
@Injectable()
export class PedidosRecorrentesService {
  private readonly logger = new Logger(PedidosRecorrentesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacoes: NotificacoesService,
    private readonly insumos: InsumosService,
  ) {}

  /**
   * Cron: Gerar sugestões de pedido.
   * Roda domingo às 20:00 (para pedidos semanais de segunda).
   * Para quinzenais, verifica se passaram os dias necessários.
   */
  @Cron('0 20 * * 0', { timeZone: 'America/Sao_Paulo' })
  async gerarSugestoes(): Promise<void> {
    const agora = new Date();
    const lote = `pedido-${agora.toISOString().slice(0, 10)}`;

    // Verificar se já gerou sugestões para esse lote.
    const existente = await this.prisma.sugestaoPedido.findFirst({
      where: { lote },
    });
    if (existente) {
      this.logger.log(`Sugestões já geradas para lote ${lote}. Pulando.`);
      return;
    }

    const pedidos = await this.prisma.pedidoRecorrente.findMany({
      where: { ativo: true },
      include: { insumo: true },
    });

    if (pedidos.length === 0) {
      this.logger.log('Nenhum pedido recorrente configurado.');
      return;
    }

    const proativos = await this.insumos.listarProativo();
    const sugestoesCriadas: string[] = [];

    for (const pedido of pedidos) {
      // Verificar frequência: quinzenais só geram a cada 15 dias.
      if (pedido.frequenciaDias > 7) {
        const ultimaSugestao = await this.prisma.sugestaoPedido.findFirst({
          where: { insumoId: pedido.insumoId, status: 'CONFIRMADA' },
          orderBy: { confirmadaEm: 'desc' },
        });
        if (ultimaSugestao?.confirmadaEm) {
          const diasDesde = Math.floor(
            (agora.getTime() - ultimaSugestao.confirmadaEm.getTime()) / (24 * 60 * 60 * 1000),
          );
          if (diasDesde < pedido.frequenciaDias - 1) continue; // Ainda não é hora.
        }
      }

      // Ajuste inteligente baseado no saldo atual.
      const insumoProativo = proativos.find((i) => i.id === pedido.insumoId);
      let quantidadeSugerida = pedido.quantidade;

      if (insumoProativo) {
        const saldoEmEmbalagens = Math.floor(
          insumoProativo.saldo / insumoProativo.fatorEmbalagem,
        );
        const consumoSemanalEmb = Math.ceil(
          insumoProativo.consumoSemana / insumoProativo.fatorEmbalagem,
        );

        // Se o saldo já cobre mais de 2 semanas, reduzir a sugestão.
        if (saldoEmEmbalagens >= consumoSemanalEmb * 2 && pedido.frequenciaDias <= 7) {
          const reducao = Math.floor(saldoEmEmbalagens / 2);
          quantidadeSugerida = Math.max(1, pedido.quantidade - reducao);
        }

        // Se o consumo recente foi maior que o habitual, aumentar.
        if (consumoSemanalEmb > pedido.quantidade && pedido.frequenciaDias <= 7) {
          quantidadeSugerida = Math.max(quantidadeSugerida, consumoSemanalEmb);
        }
      }

      await this.prisma.sugestaoPedido.create({
        data: {
          insumoId: pedido.insumoId,
          quantidade: quantidadeSugerida,
          lote,
          status: 'PENDENTE',
        },
      });

      const emb = pedido.insumo.embalagem;
      sugestoesCriadas.push(
        `• ${quantidadeSugerida} ${emb}${quantidadeSugerida > 1 ? 's' : ''} de ${pedido.insumo.nome}`,
      );
    }

    if (sugestoesCriadas.length > 0) {
      const gestores = await this.notificacoes.gestores();
      await this.notificacoes.enviar(gestores, {
        titulo: '📋 Pedido da semana gerado',
        mensagem: `Sugestão de pedido para amanhã:\n${sugestoesCriadas.join('\n')}\n\nConfirme no app para dar entrada.`,
      });
      this.logger.log(`Sugestões geradas: ${sugestoesCriadas.length} itens (lote ${lote}).`);
    }
  }

  /** Lista sugestões pendentes (para o card "Pedido da semana"). */
  async listarPendentes() {
    const sugestoes = await this.prisma.sugestaoPedido.findMany({
      where: { status: 'PENDENTE' },
      include: { insumo: { select: { nome: true, embalagem: true, fatorEmbalagem: true, unidade: true } } },
      orderBy: { criadaEm: 'desc' },
    });
    return sugestoes.map((s) => ({
      id: s.id,
      insumoId: s.insumoId,
      insumoNome: s.insumo.nome,
      embalagem: s.insumo.embalagem,
      fatorEmbalagem: s.insumo.fatorEmbalagem,
      unidade: s.insumo.unidade,
      quantidade: s.quantidade,
      quantidadeAjustada: s.quantidadeAjustada,
      lote: s.lote,
      criadaEm: s.criadaEm,
    }));
  }

  /** Próximo pedido de sacolas (quinzenal): quantos dias faltam. */
  async proximoPedidoQuinzenal(): Promise<{ diasRestantes: number } | null> {
    const pedidoQuinzenal = await this.prisma.pedidoRecorrente.findFirst({
      where: { ativo: true, frequenciaDias: { gt: 7 } },
    });
    if (!pedidoQuinzenal) return null;

    const ultimaConfirmada = await this.prisma.sugestaoPedido.findFirst({
      where: { insumoId: pedidoQuinzenal.insumoId, status: 'CONFIRMADA' },
      orderBy: { confirmadaEm: 'desc' },
    });

    if (!ultimaConfirmada?.confirmadaEm) {
      return { diasRestantes: 0 }; // Nunca confirmou, pedir agora.
    }

    const diasDesde = Math.floor(
      (Date.now() - ultimaConfirmada.confirmadaEm.getTime()) / (24 * 60 * 60 * 1000),
    );
    const restantes = Math.max(0, pedidoQuinzenal.frequenciaDias - diasDesde);
    return { diasRestantes: restantes };
  }

  /**
   * Confirmar sugestões (todas as pendentes de um lote, ou individualmente).
   * Ao confirmar, registra entrada no estoque.
   */
  async confirmarSugestoes(
    ids: string[],
    ajustes?: Record<string, number>,
    confirmadoPor?: string,
  ): Promise<{ confirmadas: number }> {
    let confirmadas = 0;
    const agora = new Date();

    for (const id of ids) {
      const sugestao = await this.prisma.sugestaoPedido.findUnique({
        where: { id },
        include: { insumo: true },
      });
      if (!sugestao || sugestao.status !== 'PENDENTE') continue;

      const qtdFinal = ajustes?.[id] ?? sugestao.quantidade;
      const base = qtdFinal * sugestao.insumo.fatorEmbalagem;

      // Registrar entrada no estoque.
      await this.insumos.registrarEntrada(
        sugestao.insumoId,
        base,
        'PEDIDO_RECORRENTE',
        confirmadoPor,
        agora,
      );

      // Marcar como confirmada.
      await this.prisma.sugestaoPedido.update({
        where: { id },
        data: {
          status: 'CONFIRMADA',
          quantidadeAjustada: ajustes?.[id] != null ? ajustes[id] : undefined,
          confirmadaEm: agora,
          confirmadaPor: confirmadoPor,
        },
      });

      confirmadas++;
    }

    return { confirmadas };
  }

  /** Ignorar sugestões (descartar sem dar entrada). */
  async ignorarSugestoes(ids: string[]): Promise<void> {
    await this.prisma.sugestaoPedido.updateMany({
      where: { id: { in: ids }, status: 'PENDENTE' },
      data: { status: 'IGNORADA' },
    });
  }

  /** Lista todos os pedidos recorrentes configurados. */
  async listarPedidosRecorrentes() {
    return this.prisma.pedidoRecorrente.findMany({
      where: { ativo: true },
      include: { insumo: { select: { nome: true, embalagem: true } } },
      orderBy: { criadoEm: 'asc' },
    });
  }

  /** Configura (cria/atualiza) um pedido recorrente. */
  async configurar(
    insumoId: string,
    quantidade: number,
    frequenciaDias: number,
    diaSugestao = 1,
  ) {
    // Verificar se já existe para esse insumo.
    const existente = await this.prisma.pedidoRecorrente.findFirst({
      where: { insumoId, ativo: true },
    });
    if (existente) {
      return this.prisma.pedidoRecorrente.update({
        where: { id: existente.id },
        data: { quantidade, frequenciaDias, diaSugestao },
      });
    }
    return this.prisma.pedidoRecorrente.create({
      data: { insumoId, quantidade, frequenciaDias, diaSugestao },
    });
  }
}
