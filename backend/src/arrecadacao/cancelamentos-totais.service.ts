import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetasService } from '../metas/metas.service';
import { arredondar } from '../common/numeros';
import { anoMesDe } from '../metas/metas.domain';
import { ArrecadacaoService } from './arrecadacao.service';
import { HistoricoIndicadoresService } from './historico-indicadores.service';
import {
  EvolucaoMes,
  NivelIndicador,
  anoMesDeslocado,
  anoMesLimiteDaJanela,
  cumpriuMeta,
  evolucaoDoMes,
  fimDoAnoMes,
  inicioDoAnoMes,
  inicioDoProximoAnoMes,
  janelaDeMeses,
  nivelDoMes,
  rotuloAnoMes,
  sequenciaCumprindo,
  variacaoMensal,
} from './historico-indicadores.domain';
import {
  AvaliacaoCancelamentos,
  ComposicaoCancelamentos,
  ConcentracaoCancelamentos,
  DesvioTeto,
  DiagnosticoCancelamentos,
  EstadoCancelamentos,
  FatiaCancelamentos,
  OfensorCancelamentos,
  PerfilDanoCancelamentos,
  SENTIDO_CANCELAMENTOS,
  SimulacaoCancelamentos,
  TIPOS_DO_TOTAL,
  TIPO_CANCELAMENTOS_TOTAIS,
  TITULO_CANCELAMENTOS_TOTAIS,
  agruparPorRotulo,
  avaliarMes,
  compararComAnterior,
  composicaoDe,
  concentracaoDe,
  diagnosticar,
  fundirOfensores,
  percentualSobreVendas,
  perfilDoDano,
  simularSemMaiores,
} from './cancelamentos-totais.domain';

/** Indicador "Cancelamentos Totais" de um mês (dados da card). */
export interface IndicadorCancelamentosTotais {
  tipo: typeof TIPO_CANCELAMENTOS_TOTAIS;
  titulo: string;
  /** Período mensal ("AAAA-MM"). */
  anoMes: string;
  /** Rótulo curto (ex.: "set/26"). */
  rotulo: string;
  base: 'VENDAS';
  sentido: typeof SENTIDO_CANCELAMENTOS;
  /** Soma das duas partes (R$). */
  total: number;
  totalItens: number;
  totalCupom: number;
  /** Itens cancelados informados no arquivo de itens. */
  itens: number;
  /** Lançamentos do mês (linhas dos dois arquivos). */
  lancamentos: number;
  lancamentosItens: number;
  lancamentosCupom: number;
  vendas: number;
  /** % sobre as vendas; `null` quando não há venda registrada. */
  percentual: number | null;
  meta: number;
  nivel: NivelIndicador | null;
  cumpriuMeta: boolean | null;
  desvio: DesvioTeto | null;
  estado: EstadoCancelamentos;
  /** Teto da meta em R$ no mês (meta% × vendas). */
  limiteReais: number | null;
  /** Quanto passou do teto, em R$ (0 quando dentro). */
  excedente: number | null;
  /** true no mês corrente (ainda em andamento). */
  parcial: boolean;
  /** % do mês anterior, para a leitura de evolução. */
  valorAnterior: number | null;
  variacao: number | null;
  evolucao: EvolucaoMes | null;
}

/** Um mês da série histórica do indicador. */
export interface PontoMesCancelamentos {
  anoMes: string;
  rotulo: string;
  total: number;
  totalItens: number;
  totalCupom: number;
  vendas: number;
  /** % sobre as vendas; `null` quando o mês não tem venda registrada. */
  percentual: number | null;
  meta: number;
  nivel: NivelIndicador | null;
  cumpriuMeta: boolean;
  variacao: number | null;
  evolucao: EvolucaoMes | null;
  parcial: boolean;
  semDados: boolean;
}

