import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { LinhaArrecadacao } from './arrecadacao.parser';
import {
  CONFIG_ARRECADACAO,
  TipoArrecadacao,
  TIPOS_ARRECADACAO,
  inicioDaProximaSemana,
  inicioDaSemana,
  inicioDoDia,
  inicioDoMes,
  inicioDoProximoDia,
  inicioDoProximoMes,
} from './arrecadacao.domain';

export interface ResultadoUploadArrecadacao {
  tipo: TipoArrecadacao;
  data: Date;
  quantidade: number;
  total: number;
}

export interface ResumoArrecadacao {
  tipo: TipoArrecadacao;
  titulo: string;
  base: 'FIXA' | 'VENDAS';
  meta: number;
  sentido: 'MAIOR_MELHOR' | 'MENOR_MELHOR';
  totalDia: number;
  totalSemana: number;
  totalMes: number;
  quantidadeDia: number;
  // Soma da quantidade (ex.: itens cancelados), quando o arquivo informa.
  itensDia: number;
  itensSemana: number;
  itensMes: number;
  // Apenas para base 'VENDAS': vendas do período e o % (total / vendas * 100).
  vendasDia?: number;
  vendasSemana?: number;
  vendasMes?: number;
  percentualDia?: number;
  percentualSemana?: number;
  percentualMes?: number;
}

export interface ItemRankingArrecadacao {
  nome: string;
  total: number;
  /** Soma da quantidade (itens/cupons) do operador, quando informado. */
  quantidade: number | null;
}

export interface DetalheArrecadacao {
  nome: string;
  autorizadoPor: string | null;
  motivo: string | null;
  valor: number;
  data: string;
}

/** Estado de um arquivo de arrecadação no dia. */
export type StatusArquivo = 'ENVIADO' | 'SEM_MOVIMENTO' | 'PENDENTE';

/** Mapa tipo -> estado (enviado / sem movimento / pendente) no dia. */
export type StatusArrecadacao = Record<TipoArrecadacao, StatusArquivo>;

