import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { LoteApae } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import {
  atualizacaoSaldoValida,
  calcularPercentualVendido,
  calcularQuantidadeVendida,
  calcularValorArrecadado,
  criarLote,
} from './lote-apae.domain';
import {
  QuantidadeInicialInvalidaError,
  SaldoInvalidoError,
} from './lote-apae.errors';

/**
 * Serviço do ciclo de Lote de Sacolas APAE (Req 2.6): registro do lote inicial,
 * atualização de saldo com cálculo de vendida/percentual, reinício preservando
 * histórico e listagem do histórico de lotes encerrados.
 *
 * A lógica de cálculo/validação é delegada a funções puras
 * (`lote-apae.domain`); este serviço cuida apenas dos efeitos colaterais
 * (consultas e escritas via Prisma).
 */
@Injectable()
export class LoteApaeService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

  /**
   * Registra um novo lote inicial de sacolas APAE (Req 2.6.1) com o saldo
   * igual à quantidade inicial e nada vendido. Rejeita quantidade inválida.
   */
  async registrarLoteInicial(quantidadeInicial: number): Promise<LoteApae> {
    if (!Number.isInteger(quantidadeInicial) || quantidadeInicial < 0) {
      throw new QuantidadeInicialInvalidaError(quantidadeInicial);
    }
    const estado = criarLote(quantidadeInicial, new Date());
    return this.prisma.loteApae.create({
      data: {
        quantidadeInicial: estado.quantidadeInicial,
        saldoAtual: estado.saldoAtual,
        quantidadeVendida: estado.quantidadeVendida,
        dataInicio: estado.dataInicio,
        status: 'ABERTO',
      },
    });
  }

  /**
   * Atualiza o saldo restante de um lote (Req 2.6.2, 2.6.3). Calcula a
   * quantidade vendida (`inicial - saldoAtual`) e persiste. Rejeita saldo
   * atual maior que o anterior lançando `SaldoInvalidoError` (Req 2.6.4),
   * caso em que o lote permanece inalterado.
   *
   * **Ao zerar o saldo** (lote totalmente vendido), encerra automaticamente o
   * lote, salvando-o como "lote vendido" no histórico (status ENCERRADO +
   * data de encerramento). Não há mais saldo a atualizar, e um novo lote passa
   * a ser registrado pelo gerente.
   */
  async atualizarSaldo(
    loteId: string,
    saldoAtual: number,
    responsavelId?: string,
  ): Promise<LoteApae> {
    const lote = await this.prisma.loteApae.findUnique({
      where: { id: loteId },
    });
    if (!lote) {
      throw new NotFoundException('Lote de sacolas APAE não encontrado.');
    }
    if (!atualizacaoSaldoValida(lote.saldoAtual, saldoAtual)) {
      throw new SaldoInvalidoError(saldoAtual, lote.saldoAtual);
    }
    const quantidadeVendida = calcularQuantidadeVendida(
      lote.quantidadeInicial,
      saldoAtual,
    );
    const encerrarAgora = saldoAtual === 0 && lote.status === 'ABERTO';

    // Quantas foram vendidas desde a contagem anterior (delta >= 0).
    const vendidasAgora = lote.saldoAtual - saldoAtual;

    // Arrecadação do mês ANTES desta atualização (para detectar a transição
    // que atinge a meta e notificar apenas uma vez).
    const arrecadadoAntes = await this.arrecadadoNoMes(new Date());

    const atualizado = await this.prisma.$transaction(async (tx) => {
      const upd = await tx.loteApae.update({
        where: { id: loteId },
        data: {
          saldoAtual,
          quantidadeVendida,
          ...(encerrarAgora
            ? { status: 'ENCERRADO', dataEncerramento: new Date() }
            : {}),
        },
      });
      // Registra o movimento de venda (mesmo que delta seja 0, mantém o
      // histórico de contagens; só grava se houve venda).
      if (vendidasAgora > 0) {
        await tx.movimentoLoteApae.create({
          data: {
            loteId,
            vendidas: vendidasAgora,
            saldoApos: saldoAtual,
            responsavelId: responsavelId ?? null,
          },
        });
      }
      return upd;
    });

    // Notificações (não bloqueiam a resposta).
    if (vendidasAgora > 0) {
      void this.avisarMetaELote(arrecadadoAntes, atualizado);
    }

    return atualizado;
  }

  /** Soma de sacolas vendidas no mês da data (via movimentos), em R$. */
  private async arrecadadoNoMes(data: Date): Promise<number> {
    const inicio = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), 1));
    const fim = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + 1, 1));
    const agg = await this.prisma.movimentoLoteApae.aggregate({
      where: { em: { gte: inicio, lt: fim } },
      _sum: { vendidas: true },
    });
    const vendidas = Number(agg._sum.vendidas ?? 0);
    const preco = await this.precoSacola();
    return Math.round(vendidas * preco * 100) / 100;
  }

  /**
   * Notifica os gestores quando: (a) a arrecadação do mês cruza a meta nesta
   * atualização; (b) o lote ativo cai a 10% ou menos do estoque.
   */
  private async avisarMetaELote(
    arrecadadoAntes: number,
    lote: LoteApae,
  ): Promise<void> {
    if (!this.notificacoes) return;
    try {
      const config = await this.obterConfig();
      const arrecadadoAgora = await this.arrecadadoNoMes(new Date());
      const gestores = await this.notificacoes.gestores();

      // (a) Meta do mês atingida agora.
      if (
        config.metaMensal > 0 &&
        arrecadadoAntes < config.metaMensal &&
        arrecadadoAgora >= config.metaMensal
      ) {
        await this.notificacoes.enviar(gestores, {
          titulo: '🎉 Meta APAE atingida!',
          mensagem: `A arrecadação para a APAE no mês alcançou a meta de R$${config.metaMensal.toFixed(2)}. Obrigado, equipe!`,
        });
      }

      // (b) Lote acabando (<= 10% e ainda aberto).
      if (
        lote.status === 'ABERTO' &&
        lote.quantidadeInicial > 0 &&
        lote.saldoAtual > 0 &&
        lote.saldoAtual <= lote.quantidadeInicial * 0.1
      ) {
        await this.notificacoes.enviar(gestores, {
          titulo: '🛍️ Lote APAE acabando',
          mensagem: `Restam apenas ${lote.saldoAtual} sacolas no lote atual. Providencie a reposição com a APAE.`,
        });
      }
    } catch {
      // Notificação é best-effort; nunca quebra a atualização de saldo.
    }
  }

  /**
   * Percentual vendido de um lote (Req 2.6.3), sempre em [0, 1]. Delega à
   * função pura `calcularPercentualVendido`.
   */
  percentualVendido(
    lote: Pick<LoteApae, 'quantidadeInicial' | 'quantidadeVendida'>,
  ): number {
    return calcularPercentualVendido(
      lote.quantidadeInicial,
      lote.quantidadeVendida,
    );
  }

  /**
   * Valor total arrecadado (em R$) de um lote em benefício da APAE. Delega à
   * função pura `calcularValorArrecadado` (quantidade vendida × preço unitário
   * da sacola).
   */
  valorArrecadado(lote: Pick<LoteApae, 'quantidadeVendida'>): number {
    return calcularValorArrecadado(lote.quantidadeVendida);
  }

  /**
   * Retorna o lote em andamento (status ABERTO), ou `null` se não houver
   * nenhum. Substitui o estado local do app (AsyncStorage) por uma fonte
   * compartilhada no backend, permitindo retomar o lote em qualquer
   * dispositivo. Caso exista mais de um lote aberto, retorna o mais recente.
   */
  async loteAtivo(): Promise<LoteApae | null> {
    return this.prisma.loteApae.findFirst({
      where: { status: 'ABERTO' },
      orderBy: { dataInicio: 'desc' },
    });
  }

  /**
   * Reinicia o ciclo (Req 2.6.5, 2.6.6): encerra o lote atual preservando a
   * quantidade inicial, a quantidade total vendida e as datas de início e
   * encerramento, e inicia um novo lote com quantidade vendida zerada.
   */
  async reiniciarLote(
    loteId: string,
    novaQuantidadeInicial: number,
  ): Promise<{ encerrado: LoteApae; novo: LoteApae }> {
    if (!Number.isInteger(novaQuantidadeInicial) || novaQuantidadeInicial < 0) {
      throw new QuantidadeInicialInvalidaError(novaQuantidadeInicial);
    }
    const lote = await this.prisma.loteApae.findUnique({
      where: { id: loteId },
    });
    if (!lote) {
      throw new NotFoundException('Lote de sacolas APAE não encontrado.');
    }

    const agora = new Date();
    const quantidadeVendida = calcularQuantidadeVendida(
      lote.quantidadeInicial,
      lote.saldoAtual,
    );

    return this.prisma.$transaction(async (tx) => {
      const encerrado = await tx.loteApae.update({
        where: { id: loteId },
        data: {
          quantidadeVendida,
          dataEncerramento: agora,
          status: 'ENCERRADO',
        },
      });
      const novoEstado = criarLote(novaQuantidadeInicial, agora);
      const novo = await tx.loteApae.create({
        data: {
          quantidadeInicial: novoEstado.quantidadeInicial,
          saldoAtual: novoEstado.saldoAtual,
          quantidadeVendida: novoEstado.quantidadeVendida,
          dataInicio: novoEstado.dataInicio,
          status: 'ABERTO',
        },
      });
      return { encerrado, novo };
    });
  }

  /**
   * Lista o histórico de lotes encerrados (Req 2.6.7), ordenado do
   * encerramento mais recente para o mais antigo.
   */
  async historicoLotes(): Promise<LoteApae[]> {
    return this.prisma.loteApae.findMany({
      where: { status: 'ENCERRADO' },
      orderBy: { dataEncerramento: 'desc' },
    });
  }

  /**
   * Remove **todos** os lotes encerrados do histórico, retornando a quantidade
   * removida. Não afeta o lote ativo (ABERTO). Usado para limpar lotes de
   * teste; o registro de novos lotes encerrados continua normalmente.
   */
  async limparHistorico(): Promise<number> {
    const { count } = await this.prisma.loteApae.deleteMany({
      where: { status: 'ENCERRADO' },
    });
    return count;
  }

  // ===================== Configuração (preço / meta) =====================

  /** Configuração singleton (preço da sacola e meta mensal). Cria com defaults. */
  async obterConfig(): Promise<{ precoSacola: number; metaMensal: number }> {
    const cfg = await this.prisma.configApae.findUnique({ where: { id: 'apae' } });
    if (cfg) {
      return { precoSacola: Number(cfg.precoSacola), metaMensal: Number(cfg.metaMensal) };
    }
    // Cria a linha singleton com defaults na primeira leitura.
    const criada = await this.prisma.configApae.create({
      data: { id: 'apae', precoSacola: 0.49, metaMensal: 500 },
    });
    return { precoSacola: Number(criada.precoSacola), metaMensal: Number(criada.metaMensal) };
  }

  /** Preço unitário atual da sacola (config). */
  async precoSacola(): Promise<number> {
    const { precoSacola } = await this.obterConfig();
    return precoSacola;
  }

  /** Atualiza preço e/ou meta mensal (gestor). */
  async definirConfig(
    dados: { precoSacola?: number; metaMensal?: number },
    atualizadoPor?: string,
  ): Promise<{ precoSacola: number; metaMensal: number }> {
    const atual = await this.obterConfig();
    const precoSacola =
      dados.precoSacola != null && dados.precoSacola >= 0
        ? dados.precoSacola
        : atual.precoSacola;
    const metaMensal =
      dados.metaMensal != null && dados.metaMensal >= 0
        ? dados.metaMensal
        : atual.metaMensal;
    const cfg = await this.prisma.configApae.upsert({
      where: { id: 'apae' },
      update: { precoSacola, metaMensal, atualizadoPor },
      create: { id: 'apae', precoSacola, metaMensal, atualizadoPor },
    });
    return { precoSacola: Number(cfg.precoSacola), metaMensal: Number(cfg.metaMensal) };
  }

  // ===================== Painel inteligente (análises) =====================

  /**
   * Painel consolidado das Sacolas APAE: preço/meta, arrecadação do mês e do
   * mês anterior (com variação), total histórico, velocidade de venda,
   * previsão de fim do lote ativo, progresso da meta e tendência (N dias).
   */
  async painel(): Promise<{
    precoSacola: number;
    metaMensal: number;
    arrecadadoMes: number;
    arrecadadoMesAnterior: number;
    variacaoMes: number | null;
    totalHistorico: number;
    sacolasVendidasMes: number;
    velocidadeDia: number;
    previsaoDiasFimLote: number | null;
    saldoLoteAtivo: number | null;
    metaProgresso: number;
    tendencia: { data: string; vendidas: number; valor: number }[];
  }> {
    const agora = new Date();
    const { precoSacola, metaMensal } = await this.obterConfig();
    const arred = (n: number): number => Math.round(n * 100) / 100;

    const inicioMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
    const inicioProxMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1));
    const inicioMesAnterior = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 1, 1));

    const [aggMes, aggMesAnt] = await Promise.all([
      this.prisma.movimentoLoteApae.aggregate({
        where: { em: { gte: inicioMes, lt: inicioProxMes } },
        _sum: { vendidas: true },
      }),
      this.prisma.movimentoLoteApae.aggregate({
        where: { em: { gte: inicioMesAnterior, lt: inicioMes } },
        _sum: { vendidas: true },
      }),
    ]);
    const vendidasMes = Number(aggMes._sum.vendidas ?? 0);
    const vendidasMesAnt = Number(aggMesAnt._sum.vendidas ?? 0);
    const arrecadadoMes = arred(vendidasMes * precoSacola);
    const arrecadadoMesAnterior = arred(vendidasMesAnt * precoSacola);
    const variacaoMes =
      arrecadadoMesAnterior > 0
        ? arred(((arrecadadoMes - arrecadadoMesAnterior) / arrecadadoMesAnterior) * 100)
        : null;

    // Total histórico: soma de tudo já vendido (lotes encerrados + ativo),
    // robusto mesmo para lotes anteriores à introdução dos movimentos.
    const aggLotes = await this.prisma.loteApae.aggregate({
      _sum: { quantidadeVendida: true },
    });
    const totalHistorico = arred(Number(aggLotes._sum.quantidadeVendida ?? 0) * precoSacola);

    // Velocidade média: vendidas nos últimos 14 dias / 14.
    const janela = 14;
    const inicioJanela = new Date(agora.getTime() - janela * 24 * 60 * 60 * 1000);
    const aggJanela = await this.prisma.movimentoLoteApae.aggregate({
      where: { em: { gte: inicioJanela, lt: agora } },
      _sum: { vendidas: true },
    });
    const velocidadeDia = arred(Number(aggJanela._sum.vendidas ?? 0) / janela);

    // Previsão de fim do lote ativo (saldo / velocidade).
    const ativo = await this.loteAtivo();
    const saldoLoteAtivo = ativo ? ativo.saldoAtual : null;
    const previsaoDiasFimLote =
      ativo && velocidadeDia > 0 ? Math.ceil(ativo.saldoAtual / velocidadeDia) : null;

    const metaProgresso = metaMensal > 0 ? Math.min(1, arrecadadoMes / metaMensal) : 0;

    // Tendência: vendidas por dia nos últimos 30 dias.
    const dias = 30;
    const inicioTend = new Date(
      Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()) -
        (dias - 1) * 24 * 60 * 60 * 1000,
    );
    const movimentos = await this.prisma.movimentoLoteApae.findMany({
      where: { em: { gte: inicioTend } },
      select: { em: true, vendidas: true },
    });
    const porDia = new Map<string, number>();
    for (const m of movimentos) {
      const k = m.em.toISOString().slice(0, 10);
      porDia.set(k, (porDia.get(k) ?? 0) + m.vendidas);
    }
    const tendencia: { data: string; vendidas: number; valor: number }[] = [];
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date(
        Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()) -
          i * 24 * 60 * 60 * 1000,
      );
      const k = d.toISOString().slice(0, 10);
      const v = porDia.get(k) ?? 0;
      tendencia.push({ data: k, vendidas: v, valor: arred(v * precoSacola) });
    }

    return {
      precoSacola,
      metaMensal,
      arrecadadoMes,
      arrecadadoMesAnterior,
      variacaoMes,
      totalHistorico,
      sacolasVendidasMes: vendidasMes,
      velocidadeDia,
      previsaoDiasFimLote,
      saldoLoteAtivo,
      metaProgresso,
      tendencia,
    };
  }
}
