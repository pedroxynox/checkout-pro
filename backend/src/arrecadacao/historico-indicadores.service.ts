import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { arredondar } from '../common/numeros';
import { anoMesDe } from '../metas/metas.domain';
import { ArrecadacaoService } from './arrecadacao.service';
import {
  CONFIG_ARRECADACAO,
  TIPOS_ARRECADACAO,
  TipoArrecadacao,
} from './arrecadacao.domain';
import {
  anoMesLimiteDaJanela,
  cumpriuMeta,
  evolucaoDoMes,
  EvolucaoMes,
  fimDoAnoMes,
  inicioDoAnoMes,
  inicioDoProximoAnoMes,
  janelaDeMeses,
  MESES_HISTORICO_PADRAO,
  NivelIndicador,
  nivelDoMes,
  rotuloAnoMes,
  sequenciaCumprindo,
  valorComparavel,
  variacaoMensal,
} from './historico-indicadores.domain';

/** Um mês da série histórica de um indicador. */
export interface PontoMesIndicador {
  /** Período mensal ("AAAA-MM"). */
  anoMes: string;
  /** Rótulo curto para eixos/listas (ex.: "ago/26"). */
  rotulo: string;
  /** Soma dos lançamentos do mês (R$). */
  total: number;
  /** Soma das quantidades (itens/cupons) informadas no mês. */
  itens: number;
  /** Vendas da loja no mês (denominador dos indicadores base VENDAS). */
  vendas: number;
  /** % sobre as vendas (apenas base VENDAS; null nas metas em R$). */
  percentual: number | null;
  /** Valor comparável: R$ (base FIXA) ou % (base VENDAS). */
  valor: number;
  /** Meta que valia naquele mês. */
  meta: number;
  nivel: NivelIndicador;
  cumpriuMeta: boolean;
  /** Variação crua vs o mês anterior (%); null sem base de comparação. */
  variacao: number | null;
  /** Variação já interpretada pelo sentido do indicador. */
  evolucao: EvolucaoMes | null;
  /** true no mês corrente (ainda em andamento). */
  parcial: boolean;
  /** true quando o mês não tem nenhum movimento nem venda registrada. */
  semDados: boolean;
}

/** Série histórica de um indicador, do mês mais antigo ao mais recente. */
export interface HistoricoIndicador {
  tipo: TipoArrecadacao;
  titulo: string;
  base: 'FIXA' | 'VENDAS';
  sentido: 'MAIOR_MELHOR' | 'MENOR_MELHOR';
  /** Janela de retenção configurada (meses). */
  mesesRetencao: number;
  /** Mês mais antigo que ainda é conservado. */
  anoMesLimite: string;
  /** Meses seguidos cumprindo a meta, contando do mês mais recente para trás. */
  sequenciaCumprindo: number;
  meses: PontoMesIndicador[];
}

/** Resumo da limpeza dos períodos que saíram da janela de retenção. */
export interface ResumoPurgaHistorico {
  /** Mês mais antigo conservado depois da limpeza. */
  anoMesLimite: string;
  registrosArrecadacao: number;
  arrecadacaoSemMovimento: number;
  vendasDiarias: number;
  vendasHora: number;
  fotosMes: number;
}

/** Agregado cru de um mês, antes de virar foto. */
interface ApuracaoMes {
  total: number;
  itens: number;
  vendas: number;
  meta: number;
}

/** Retenção padrão do histórico, em meses. */
const RETENCAO_PADRAO_MESES = MESES_HISTORICO_PADRAO;

/**
 * Serviço do **Histórico de Indicadores**: a janela móvel de meses (padrão 24)
 * com a evolução de um mês para o outro.
 *
 * Como funciona
 * - **Mês corrente:** sempre calculado ao vivo a partir dos lançamentos (é
 *   parcial, muda a cada importação do dia).
 * - **Meses fechados:** lidos da foto (`fotos_mes_indicador`). Se um mês fechado
 *   ainda não tem foto — porque o histórico é novo ou porque o cron não rodou —,
 *   ele é apurado ao vivo e congelado na hora (best-effort: uma falha ao gravar
 *   nunca derruba a leitura).
 * - **Janela móvel:** todo dia 1º o serviço congela o mês que acabou de fechar e
 *   depois **apaga** o que saiu da janela (lançamentos crus, vendas e as fotos
 *   antigas). Entrando um mês novo, sai o mais antigo.
 *
 * A ordem importa: congelar ANTES de apagar garante que nenhum mês da janela
 * fique sem número. Se o congelamento falhar, a limpeza não acontece.
 */
