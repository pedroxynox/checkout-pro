import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { arredondar } from '../common/numeros';
import { inicioDoDia } from '../common/datas';
import { MetasService } from '../metas/metas.service';
import { CONFIG_METAS } from '../metas/metas.domain';
import {
  EvolucaoMes,
  NivelIndicador,
  anoMesDeslocado,
  inicioDoAnoMes,
  inicioDoProximoAnoMes,
  rotuloAnoMes,
} from '../arrecadacao/historico-indicadores.domain';
import {
  ConsumoVsEntrada,
  DesvioMeta,
  EstadoIndicadorSacolas,
  ORIGENS_FORA_DO_INDICADOR,
  SENTIDO_SACOLAS,
  TetoSacolas,
  VendaEsperadaMes,
  avaliarMes,
  avisoDeEntregas,
  calcularTeto,
  compararComAnterior,
  compararConsumoEntrada,
  emFardos,
  projecaoDoFechamento,
  textoDoMes,
  vendaEsperadaDoMes,
} from './sacolas.domain';

/** Fator usado quando nenhum insumo de sacola tem embalagem cadastrada. */
const FATOR_PADRAO_FARDO = 1000;

/** O indicador de Sacolas num mês, pronto para a tela. */
export interface IndicadorSacolas {
  anoMes: string;
  /** "Set/26". */
  rotulo: string;
  /** true quando o mês ainda está em andamento. */
  parcial: boolean;

  // --- Numerador ---
  vendaMes: number;

  // --- Denominador ---
  /** Sacolas que entraram no mês (unidades base, o número inteiro). */
  sacolasRecebidas: number;
  /** As mesmas sacolas em fardos, para leitura. */
  fardosRecebidos: number;
  /** Quantas entradas (entregas) houve no mês. */
  entregas: number;
  /** Sacolas por fardo, conforme o cadastro do insumo. */
  fatorEmbalagem: number;

  // --- O indicador ---
  /** R$ de venda por sacola recebida. `null` quando não dá para calcular. */
  valor: number | null;
  meta: number;
  unidade: 'REAIS_POR_UNIDADE';
  sentido: 'MAIOR_MELHOR';
  nivel: NivelIndicador | null;
  cumpriuMeta: boolean | null;
  desvio: DesvioMeta | null;

  // --- Contexto ---
  estado: EstadoIndicadorSacolas;
  valorAnterior: number | null;
  variacao: number | null;
  evolucao: EvolucaoMes | null;
  /** Frase que resume o mês (mesma no app e em qualquer relatório). */
  resumo: string;
  /** Aviso quando o mês teve 1 ou 3+ entregas (efeito de calendário). */
  avisoEntregas: string | null;
}

/**
 * Indicador **SACOLAS** (ADR 0022): quanto a loja vende, em R$, por sacola que
 * **entra** no estoque.
 *
 * ## Por que mora em `insumos`, e não em `arrecadacao`
 *
 * Todos os indicadores de arrecadação leem **uma tabela só**
 * (`RegistroArrecadacao`, alimentada por upload de `.txt` diário) e usam
 * `VendaDiaria` como denominador. Aqui é o contrário: o denominador vem do
 * almoxarifado (`MovimentoEstoque`) e as vendas são o **numerador**. Entrar
 * naquele catálogo obrigaria `ArrecadacaoService.resumo()` a buscar dados em
 * outro módulo, faria `congelarMes` reescrever todos os meses já congelados
 * (a verificação de completude compara com o tamanho de `TIPOS_ARRECADACAO`) e
 * deixaria quem lesse o código procurando um `.txt` de sacolas que não existe.
 *
 * O que **é** reaproveitado são as regras puras de julgamento
 * (`nivelDoMes`, `cumpriuMeta`, `variacaoMensal`, `evolucaoDoMes`) e a meta
 * mensal, resolvida pelo `MetasService` — o mesmo ponto único que todas as outras
 * metas usam.
 */
@Injectable()
export class IndicadorSacolasService {
  constructor(
    private readonly prisma: PrismaService,
    // Opcional para os testes unitários não precisarem montar o grafo inteiro
    // (mesmo padrão dos outros serviços). Sem ele, vale o padrão de CONFIG_METAS.
    @Optional() private readonly metas?: MetasService,
  ) {}