/** Detalhe do indicador: o que está impactando e o que fazer. */
export interface DetalheCancelamentosTotais {
  indicador: IndicadorCancelamentosTotais;
  composicao: ComposicaoCancelamentos;
  /** Ranking combinado (top 10) dos dois cancelamentos. */
  ofensores: OfensorCancelamentos[];
  concentracao: ConcentracaoCancelamentos;
  simulacao: SimulacaoCancelamentos | null;
  /** Motivos do cancelamento de **cupom** (o arquivo de itens não os traz). */
  motivos: FatiaCancelamentos[];
  /** Quem autorizou os cancelamentos de **cupom**. */
  autorizadores: FatiaCancelamentos[];
  perfil: PerfilDanoCancelamentos;
  diagnostico: DiagnosticoCancelamentos;
  historico: PontoMesCancelamentos[];
  /** Meses seguidos cumprindo a meta, do mais recente para trás. */
  sequenciaCumprindo: number;
  mesesRetencao: number;
  /** Mês mais antigo ainda conservado. */
  anoMesLimite: string;
}

/** Agregado cru de um mês. */
interface ApuracaoMesCancelamentos {
  totalItens: number;
  totalCupom: number;
  itens: number;
  lancamentosItens: number;
  lancamentosCupom: number;
  vendas: number;
}

const VAZIO: ApuracaoMesCancelamentos = {
  totalItens: 0,
  totalCupom: 0,
  itens: 0,
  lancamentosItens: 0,
  lancamentosCupom: 0,
  vendas: 0,
};

/**
 * Serviço do indicador **Cancelamentos Totais**: a soma de Cancelamento de Itens
 * + Cancelamento de Cupom sobre as vendas, com meta própria por mês.
 *
 * ## É um indicador calculado, não um arquivo
 *
 * Não existe upload, não existe "sem movimento" e não existe passo novo em
 * Importações: o indicador lê os lançamentos que os dois arquivos já gravam. Isso
 * é deliberado — `TIPOS_ARRECADACAO` é o contrato do fechamento do dia, e um tipo
 * novo ali exigiria para sempre um sexto arquivo inexistente (ver o cabeçalho de
 * `cancelamentos-totais.domain.ts`).
 *
 * ## De onde vem cada número
 *
 * - **Total e percentual:** somados de `RegistroArrecadacao` dos dois tipos,
 *   divididos pelas `VendaDiaria` do mês. Como os totais dos indicadores incluem
 *   quem não tem cadastro (regra já vigente do módulo), o total pode ser maior
 *   que a soma do ranking.
 * - **Meta:** `MetasService.resolver('CANCELAMENTOS_TOTAIS', anoMes)` — a meta do
 *   mês, com 0,75% de padrão. Cada mês é julgado pela meta que valia nele.
 * - **Ranking:** `ArrecadacaoService.ranking` de cada tipo, fundidos por nome
 *   canônico (só colaboradores cadastrados, como no resto do módulo).
 * - **Motivos e autorizadores:** apenas do cancelamento de **cupom** — o arquivo
 *   de itens não tem essas colunas.
 * - **Histórico:** derivado ao vivo dos lançamentos dentro da janela de retenção
 *   e, para um mês fechado que já perdeu o dado cru, das fotos mensais dos dois
 *   tipos (`FotoMesIndicador`), que guardam total e vendas. O indicador não grava
 *   foto própria: somar duas fotos que já existem é sempre coerente e não cria
 *   uma terceira verdade para o mesmo mês.
 */