@Injectable()
export class HistoricoIndicadoresService {
  private readonly logger = new Logger(HistoricoIndicadoresService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly arrecadacao: ArrecadacaoService,
    private readonly config: ConfigService,
  ) {}

  /** Meses de retenção configurados (env `RETENCAO_INDICADORES_MESES`), piso 1. */
  mesesRetencao(): number {
    const bruto = Number(
      this.config.get('RETENCAO_INDICADORES_MESES', RETENCAO_PADRAO_MESES),
    );
    return Number.isFinite(bruto) && bruto >= 1
      ? Math.floor(bruto)
      : RETENCAO_PADRAO_MESES;
  }

  /** Soma dos lançamentos de um tipo no intervalo [gte, lt). */
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

  /** Soma das quantidades (itens/cupons) de um tipo no intervalo. */
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

  /** Vendas da loja no intervalo. */
  private async somarVendas(gte: Date, lt: Date): Promise<number> {
    const r = await this.prisma.vendaDiaria.aggregate({
      where: { data: { gte, lt } },
      _sum: { valor: true },
    });
    return arredondar(Number(r._sum.valor ?? 0));
  }

  /**
   * Apura um mês a partir dos lançamentos crus. A meta é resolvida com a data de
   * referência do próprio mês, então um mês passado usa a meta que valia nele
   * (e não a meta de hoje).
   */
  private async apurarMes(
    tipo: TipoArrecadacao,
    anoMes: string,
  ): Promise<ApuracaoMes> {
    const gte = inicioDoAnoMes(anoMes);
    const lt = inicioDoProximoAnoMes(anoMes);
    const [total, itens, vendas, meta] = await Promise.all([
      this.somar(tipo, gte, lt),
      this.somarItens(tipo, gte, lt),
      this.somarVendas(gte, lt),
      this.arrecadacao.metaDe(tipo, fimDoAnoMes(anoMes)),
    ]);
    return { total, itens, vendas, meta };
  }

  /** Monta o ponto da série a partir de um agregado (cru ou vindo da foto). */
  private montarPonto(
    tipo: TipoArrecadacao,
    anoMes: string,
    dados: ApuracaoMes,
    parcial: boolean,
  ): PontoMesIndicador {
    const config = CONFIG_ARRECADACAO[tipo];
    const valor = arredondar(
      valorComparavel(config.base, dados.total, dados.vendas),
    );
    const semDados =
      dados.total === 0 && dados.itens === 0 && dados.vendas === 0;
    return {
      anoMes,
      rotulo: rotuloAnoMes(anoMes),
      total: dados.total,
      itens: dados.itens,
      vendas: dados.vendas,
      percentual: config.base === 'VENDAS' ? valor : null,
      valor,
      meta: dados.meta,
      nivel: nivelDoMes(config.base, valor, dados.meta),
      cumpriuMeta: cumpriuMeta(config.base, valor, dados.meta),
      // Preenchidos depois, quando a série inteira estiver montada.
      variacao: null,
      evolucao: null,
      parcial,
      semDados,
    };
  }