  /** Meta do mês (R$ por sacola). Cai no padrão de R$ 28,00 sem o serviço. */
  private async metaDoMes(anoMes: string): Promise<number> {
    if (!this.metas) return CONFIG_METAS.SACOLAS.valorPadrao;
    return this.metas.resolver('SACOLAS', anoMes);
  }

  /**
   * Soma as sacolas que ENTRARAM no período e conta quantas entregas foram.
   *
   * Conta a **categoria** `SACOLA`, e não um item pelo nome: no dia em que a loja
   * cadastrar "Sacola grande" e "Sacola pequena", o indicador continua correto
   * sem ninguém lembrar de mexer nele. Hoje o resultado é idêntico (existe um
   * item só).
   *
   * `ESTOQUE_INICIAL` fica fora (ver `ORIGENS_FORA_DO_INDICADOR`).
   */
  private async entradasDoPeriodo(
    inicio: Date,
    fimExclusivo: Date,
  ): Promise<{ sacolas: number; entregas: number }> {
    const movimentos = await this.prisma.movimentoEstoque.findMany({
      where: {
        delta: { gt: 0 },
        dataHora: { gte: inicio, lt: fimExclusivo },
        insumo: { categoria: 'SACOLA' },
        // `notIn` não cobre NULL no Postgres, e entradas antigas têm `origem`
        // nula — elas CONTAM (são compras reais de antes do campo existir).
        // Por isso o filtro é feito abaixo, em memória, sobre uma lista curta.
      },
      select: { delta: true, origem: true },
    });

    let sacolas = 0;
    let entregas = 0;
    for (const m of movimentos) {
      if (m.origem && ORIGENS_FORA_DO_INDICADOR.includes(m.origem)) continue;
      sacolas += m.delta;
      entregas += 1;
    }
    return { sacolas, entregas };
  }

  /** Venda total do período (o numerador). */
  private async vendaDoPeriodo(
    inicio: Date,
    fimExclusivo: Date,
  ): Promise<number> {
    const r = await this.prisma.vendaDiaria.aggregate({
      _sum: { valor: true },
      where: { data: { gte: inicio, lt: fimExclusivo } },
    });
    return arredondar(Number(r._sum.valor ?? 0));
  }

  /** Sacolas por fardo, conforme o cadastro (para exibir o total em fardos). */
  private async fatorDoFardo(): Promise<number> {
    const insumo = await this.prisma.insumo.findFirst({
      where: { categoria: 'SACOLA', ativo: true },
      select: { fatorEmbalagem: true },
      orderBy: { nome: 'asc' },
    });
    const fator = insumo?.fatorEmbalagem ?? 0;
    return fator > 0 ? fator : FATOR_PADRAO_FARDO;
  }

  /** Valor do indicador num mês, sem contexto (usado para o mês anterior). */
  private async valorDoMes(anoMes: string): Promise<number | null> {
    const inicio = inicioDoAnoMes(anoMes);
    const fim = inicioDoProximoAnoMes(anoMes);
    const [venda, entradas, meta] = await Promise.all([
      this.vendaDoPeriodo(inicio, fim),
      this.entradasDoPeriodo(inicio, fim),
      this.metaDoMes(anoMes),
    ]);
    return avaliarMes(venda, entradas.sacolas, meta).valor;
  }