function arredondar(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Serviço de arrecadação: importa as linhas de um arquivo (substituindo o dia),
 * e calcula totais (dia/semana/mês) e ranking por operador para os indicadores.
 */
@Injectable()
export class ArrecadacaoService {
  private readonly logger = new Logger(ArrecadacaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  /** Substitui os lançamentos do tipo no dia informado pelos do arquivo. */
  async importar(
    tipo: TipoArrecadacao,
    data: Date,
    linhas: LinhaArrecadacao[],
  ): Promise<ResultadoUploadArrecadacao> {
    const dia = inicioDoDia(data);
    const proximo = inicioDoProximoDia(data);
    // Verifica se o dia já estava completo antes deste envio, para só notificar
    // o fechamento na transição (evita avisos repetidos em reenvios).
    const completoAntes = await this.diaCompleto(data);
    await this.prisma.$transaction([
      this.prisma.registroArrecadacao.deleteMany({
        where: { tipo, data: { gte: dia, lt: proximo } },
      }),
      this.prisma.registroArrecadacao.createMany({
        data: linhas.map((l) => ({
          tipo,
          data: dia,
          nome: l.nome,
          matricula: l.matricula ?? null,
          valor: l.valor,
          quantidade: l.quantidade ?? null,
          autorizadoPor: l.autorizadoPor ?? null,
          motivo: l.motivo ?? null,
        })),
      }),
      // Houve movimento de fato: remove eventual marca de "sem movimento".
      this.prisma.arrecadacaoSemMovimento.deleteMany({
        where: { tipo, data: { gte: dia, lt: proximo } },
      }),
    ]);
    // Se este envio completou os 5 arquivos do dia, avisa os gerentes.
    if (!completoAntes) {
      const completoAgora = await this.diaCompleto(data);
      if (completoAgora) {
        await this.notificarFechamentoConcluido(dia);
      }
    }
    const total = linhas.reduce((soma, l) => soma + l.valor, 0);
    return {
      tipo,
      data: dia,
      quantidade: linhas.length,
      total: arredondar(total),
    };
  }

  /** Indica se todos os 5 tipos já foram enviados no dia informado. */
  private async diaCompleto(data: Date): Promise<boolean> {
    const status = await this.status(data);
    // "Completo" = nenhum tipo pendente (enviado OU marcado sem movimento).
    return TIPOS_ARRECADACAO.every((tipo) => status[tipo] !== 'PENDENTE');
  }

  /**
   * Notifica os gerentes que o fechamento da loja foi concluído com sucesso
   * (todos os arquivos do dia enviados). Falhas no envio não interrompem a
   * importação.
   */
  private async notificarFechamentoConcluido(dia: Date): Promise<void> {
    try {
      const gerentes = await this.notificacoes.loginGerencial();
      if (gerentes.length === 0) {
        return;
      }
      const dataBR = new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(dia);
      await this.notificacoes.enviar(gerentes, {
        titulo: 'Fechamento concluído',
        mensagem: `O fechamento da loja do dia ${dataBR} foi realizado com sucesso. Todos os arquivos dos indicadores foram enviados.`,
      });
    } catch (erro) {
      this.logger.error(
        `Falha ao notificar fechamento concluído: ${(erro as Error).message}`,
      );
    }
  }

  /** Status (enviado / sem movimento / pendente) de cada tipo no dia. */
  async status(data: Date): Promise<StatusArrecadacao> {
    const dia = inicioDoDia(data);
    const proximo = inicioDoProximoDia(data);
    const [grupos, marcas] = await Promise.all([
      this.prisma.registroArrecadacao.groupBy({
        by: ['tipo'],
        where: { data: { gte: dia, lt: proximo } },
        _count: { _all: true },
      }),
      this.prisma.arrecadacaoSemMovimento.findMany({
        where: { data: { gte: dia, lt: proximo } },
        select: { tipo: true },
      }),
    ]);
    const enviados = new Set(
      grupos.filter((g) => (g._count?._all ?? 0) > 0).map((g) => g.tipo),
    );
    const semMovimento = new Set(marcas.map((m) => m.tipo));
    const resultado = {} as StatusArrecadacao;
    for (const tipo of TIPOS_ARRECADACAO) {
      resultado[tipo] = enviados.has(tipo)
        ? 'ENVIADO'
        : semMovimento.has(tipo)
          ? 'SEM_MOVIMENTO'
          : 'PENDENTE';
    }
    return resultado;
  }

  /**
   * Marca um tipo como "sem movimento" no dia (ex.: nenhum cancelamento de
   * itens). Idempotente (upsert por tipo+data).
   */
  async marcarSemMovimento(
    tipo: TipoArrecadacao,
    data: Date,
    marcadoPor?: string,
  ): Promise<void> {
    const dia = inicioDoDia(data);
    await this.prisma.arrecadacaoSemMovimento.upsert({
      where: { tipo_data: { tipo, data: dia } },
      update: { marcadoPor },
      create: { tipo, data: dia, marcadoPor },
    });
  }

  /** Remove a marca de "sem movimento" de um tipo no dia (correção). */
  async removerSemMovimento(tipo: TipoArrecadacao, data: Date): Promise<void> {
    const dia = inicioDoDia(data);
    const proximo = inicioDoProximoDia(data);
    await this.prisma.arrecadacaoSemMovimento.deleteMany({
      where: { tipo, data: { gte: dia, lt: proximo } },
    });
  }

  private async somar(
    tipo: TipoArrecadacao,
    gte: Date,
    lt: Date,
  ): Promise<number> {
    const r = await this.prisma.registroArrecadacao.aggregate({
      where: { tipo, data: { gte, lt } },
      _sum: { valor: true },
    });
    return arredondar(Number(r._sum.valor ?? 0));
  }

  private async somarVendas(gte: Date, lt: Date): Promise<number> {
    const r = await this.prisma.vendaDiaria.aggregate({
      where: { data: { gte, lt } },
      _sum: { valor: true },
    });
    return arredondar(Number(r._sum.valor ?? 0));
  }

  /** Soma da quantidade (itens/cupons) do tipo no intervalo. */
  private async somarItens(
    tipo: TipoArrecadacao,
    gte: Date,
    lt: Date,
  ): Promise<number> {
    const r = await this.prisma.registroArrecadacao.aggregate({
      where: { tipo, data: { gte, lt } },
      _sum: { quantidade: true },
    });
    return Number(r._sum.quantidade ?? 0);
  }

  /** Totais do dia, da semana (seg–dom) e do mês que contêm a data. */
  async resumo(tipo: TipoArrecadacao, data: Date): Promise<ResumoArrecadacao> {
    const config = CONFIG_ARRECADACAO[tipo];
    const totalDia = await this.somar(
      tipo,
      inicioDoDia(data),
      inicioDoProximoDia(data),
    );
    const totalSemana = await this.somar(
      tipo,
      inicioDaSemana(data),
      inicioDaProximaSemana(data),
    );
    const totalMes = await this.somar(
      tipo,
      inicioDoMes(data),
      inicioDoProximoMes(data),
    );
    const quantidadeDia = await this.prisma.registroArrecadacao.count({
      where: {
        tipo,
        data: { gte: inicioDoDia(data), lt: inicioDoProximoDia(data) },
      },
    });

    const itensDia = await this.somarItens(
      tipo,
      inicioDoDia(data),
      inicioDoProximoDia(data),
    );
    const itensSemana = await this.somarItens(
      tipo,
      inicioDaSemana(data),
      inicioDaProximaSemana(data),
    );
    const itensMes = await this.somarItens(
      tipo,
      inicioDoMes(data),
      inicioDoProximoMes(data),
    );

    const base: ResumoArrecadacao = {
      tipo,
      titulo: config.titulo,
      base: config.base,
      meta: config.meta,
      sentido: config.sentido,
      totalDia,
      totalSemana,
      totalMes,
      quantidadeDia,
      itensDia,
      itensSemana,
      itensMes,
    };

    if (config.base !== 'VENDAS') {
      return base;
    }

    // Indicador sobre vendas: calcula vendas do período e o percentual.
    const vendasDia = await this.somarVendas(
      inicioDoDia(data),
      inicioDoProximoDia(data),
    );
    const vendasSemana = await this.somarVendas(
      inicioDaSemana(data),
      inicioDaProximaSemana(data),
    );
    const vendasMes = await this.somarVendas(
      inicioDoMes(data),
      inicioDoProximoMes(data),
    );
    const pct = (valor: number, vendas: number): number =>
      vendas > 0 ? arredondar((valor / vendas) * 100) : 0;

    return {
      ...base,
      vendasDia,
      vendasSemana,
      vendasMes,
      percentualDia: pct(totalDia, vendasDia),
      percentualSemana: pct(totalSemana, vendasSemana),
      percentualMes: pct(totalMes, vendasMes),
    };
  }

  /** Ranking por operador (soma do valor) no intervalo [inicio, fim]. */
  async ranking(
    tipo: TipoArrecadacao,
    inicio: Date,
    fim: Date,
  ): Promise<ItemRankingArrecadacao[]> {
    const gte = inicioDoDia(inicio);
    const lt = inicioDoProximoDia(fim);
    const grupos = await this.prisma.registroArrecadacao.groupBy({
      by: ['nome'],
      where: { tipo, data: { gte, lt } },
      _sum: { valor: true, quantidade: true },
      orderBy: { _sum: { valor: 'desc' } },
    });
    return grupos.map((g) => ({
      nome: g.nome,
      total: arredondar(Number(g._sum.valor ?? 0)),
      quantidade:
        g._sum.quantidade === null || g._sum.quantidade === undefined
          ? null
          : Number(g._sum.quantidade),
    }));
  }

  /**
   * Detalhe de cada lançamento no intervalo (operador, quem autorizou, motivo
   * e valor). Útil para o cancelamento de cupom, onde o gerente quer ver cada
   * cancelamento individualmente. Ordenado pelo maior valor.
   */
  async detalhes(
    tipo: TipoArrecadacao,
    inicio: Date,
    fim: Date,
  ): Promise<DetalheArrecadacao[]> {
    const gte = inicioDoDia(inicio);
    const lt = inicioDoProximoDia(fim);
    const regs = await this.prisma.registroArrecadacao.findMany({
      where: { tipo, data: { gte, lt } },
      orderBy: { valor: 'desc' },
      take: 300,
    });
    return regs.map((r) => ({
      nome: r.nome,
      autorizadoPor: r.autorizadoPor,
      motivo: r.motivo,
      valor: arredondar(Number(r.valor)),
      data: r.data.toISOString(),
    }));
  }
}