  /**
   * Série histórica de um indicador: um ponto por mês, do mais antigo ao mais
   * recente, com a variação e a evolução vs o mês anterior.
   *
   * `meses` é limitado pela retenção configurada — não há histórico além dela,
   * porque os dados já foram apagados.
   */
  async historico(
    tipo: TipoArrecadacao,
    meses?: number,
    hoje: Date = new Date(),
  ): Promise<HistoricoIndicador> {
    const config = CONFIG_ARRECADACAO[tipo];
    const retencao = this.mesesRetencao();
    const quantidade = Math.min(
      Math.max(1, Math.floor(meses ?? retencao)),
      retencao,
    );
    const anoMesAtual = anoMesDe(hoje);
    const lista = janelaDeMeses(anoMesAtual, quantidade);

    const fotos = await this.prisma.fotoMesIndicador.findMany({
      where: { tipo, anoMes: { in: lista } },
    });
    const porMes = new Map(fotos.map((f) => [f.anoMes, f]));

    const pontos: PontoMesIndicador[] = [];
    const paraCongelar: { anoMes: string; dados: ApuracaoMes }[] = [];

    for (const anoMes of lista) {
      const ehAtual = anoMes === anoMesAtual;
      const foto = porMes.get(anoMes);

      if (!ehAtual && foto) {
        pontos.push(
          this.montarPonto(
            tipo,
            anoMes,
            {
              total: arredondar(Number(foto.total)),
              itens: foto.itens,
              vendas: arredondar(Number(foto.vendas)),
              meta: foto.meta,
            },
            false,
          ),
        );
        continue;
      }

      const dados = await this.apurarMes(tipo, anoMes);
      const ponto = this.montarPonto(tipo, anoMes, dados, ehAtual);
      pontos.push(ponto);
      // Mês fechado e com movimento, mas sem foto: congela para as próximas
      // leituras (e para sobreviver à limpeza da janela).
      if (!ehAtual && !ponto.semDados) {
        paraCongelar.push({ anoMes, dados });
      }
    }

    this.preencherEvolucao(tipo, pontos);

    if (paraCongelar.length > 0) {
      // Best-effort: o histórico é uma leitura; se gravar a foto falhar, o
      // usuário ainda recebe os números apurados ao vivo.
      try {
        for (const { anoMes, dados } of paraCongelar) {
          await this.gravarFoto(tipo, anoMes, dados);
        }
      } catch (e) {
        this.logger.warn(
          `Não foi possível congelar fotos pendentes de ${tipo}: ${String(e)}`,
        );
      }
    }

    return {
      tipo,
      titulo: config.titulo,
      base: config.base,
      sentido: config.sentido,
      mesesRetencao: retencao,
      anoMesLimite: anoMesLimiteDaJanela(anoMesAtual, retencao),
      sequenciaCumprindo: sequenciaCumprindo(pontos),
      meses: pontos,
    };
  }

  /**
   * Preenche `variacao`/`evolucao` comparando cada mês com o **mês anterior da
   * série**. Meses sem dados não servem de base de comparação: comparar contra
   * um mês vazio produziria "+∞%".
   */
  private preencherEvolucao(
    tipo: TipoArrecadacao,
    pontos: PontoMesIndicador[],
  ): void {
    const sentido = CONFIG_ARRECADACAO[tipo].sentido;
    for (let i = 1; i < pontos.length; i++) {
      const anterior = pontos[i - 1];
      if (anterior.semDados || pontos[i].semDados) continue;
      const variacao = variacaoMensal(pontos[i].valor, anterior.valor);
      pontos[i].variacao = variacao === null ? null : arredondar(variacao);
      pontos[i].evolucao = evolucaoDoMes(sentido, pontos[i].variacao);
    }
  }

  /** Grava (cria ou atualiza) a foto de um mês/tipo. */
  private async gravarFoto(
    tipo: TipoArrecadacao,
    anoMes: string,
    dados: ApuracaoMes,
  ): Promise<void> {
    const config = CONFIG_ARRECADACAO[tipo];
    const valor = arredondar(
      valorComparavel(config.base, dados.total, dados.vendas),
    );
    const comum = {
      total: dados.total,
      itens: dados.itens,
      vendas: dados.vendas,
      percentual: config.base === 'VENDAS' ? valor : null,
      meta: dados.meta,
      nivel: nivelDoMes(config.base, valor, dados.meta),
      cumpriu: cumpriuMeta(config.base, valor, dados.meta),
      congeladoEm: new Date(),
    };
    await this.prisma.fotoMesIndicador.upsert({
      where: { tipo_anoMes: { tipo, anoMes } },
      update: comum,
      create: { tipo, anoMes, ...comum },
    });
  }

  /**
   * Congela um mês inteiro (todos os indicadores). Idempotente: rodar de novo
   * apenas reescreve as fotos com os mesmos números.
   *
   * Meses sem nenhum movimento não geram foto — não há o que congelar, e criar
   * uma linha em zero faria o histórico mostrar uma "queda" que nunca existiu.
   */
  async congelarMes(anoMes: string): Promise<number> {
    let gravadas = 0;
    for (const tipo of TIPOS_ARRECADACAO) {
      const dados = await this.apurarMes(tipo, anoMes);
      const semDados =
        dados.total === 0 && dados.itens === 0 && dados.vendas === 0;
      if (semDados) continue;
      await this.gravarFoto(tipo, anoMes, dados);
      gravadas++;
    }
    return gravadas;
  }

