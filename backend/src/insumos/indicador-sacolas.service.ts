import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { arredondar } from '../common/numeros';
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
  DesvioMeta,
  EstadoIndicadorSacolas,
  ORIGENS_FORA_DO_INDICADOR,
  SENTIDO_SACOLAS,
  avaliarMes,
  avisoDeEntregas,
  compararComAnterior,
  emFardos,
  textoDoMes,
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
}
