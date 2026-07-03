import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FechamentoService } from '../fechamento/fechamento.service';
import { MetasService } from '../metas/metas.service';
import { anoMesDe, ehTipoMeta } from '../metas/metas.domain';
import {
  montarVinculo,
  type VinculoColaboradores,
} from '../colaboradores/perfil-colaborador.domain';
import { normalizarMatricula } from '../colaboradores/colaboradores.domain';
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
  /** Verdadeiro se ESTE envio concluiu o fechamento do dia. */
  fechamentoConcluido: boolean;
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

/**
 * Agregado dos lançamentos NÃO reconhecidos (cuja matrícula/login do arquivo
 * não casa com nenhum colaborador cadastrado) de um tipo num período. Serve
 * para a linha "Não reconhecidos" do indicador (Opção B): o total do indicador
 * soma TODOS os lançamentos, e esta é a parte que veio de gente sem cadastro.
 */
export interface ResumoNaoReconhecido {
  total: number;
  lancamentos: number;
}

/**
 * Um código "solto" (matrícula/login do arquivo) que não casa com nenhum
 * colaborador cadastrado, agregado no período (somando todos os indicadores).
 * É a unidade da "fila de não reconhecidos": ao associar este código a um
 * colaborador (como identificador), o histórico passa a ser atribuído a ele.
 */