  /**
   * Congela todos os meses **fechados** da janela que ainda não têm foto. É o
   * que preenche o histórico dos meses já existentes na primeira execução.
   */
  async congelarMesesFechados(hoje: Date = new Date()): Promise<number> {
    const anoMesAtual = anoMesDe(hoje);
    const lista = janelaDeMeses(anoMesAtual, this.mesesRetencao()).filter(
      (m) => m !== anoMesAtual,
    );
    const existentes = await this.prisma.fotoMesIndicador.findMany({
      where: { anoMes: { in: lista } },
      select: { anoMes: true, tipo: true },
    });
    const completos = new Set<string>();
    const porMes = new Map<string, number>();
    for (const f of existentes) {
      porMes.set(f.anoMes, (porMes.get(f.anoMes) ?? 0) + 1);
    }
    for (const [anoMes, quantos] of porMes) {
      if (quantos >= TIPOS_ARRECADACAO.length) completos.add(anoMes);
    }
    let gravadas = 0;
    for (const anoMes of lista) {
      if (completos.has(anoMes)) continue;
      gravadas += await this.congelarMes(anoMes);
    }
    return gravadas;
  }

  /**
   * Apaga o que saiu da janela de retenção: lançamentos crus, marcas de "sem
   * movimento", vendas (dia e hora) e as fotos anteriores ao mês limite.
   *
   * Só apaga o que é **estritamente anterior** ao mês limite — nunca toca em
   * nada dentro da janela. Roda numa transação (tudo ou nada).
   */
  async purgarForaDaJanela(
    hoje: Date = new Date(),
  ): Promise<ResumoPurgaHistorico> {
    const limite = anoMesLimiteDaJanela(anoMesDe(hoje), this.mesesRetencao());
    const dataLimite = inicioDoAnoMes(limite);

    return this.prisma.$transaction(async (tx) => {
      const [registros, semMovimento, vendasHora, vendasDiarias, fotos] =
        await Promise.all([
          tx.registroArrecadacao.deleteMany({
            where: { data: { lt: dataLimite } },
          }),
          tx.arrecadacaoSemMovimento.deleteMany({
            where: { data: { lt: dataLimite } },
          }),
          tx.vendaHora.deleteMany({ where: { data: { lt: dataLimite } } }),
          tx.vendaDiaria.deleteMany({ where: { data: { lt: dataLimite } } }),
          // "AAAA-MM" ordena lexicograficamente igual à ordem cronológica.
          tx.fotoMesIndicador.deleteMany({ where: { anoMes: { lt: limite } } }),
        ]);
      return {
        anoMesLimite: limite,
        registrosArrecadacao: registros.count,
        arrecadacaoSemMovimento: semMovimento.count,
        vendasDiarias: vendasDiarias.count,
        vendasHora: vendasHora.count,
        fotosMes: fotos.count,
      };
    });
  }

  /**
   * Rotina mensal (dia 1º, 01:00 de Brasília): congela os meses fechados e só
   * então move a janela, apagando o que ficou para trás. Best-effort — uma
   * falha registra aviso e não derruba a aplicação; nada é apagado se o
   * congelamento falhar.
   */
  @Cron('0 1 1 * *', { timeZone: 'America/Sao_Paulo' })
  async rotinaMensal(): Promise<void> {
    try {
      const gravadas = await this.congelarMesesFechados();
      if (gravadas > 0) {
        this.logger.log(
          `Histórico de indicadores: ${gravadas} foto(s) mensal(is) congelada(s).`,
        );
      }
      const purga = await this.purgarForaDaJanela();
      const apagados =
        purga.registrosArrecadacao +
        purga.arrecadacaoSemMovimento +
        purga.vendasDiarias +
        purga.vendasHora +
        purga.fotosMes;
      if (apagados > 0) {
        this.logger.log(
          `Histórico de indicadores: janela movida para ${purga.anoMesLimite}; ` +
            `${apagados} registro(s) fora da janela apagado(s).`,
        );
      }
    } catch (e) {
      this.logger.error(
        `Falha na rotina mensal do histórico de indicadores: ${String(e)}`,
      );
    }
  }
}