  /**
   * O indicador de um mês, com semáforo, desvio e comparação com o anterior.
   *
   * O mês em andamento é marcado `parcial`, mas **é avaliado normalmente**: como
   * numerador e denominador crescem juntos ao longo do mês (as sacolas chegam a
   * cada quinzena, as vendas todos os dias), a razão é aproximadamente estável
   * desde a primeira entrega — diferente de um total acumulado, que só faz
   * sentido no fim. O que o `parcial` faz é avisar a tela de que o número ainda
   * pode mudar.
   */
  async doMes(anoMes: string, hoje = new Date()): Promise<IndicadorSacolas> {
    const inicio = inicioDoAnoMes(anoMes);
    const fimExclusivo = inicioDoProximoAnoMes(anoMes);
    const parcial = hoje < fimExclusivo;

    const [venda, entradas, meta, fatorEmbalagem, valorAnterior] =
      await Promise.all([
        this.vendaDoPeriodo(inicio, fimExclusivo),
        this.entradasDoPeriodo(inicio, fimExclusivo),
        this.metaDoMes(anoMes),
        this.fatorDoFardo(),
        this.valorDoMes(anoMesDeslocado(anoMes, -1)),
      ]);

    const avaliacao = avaliarMes(venda, entradas.sacolas, meta);
    const fardosRecebidos = emFardos(entradas.sacolas, fatorEmbalagem);
    const comparacao = compararComAnterior(avaliacao.valor, valorAnterior);

    return {
      anoMes,
      rotulo: rotuloAnoMes(anoMes),
      parcial,
      vendaMes: venda,
      sacolasRecebidas: entradas.sacolas,
      fardosRecebidos,
      entregas: entradas.entregas,
      fatorEmbalagem,
      valor: avaliacao.valor,
      meta,
      unidade: 'REAIS_POR_UNIDADE',
      sentido: SENTIDO_SACOLAS,
      nivel: avaliacao.nivel,
      cumpriuMeta: avaliacao.cumpriu,
      desvio: avaliacao.desvio,
      estado: avaliacao.estado,
      valorAnterior: comparacao.valorAnterior,
      variacao: comparacao.variacao,
      evolucao: comparacao.evolucao,
      resumo: textoDoMes(avaliacao, entradas.sacolas, fardosRecebidos),
      avisoEntregas: avisoDeEntregas(entradas.entregas),
    };
  }

  // ----------------------------- Detalhe do mês ----------------------------

  /**
   * Entradas de sacola do mês, uma linha por registro (o "dia que entrou
   * sacola"). Exclui o estoque inicial, como o denominador.
   */
  private async entradasDetalhadas(
    inicio: Date,
    fimExclusivo: Date,
    fatorEmbalagem: number,
  ): Promise<EntradaSacolaDia[]> {
    const movimentos = await this.prisma.movimentoEstoque.findMany({
      where: {
        delta: { gt: 0 },
        dataHora: { gte: inicio, lt: fimExclusivo },
        insumo: { categoria: 'SACOLA' },
      },
      orderBy: { dataHora: 'desc' },
      select: {
        delta: true,
        dataHora: true,
        origem: true,
        responsavelNome: true,
      },
    });
    return movimentos
      .filter(
        (m) => !(m.origem && ORIGENS_FORA_DO_INDICADOR.includes(m.origem)),
      )
      .map((m) => ({
        data: inicioDoDia(m.dataHora).toISOString().slice(0, 10),
        dataHora: m.dataHora.toISOString(),
        sacolas: m.delta,
        fardos: emFardos(m.delta, fatorEmbalagem),
        origem: m.origem,
        responsavelNome: m.responsavelNome,
      }));
  }

  /** Sacolas consumidas (saídas) no período. */
  private async consumoDoPeriodo(
    inicio: Date,
    fimExclusivo: Date,
  ): Promise<number> {
    const r = await this.prisma.movimentoEstoque.aggregate({
      _sum: { delta: true },
      where: {
        delta: { lt: 0 },
        dataHora: { gte: inicio, lt: fimExclusivo },
        insumo: { categoria: 'SACOLA' },
      },
    });
    return Math.abs(Number(r._sum.delta ?? 0));
  }