export interface ItemNaoReconhecido {
  /** Código bruto como veio do arquivo (matrícula/login do operador). */
  matricula: string;
  /** Nome bruto representativo (o mais recente encontrado). */
  nome: string;
  total: number;
  lancamentos: number;
  /** Indicadores em que esse código apareceu. */
  tipos: TipoArrecadacao[];
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly fechamento: FechamentoService,
    private readonly metas: MetasService,
  ) {}

  /** Substitui os lançamentos do tipo no dia informado pelos do arquivo. */
  async importar(
    tipo: TipoArrecadacao,
    data: Date,
    linhas: LinhaArrecadacao[],
  ): Promise<ResultadoUploadArrecadacao> {
    const dia = inicioDoDia(data);
    const proximo = inicioDoProximoDia(data);
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
    const fechamentoConcluido =
      await this.fechamento.concluirSeCompletou(data);
    const total = linhas.reduce((soma, l) => soma + l.valor, 0);
    return {
      tipo,
      data: dia,
      quantidade: linhas.length,
      total: arredondar(total),
      fechamentoConcluido,
    };
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
   * itens). Idempotente (upsert por tipo+data). Pode concluir o fechamento do
   * dia (último item resolvido) — daí retornar `fechamentoConcluido`.
   */
  async marcarSemMovimento(
    tipo: TipoArrecadacao,
    data: Date,
    marcadoPor?: string,
  ): Promise<{ fechamentoConcluido: boolean }> {
    const dia = inicioDoDia(data);
    await this.prisma.arrecadacaoSemMovimento.upsert({
      where: { tipo_data: { tipo, data: dia } },
      update: { marcadoPor },
      create: { tipo, data: dia, marcadoPor },
    });
    const fechamentoConcluido =
      await this.fechamento.concluirSeCompletou(data);
    return { fechamentoConcluido };
  }

  /** Remove a marca de "sem movimento" de um tipo no dia (correção). */
  async removerSemMovimento(tipo: TipoArrecadacao, data: Date): Promise<void> {
    const dia = inicioDoDia(data);
    const proximo = inicioDoProximoDia(data);
    await this.prisma.arrecadacaoSemMovimento.deleteMany({
      where: { tipo, data: { gte: dia, lt: proximo } },
    });
  }

  /**
   * Resolve a meta de um indicador para o mês da `data`. Para os tipos geridos
   * em Centro de Controle ▸ Metas (recargas, cancelamentos, devoluções), usa a
   * meta MENSAL (MetasService, com fallback ao padrão). TROCO_SOLIDARIO não é
   * gerido por mês: segue com a meta global de `metas_indicador`/CONFIG.
   */
  async metaDe(tipo: TipoArrecadacao, data: Date): Promise<number> {
    // Tipos com meta mensal (todos, exceto TROCO_SOLIDARIO).
    if (ehTipoMeta(tipo)) {
      return this.metas.resolver(tipo, anoMesDe(data));
    }
    try {
      const registro = await this.prisma.metaIndicador.findUnique({
        where: { tipo },
      });
      if (registro) {
        return Number(registro.meta);
      }
    } catch {
      // Tabela ainda não migrada: usa o default.
    }
    return CONFIG_ARRECADACAO[tipo].meta;
  }

  /** Lista todas as metas configuradas (com fallback ao default). */
  async listarMetas(): Promise<
    {
      tipo: TipoArrecadacao;
      titulo: string;
      meta: number;
      base: string;
      sentido: string;
    }[]
  > {
    const hoje = new Date();
    return Promise.all(
      TIPOS_ARRECADACAO.map(async (tipo) => {
        const config = CONFIG_ARRECADACAO[tipo];
        return {
          tipo,
          titulo: config.titulo,
          meta: await this.metaDe(tipo, hoje),
          base: config.base,
          sentido: config.sentido,
        };
      }),
    );
  }

  /** Atualiza (ou cria) a meta de um indicador. */
  async definirMeta(
    tipo: TipoArrecadacao,
    meta: number,
    atualizadoPor?: string,
  ): Promise<{ tipo: TipoArrecadacao; meta: number }> {
    await this.prisma.metaIndicador.upsert({
      where: { tipo },
      update: { meta, atualizadoPor },
      create: { tipo, meta, atualizadoPor },
    });
    return { tipo, meta };
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
    const diaIni = inicioDoDia(data);
    const diaFim = inicioDoProximoDia(data);
    const semIni = inicioDaSemana(data);
    const semFim = inicioDaProximaSemana(data);
    const mesIni = inicioDoMes(data);
    const mesFim = inicioDoProximoMes(data);

    const [
      totalDia,
      totalSemana,
      totalMes,
      quantidadeDia,
      itensDia,
      itensSemana,
      itensMes,
      meta,
    ] = await Promise.all([
      this.somar(tipo, diaIni, diaFim),
      this.somar(tipo, semIni, semFim),
      this.somar(tipo, mesIni, mesFim),
      this.prisma.registroArrecadacao.count({
        where: { tipo, data: { gte: diaIni, lt: diaFim } },
      }),
      this.somarItens(tipo, diaIni, diaFim),
      this.somarItens(tipo, semIni, semFim),
      this.somarItens(tipo, mesIni, mesFim),
      this.metaDe(tipo, data),
    ]);

    const base: ResumoArrecadacao = {
      tipo,
      titulo: config.titulo,
      base: config.base,
      meta,
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
    const [vendasDia, vendasSemana, vendasMes] = await Promise.all([
      this.somarVendas(diaIni, diaFim),
      this.somarVendas(semIni, semFim),
      this.somarVendas(mesIni, mesFim),
    ]);
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
    const vinculo = await this.carregarVinculo();
    const regs = await this.prisma.registroArrecadacao.findMany({
      where: { tipo, data: { gte, lt } },
      select: { nome: true, matricula: true, valor: true, quantidade: true },
    });
    // Agrega por colaborador cadastrado; não cadastrados são omitidos.
    const agg = new Map<
      string,
      { nome: string; total: number; quantidade: number | null }
    >();
    for (const r of regs) {
      const id = vinculo.idDe(tipo, r.matricula);
      if (!id) continue;
      const cur = agg.get(id) ?? {
        nome: vinculo.nome(id) || r.nome,
        total: 0,
        quantidade: null,
      };
      cur.total += Number(r.valor);
      if (r.quantidade != null) {
        cur.quantidade = (cur.quantidade ?? 0) + r.quantidade;
      }
      agg.set(id, cur);
    }
    return [...agg.values()]
      .map((a) => ({
        nome: a.nome,
        total: arredondar(a.total),
        quantidade: a.quantidade,
      }))
      .sort((a, b) => b.total - a.total);
  }

  /**
   * Detalhe de cada lançamento no intervalo (operador, quem autorizou, motivo
   * e valor). Útil para o cancelamento de cupom, onde o gerente quer ver cada
   * cancelamento individualmente. Ordenado pelo maior valor. Considera apenas
   * lançamentos de colaboradores cadastrados.
   */
  async detalhes(
    tipo: TipoArrecadacao,
    inicio: Date,
    fim: Date,
  ): Promise<DetalheArrecadacao[]> {
    const gte = inicioDoDia(inicio);
    const lt = inicioDoProximoDia(fim);
    const vinculo = await this.carregarVinculo();
    const regs = await this.prisma.registroArrecadacao.findMany({
      where: { tipo, data: { gte, lt } },
      orderBy: { valor: 'desc' },
      select: {
        nome: true,
        matricula: true,
        autorizadoPor: true,
        motivo: true,
        valor: true,
        data: true,
      },
      take: 300,
    });
    const out: DetalheArrecadacao[] = [];
    for (const r of regs) {
      const id = vinculo.idDe(tipo, r.matricula);
      if (!id) continue;
      out.push({
        nome: vinculo.nome(id) || r.nome,
        autorizadoPor: r.autorizadoPor,
        motivo: r.motivo,
        valor: arredondar(Number(r.valor)),
        data: r.data.toISOString(),
      });
    }
    return out;
  }

  /**
   * Agregado dos lançamentos NÃO reconhecidos de um tipo no período (total e
   * número de lançamentos). Usado na linha "Não reconhecidos" do indicador,
   * para deixar claro que o TOTAL do indicador soma também quem não tem
   * cadastro (ex.: pessoas de fora que contribuíram).
   */
  async naoReconhecidos(
    tipo: TipoArrecadacao,
    inicio: Date,
    fim: Date,
  ): Promise<ResumoNaoReconhecido> {
    const gte = inicioDoDia(inicio);
    const lt = inicioDoProximoDia(fim);
    const vinculo = await this.carregarVinculo();
    const regs = await this.prisma.registroArrecadacao.findMany({
      where: { tipo, data: { gte, lt } },
      select: { matricula: true, valor: true },
    });
    let total = 0;
    let lancamentos = 0;
    for (const r of regs) {
      if (vinculo.idDe(tipo, r.matricula)) continue; // já tem cadastro
      total += Number(r.valor);
      lancamentos += 1;
    }
    return { total: arredondar(total), lancamentos };
  }

  /**
   * Lista os códigos "soltos" (matrícula/login do arquivo) que não casam com
   * nenhum colaborador cadastrado, agregando todos os indicadores no período.
   * É a base da "fila de não reconhecidos": cada item pode ser associado a um
   * colaborador (ou virar um cadastro novo). Lançamentos sem código (matrícula
   * vazia) não entram aqui (não há como associá-los), mas continuam somando no
   * total do indicador via `naoReconhecidos`.
   */
  async listarNaoReconhecidos(
    inicio: Date,
    fim: Date,
  ): Promise<ItemNaoReconhecido[]> {
    const gte = inicioDoDia(inicio);
    const lt = inicioDoProximoDia(fim);
    const vinculo = await this.carregarVinculo();
    const regs = await this.prisma.registroArrecadacao.findMany({
      where: { data: { gte, lt } },
      select: { tipo: true, matricula: true, nome: true, valor: true },
    });
    const mapa = new Map<string, ItemNaoReconhecido>();
    for (const r of regs) {
      const tipo = r.tipo as TipoArrecadacao;
      if (vinculo.idDe(tipo, r.matricula)) continue; // já cadastrado
      if (!r.matricula || r.matricula.trim() === '') continue; // sem código
      const chave = normalizarMatricula(r.matricula);
      const cur = mapa.get(chave) ?? {
        matricula: r.matricula.trim(),
        nome: r.nome,
        total: 0,
        lancamentos: 0,
        tipos: [] as TipoArrecadacao[],
      };
      cur.nome = r.nome || cur.nome;
      cur.total += Number(r.valor);
      cur.lancamentos += 1;
      if (!cur.tipos.includes(tipo)) cur.tipos.push(tipo);
      mapa.set(chave, cur);
    }
    return [...mapa.values()]
      .map((i) => ({ ...i, total: arredondar(i.total) }))
      .sort((a, b) => b.total - a.total);
  }

  /**
   * Carrega o vínculo movimentos→colaboradores cadastrados (identificadores +
   * colaboradores), para o ranking/detalhe mostrarem apenas quem tem cadastro.
   */
  private async carregarVinculo(): Promise<VinculoColaboradores> {
    const [identificadores, colaboradores] = await Promise.all([
      this.prisma.colaboradorIdentificador.findMany({
        select: { colaboradorId: true, tipo: true, valor: true },
      }),
      this.prisma.colaborador.findMany({
        select: { id: true, nome: true, funcao: true },
      }),
    ]);
    return montarVinculo(identificadores, colaboradores);
  }
}