@Injectable()
export class CancelamentosTotaisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metas: MetasService,
    private readonly arrecadacao: ArrecadacaoService,
    private readonly historicoIndicadores: HistoricoIndicadoresService,
  ) {}

  /** Meta do mês (padrão 0,75%), resolvida pela fonte única de metas. */
  private metaDoMes(anoMes: string): Promise<number> {
    return this.metas.resolver(TIPO_CANCELAMENTOS_TOTAIS, anoMes);
  }

  /** Agregado cru de um mês (os dois tipos + as vendas). */
  private async apurarMes(anoMes: string): Promise<ApuracaoMesCancelamentos> {
    const gte = inicioDoAnoMes(anoMes);
    const lt = inicioDoProximoAnoMes(anoMes);
    const [grupos, vendas] = await Promise.all([
      this.prisma.registroArrecadacao.groupBy({
        by: ['tipo'],
        where: { tipo: { in: [...TIPOS_DO_TOTAL] }, data: { gte, lt } },
        _sum: { valor: true, quantidade: true },
        _count: { _all: true },
      }),
      this.prisma.vendaDiaria.aggregate({
        where: { data: { gte, lt } },
        _sum: { valor: true },
      }),
    ]);

    const apuracao: ApuracaoMesCancelamentos = {
      ...VAZIO,
      vendas: arredondar(Number(vendas._sum.valor ?? 0)),
    };
    for (const g of grupos) {
      const total = arredondar(Number(g._sum.valor ?? 0));
      const quantidade = Number(g._sum.quantidade ?? 0);
      const lancamentos = g._count?._all ?? 0;
      if (g.tipo === 'CANCELAMENTO_ITENS') {
        apuracao.totalItens = total;
        apuracao.lancamentosItens = lancamentos;
      } else {
        apuracao.totalCupom = total;
        apuracao.lancamentosCupom = lancamentos;
      }
      apuracao.itens += quantidade;
    }
    return apuracao;
  }

  /** Percentual de um mês (usado na comparação com o mês anterior). */
  private async percentualDoMes(anoMes: string): Promise<number | null> {
    const a = await this.apurarMes(anoMes);
    return percentualSobreVendas(a.totalItens + a.totalCupom, a.vendas);
  }

  /**
   * Indicador do mês: a card do painel. Traz sempre o desvio junto do valor —
   * ver o número é informação, ver a distância até o teto é conclusão.
   */
  async indicador(anoMes: string): Promise<IndicadorCancelamentosTotais> {
    const [apuracao, meta] = await Promise.all([
      this.apurarMes(anoMes),
      this.metaDoMes(anoMes),
    ]);
    const anterior = await this.percentualDoMes(anoMesDeslocado(anoMes, -1));
    return this.montarIndicador(anoMes, apuracao, meta, anterior);
  }

  /** Monta a view do indicador a partir do agregado já lido. */
  private montarIndicador(
    anoMes: string,
    apuracao: ApuracaoMesCancelamentos,
    meta: number,
    percentualAnterior: number | null,
  ): IndicadorCancelamentosTotais {
    const total = arredondar(apuracao.totalItens + apuracao.totalCupom);
    const lancamentos = apuracao.lancamentosItens + apuracao.lancamentosCupom;
    const avaliacao = avaliarMes(total, apuracao.vendas, lancamentos, meta);
    const comparacao = compararComAnterior(avaliacao.valor, percentualAnterior);
    return {
      tipo: TIPO_CANCELAMENTOS_TOTAIS,
      titulo: TITULO_CANCELAMENTOS_TOTAIS,
      anoMes,
      rotulo: rotuloAnoMes(anoMes),
      base: 'VENDAS',
      sentido: SENTIDO_CANCELAMENTOS,
      total,
      totalItens: apuracao.totalItens,
      totalCupom: apuracao.totalCupom,
      itens: apuracao.itens,
      lancamentos,
      lancamentosItens: apuracao.lancamentosItens,
      lancamentosCupom: apuracao.lancamentosCupom,
      vendas: apuracao.vendas,
      percentual: avaliacao.valor,
      meta,
      nivel: avaliacao.nivel,
      cumpriuMeta: avaliacao.cumpriu,
      desvio: avaliacao.desvio,
      estado: avaliacao.estado,
      limiteReais: avaliacao.limiteReais,
      excedente: avaliacao.excedente,
      parcial: anoMes === anoMesDe(new Date()),
      valorAnterior: comparacao.valorAnterior,
      variacao: comparacao.variacao,
      evolucao: comparacao.evolucao,
    };
  }

  /**
   * Detalhe do mês: composição, ranking combinado, concentração, simulação,
   * motivos, autorizadores, perfil do dano, diagnóstico e histórico mensal.
   */
  async detalhe(anoMes: string): Promise<DetalheCancelamentosTotais> {
    const gte = inicioDoAnoMes(anoMes);
    const fimInclusivo = fimDoAnoMes(anoMes);
    const lt = inicioDoProximoAnoMes(anoMes);

    const [apuracao, meta, rankItens, rankCupom, lancamentos, historico] =
      await Promise.all([
        this.apurarMes(anoMes),
        this.metaDoMes(anoMes),
        this.arrecadacao.ranking('CANCELAMENTO_ITENS', gte, fimInclusivo),
        this.arrecadacao.ranking('CANCELAMENTO_CUPOM', gte, fimInclusivo),
        this.prisma.registroArrecadacao.findMany({
          where: { tipo: { in: [...TIPOS_DO_TOTAL] }, data: { gte, lt } },
          select: {
            tipo: true,
            valor: true,
            motivo: true,
            autorizadoPor: true,
          },
        }),
        this.historico(undefined, anoMes),
      ]);

    const anteriorNoHistorico = historico
      .filter((p) => p.anoMes < anoMes && !p.semDados)
      .pop();
    const indicador = this.montarIndicador(
      anoMes,
      apuracao,
      meta,
      anteriorNoHistorico?.percentual ?? null,
    );

    const total = indicador.total;
    const composicao = composicaoDe(
      apuracao.totalItens,
      apuracao.totalCupom,
      apuracao.vendas,
    );
    const todosOfensores = fundirOfensores(
      rankItens,
      rankCupom,
      apuracao.vendas,
    );
    const concentracao = concentracaoDe(todosOfensores);
    const simulacao = simularSemMaiores(
      todosOfensores,
      total,
      apuracao.vendas,
      meta,
    );

    // Motivo e autorizador só existem no arquivo de cupom. Agrupar os dois tipos
    // juntos encheria a lista de "Não informado" e faria o gestor achar que o
    // sistema perdeu a informação — ela nunca existiu para os itens.
    const doCupom = lancamentos.filter((l) => l.tipo === 'CANCELAMENTO_CUPOM');
    const motivos = agruparPorRotulo(
      doCupom.map((l) => ({ rotulo: l.motivo, valor: Number(l.valor) })),
    );
    const autorizadores = agruparPorRotulo(
      doCupom.map((l) => ({ rotulo: l.autorizadoPor, valor: Number(l.valor) })),
    );
    const perfil = perfilDoDano(lancamentos.map((l) => Number(l.valor)));

    const diagnostico = diagnosticar({
      avaliacao: {
        valor: indicador.percentual,
        estado: indicador.estado,
        meta,
        nivel: indicador.nivel,
        cumpriu: indicador.cumpriuMeta,
        desvio: indicador.desvio,
        limiteReais: indicador.limiteReais,
        excedente: indicador.excedente,
      } satisfies AvaliacaoCancelamentos,
      composicao,
      concentracao,
      simulacao,
      perfil,
      motivos,
      autorizadores,
      evolucao: indicador.evolucao,
      ofensores: todosOfensores,
    });

    return {
      indicador,
      composicao,
      ofensores: todosOfensores.slice(0, 10),
      concentracao,
      simulacao,
      motivos,
      autorizadores,
      perfil,
      diagnostico,
      historico,
      sequenciaCumprindo: sequenciaCumprindo(
        historico.map((p) => ({
          cumpriuMeta: p.cumpriuMeta,
          semDados: p.semDados,
        })),
      ),
      mesesRetencao: this.historicoIndicadores.mesesRetencao(),
      anoMesLimite: anoMesLimiteDaJanela(
        anoMesDe(new Date()),
        this.historicoIndicadores.mesesRetencao(),
      ),
    };
  }

  /**
   * Série mensal do indicador, do mês mais antigo ao mais recente.
   *
   * Não há foto própria: dentro da janela de retenção os lançamentos crus ainda
   * existem, então o mês é apurado ao vivo; um mês fechado que já perdeu o dado
   * cru cai nas fotos dos dois tipos, somando `total` e reaproveitando `vendas`
   * (as duas fotos guardam a mesma venda do mês). Somar duas verdades que já
   * estão congeladas é sempre coerente — gravar uma terceira foto para o mesmo
   * mês criaria a possibilidade de elas divergirem.
   */
  async historico(
    meses?: number,
    anoMesFinal?: string,
  ): Promise<PontoMesCancelamentos[]> {
    const retencao = this.historicoIndicadores.mesesRetencao();
    const quantidade = Math.min(
      Math.max(1, Math.floor(meses ?? retencao)),
      retencao,
    );
    const anoMesAtual = anoMesDe(new Date());
    const lista = janelaDeMeses(anoMesFinal ?? anoMesAtual, quantidade);

    const [fotos, metasPorMes] = await Promise.all([
      this.prisma.fotoMesIndicador.findMany({
        where: { tipo: { in: [...TIPOS_DO_TOTAL] }, anoMes: { in: lista } },
        select: { tipo: true, anoMes: true, total: true, vendas: true },
      }),
      Promise.all(lista.map((anoMes) => this.metaDoMes(anoMes))),
    ]);

    const pontos: PontoMesCancelamentos[] = [];
    for (let i = 0; i < lista.length; i++) {
      const anoMes = lista[i];
      const meta = metasPorMes[i];
      let apuracao = await this.apurarMes(anoMes);
      let semDados =
        apuracao.totalItens === 0 &&
        apuracao.totalCupom === 0 &&
        apuracao.vendas === 0;

      if (semDados && anoMes !== anoMesAtual) {
        const doMes = fotos.filter((f) => f.anoMes === anoMes);
        if (doMes.length > 0) {
          apuracao = {
            ...VAZIO,
            totalItens: arredondar(
              Number(
                doMes.find((f) => f.tipo === 'CANCELAMENTO_ITENS')?.total ?? 0,
              ),
            ),
            totalCupom: arredondar(
              Number(
                doMes.find((f) => f.tipo === 'CANCELAMENTO_CUPOM')?.total ?? 0,
              ),
            ),
            // As duas fotos guardam a venda do mesmo mês: a maior delas é a do
            // mês (uma foto ausente devolveria 0 e cortaria o denominador).
            vendas: arredondar(
              Math.max(...doMes.map((f) => Number(f.vendas ?? 0))),
            ),
          };
          semDados =
            apuracao.totalItens === 0 &&
            apuracao.totalCupom === 0 &&
            apuracao.vendas === 0;
        }
      }

      const total = arredondar(apuracao.totalItens + apuracao.totalCupom);
      const percentual = percentualSobreVendas(total, apuracao.vendas);
      pontos.push({
        anoMes,
        rotulo: rotuloAnoMes(anoMes),
        total,
        totalItens: apuracao.totalItens,
        totalCupom: apuracao.totalCupom,
        vendas: apuracao.vendas,
        percentual,
        meta,
        nivel:
          percentual == null
            ? null
            : nivelDoMes(SENTIDO_CANCELAMENTOS, percentual, meta),
        cumpriuMeta:
          percentual == null
            ? false
            : cumpriuMeta(SENTIDO_CANCELAMENTOS, percentual, meta),
        variacao: null,
        evolucao: null,
        parcial: anoMes === anoMesAtual,
        semDados,
      });
    }

    // Evolução: compara com o mês anterior da série. Um mês sem dados não serve
    // de base — comparar contra o vazio produziria "+∞%".
    for (let i = 1; i < pontos.length; i++) {
      const anterior = pontos[i - 1];
      const atual = pontos[i];
      if (anterior.semDados || atual.semDados) continue;
      if (anterior.percentual == null || atual.percentual == null) continue;
      const variacao = variacaoMensal(atual.percentual, anterior.percentual);
      atual.variacao = variacao === null ? null : arredondar(variacao);
      atual.evolucao = evolucaoDoMes(SENTIDO_CANCELAMENTOS, atual.variacao);
    }

    return pontos;
  }
}