  /**
   * Série diária do mês: venda, estimativa, consumo e entrada por dia.
   *
   * Densificada (todo dia do mês aparece, com zero quando não houve nada), como
   * a `analiseInsumo` já faz — é o formato que o gráfico consome sem buracos.
   */
  private async serieDoMes(
    inicio: Date,
    fimExclusivo: Date,
  ): Promise<DiaSerieSacolas[]> {
    const [vendas, estimativas, movimentos] = await Promise.all([
      this.prisma.vendaDiaria.findMany({
        where: { data: { gte: inicio, lt: fimExclusivo } },
        select: { data: true, valor: true },
      }),
      this.prisma.estimativaVendaDia.findMany({
        where: { data: { gte: inicio, lt: fimExclusivo } },
        select: { data: true, valor: true },
      }),
      this.prisma.movimentoEstoque.findMany({
        where: {
          dataHora: { gte: inicio, lt: fimExclusivo },
          insumo: { categoria: 'SACOLA' },
        },
        select: { delta: true, dataHora: true, origem: true },
      }),
    ]);

    const chave = (d: Date): string =>
      inicioDoDia(d).toISOString().slice(0, 10);
    const vendaPorDia = new Map(
      vendas.map((v) => [chave(v.data), Number(v.valor)]),
    );
    const estimativaPorDia = new Map(
      estimativas.map((e) => [chave(e.data), Number(e.valor)]),
    );
    const consumoPorDia = new Map<string, number>();
    const entradaPorDia = new Map<string, number>();
    for (const m of movimentos) {
      const k = chave(m.dataHora);
      if (m.delta < 0) {
        consumoPorDia.set(k, (consumoPorDia.get(k) ?? 0) + Math.abs(m.delta));
      } else if (!(m.origem && ORIGENS_FORA_DO_INDICADOR.includes(m.origem))) {
        entradaPorDia.set(k, (entradaPorDia.get(k) ?? 0) + m.delta);
      }
    }

    const serie: DiaSerieSacolas[] = [];
    for (
      let t = inicio.getTime();
      t < fimExclusivo.getTime();
      t += 24 * 60 * 60 * 1000
    ) {
      const k = new Date(t).toISOString().slice(0, 10);
      const estimativa = estimativaPorDia.get(k);
      serie.push({
        data: k,
        venda: arredondar(vendaPorDia.get(k) ?? 0),
        estimativa: estimativa != null ? arredondar(estimativa) : null,
        consumo: consumoPorDia.get(k) ?? 0,
        entrada: entradaPorDia.get(k) ?? 0,
      });
    }
    return serie;
  }

  /**
   * Detalhe do mês: o **teto de sacolas**, os dias em que entrou sacola, o cruze
   * consumo × entrada e a projeção do fechamento.
   *
   * O teto é o coração desta tela. Enquanto o mês corre, saber que o indicador
   * está em R$ 22 não diz o que fazer; saber que **ainda cabem 7 fardos** diz.
   */
  async detalhe(anoMes: string, hoje = new Date()): Promise<DetalheSacolas> {
    const inicio = inicioDoAnoMes(anoMes);
    const fimExclusivo = inicioDoProximoAnoMes(anoMes);
    const hojeISO = inicioDoDia(hoje).toISOString().slice(0, 10);
    const mesEmCurso = hoje < fimExclusivo && hoje >= inicio;

    const indicador = await this.doMes(anoMes, hoje);
    const fator = indicador.fatorEmbalagem;

    const [entradas, consumidas, serie] = await Promise.all([
      this.entradasDetalhadas(inicio, fimExclusivo, fator),
      this.consumoDoPeriodo(inicio, fimExclusivo),
      this.serieDoMes(inicio, fimExclusivo),
    ]);

    // Venda esperada: FATO até hoje + ESTIMATIVA dos dias que faltam. Num mês
    // fechado não há "dias que faltam", então vale o realizado inteiro.
    const realizado = mesEmCurso
      ? arredondar(
          serie
            .filter((d) => d.data <= hojeISO)
            .reduce((soma, d) => soma + d.venda, 0),
        )
      : indicador.vendaMes;
    const estimativasFuturas = mesEmCurso
      ? serie
          .filter((d) => d.data > hojeISO && d.estimativa != null)
          .map((d) => d.estimativa as number)
      : [];
    // Ritmo (run-rate) como último recurso: média dos dias COM venda × dias do
    // mês. Divide pelos dias com venda (e não pelos decorridos) para um arquivo
    // de venda ainda não enviado não puxar a média para baixo.
    const diasComVenda = serie.filter((d) => d.venda > 0).length;
    const runRate =
      mesEmCurso && diasComVenda > 0
        ? arredondar((realizado / diasComVenda) * serie.length)
        : 0;

    const vendaEsperada = vendaEsperadaDoMes(
      realizado,
      estimativasFuturas,
      runRate,
    );

    const teto = calcularTeto(
      vendaEsperada.valor,
      indicador.sacolasRecebidas,
      indicador.meta,
      fator,
    );

    // A SUPOSIÇÃO da projeção, escrita: se ainda restam dias no mês, o ciclo é
    // quinzenal e só veio 1 entrega, supõe-se uma segunda, do tamanho da que já
    // veio. Um palpite sem rótulo seria lido como fato.
    const diasRestantes = mesEmCurso
      ? Math.max(
          0,
          Math.round(
            (fimExclusivo.getTime() - inicioDoDia(hoje).getTime()) / 86_400_000,
          ),
        )
      : 0;
    const mediaPorEntrega =
      entradas.length > 0
        ? Math.round(indicador.sacolasRecebidas / entradas.length)
        : 0;
    const esperaOutraEntrega =
      mesEmCurso &&
      diasRestantes >= DIAS_MINIMOS_PARA_NOVA_ENTREGA &&
      entradas.length === 1;
    const sacolasPrevistas = esperaOutraEntrega ? mediaPorEntrega : 0;
    const baseDaPrevisao = !mesEmCurso
      ? 'Mês fechado: não há entrega a prever.'
      : esperaOutraEntrega
        ? `Supõe 1 entrega a mais (${emFardos(mediaPorEntrega, fator)} fardos, ` +
          `o tamanho da que já veio), porque faltam ${diasRestantes} dias e o ` +
          'ciclo de sacolas é quinzenal.'
        : 'Não supõe entrega nova: o mês já recebeu as entregas do ciclo, ou está no fim.';

    const projecao = {
      ...projecaoDoFechamento(
        vendaEsperada.valor,
        indicador.sacolasRecebidas,
        sacolasPrevistas,
        indicador.meta,
      ),
      sacolasPrevistas,
      baseDaPrevisao,
    };

    return {
      indicador,
      vendaEsperada,
      teto,
      projecao,
      consumoVsEntrada: compararConsumoEntrada(
        indicador.vendaMes,
        indicador.sacolasRecebidas,
        consumidas,
        fator,
      ),
      entradas,
      serie,
    };
  }
}


/** Uma entrada de sacola no mês (o "dia que entrou sacola"). */
export interface EntradaSacolaDia {
  /** Dia (ISO, "AAAA-MM-DD"). */
  data: string;
  /** Momento exato do registro. */
  dataHora: string;
  sacolas: number;
  fardos: number;
  origem: string | null;
  responsavelNome: string | null;
}

/** Um dia da série: o que se vendeu, o que se esperava e o que se consumiu. */
export interface DiaSerieSacolas {
  data: string;
  /** Venda realizada (R$). */
  venda: number;
  /** Estimativa da gestão para o dia (R$), quando existe. */
  estimativa: number | null;
  /** Sacolas consumidas no dia. */
  consumo: number;
  /** Sacolas que entraram no dia (zero na maioria — a entrada é em lote). */
  entrada: number;
}

/** Detalhe do indicador de Sacolas num mês. */
export interface DetalheSacolas {
  /** O mesmo resumo da card, para a tela não precisar de duas chamadas. */
  indicador: IndicadorSacolas;
  /** Venda esperada para o mês fechado, e o quanto já é fato. */
  vendaEsperada: VendaEsperadaMes;
  /** O teto de sacolas do mês. `null` sem venda esperada. */
  teto: TetoSacolas | null;
  /** Onde o mês fecha, se nada mudar. */
  projecao: {
    valor: number | null;
    cumprira: boolean | null;
    sacolasNoFechamento: number;
    /** Sacolas que ainda devem chegar até o fim do mês (suposição). */
    sacolasPrevistas: number;
    /** Como as previstas foram estimadas — a suposição, escrita. */
    baseDaPrevisao: string;
  };
  /** Indicador oficial (entrada) vs uso real (consumo). */
  consumoVsEntrada: ConsumoVsEntrada;
  /** Os dias em que entrou sacola, do mais recente ao mais antigo. */
  entradas: EntradaSacolaDia[];
  /** Série diária do mês (venda, estimativa, consumo, entrada). */
  serie: DiaSerieSacolas[];
}

/** Dias de tolerância para supor que ainda cabe uma entrega no mês. */
const DIAS_MINIMOS_PARA_NOVA_ENTREGA = 3;
