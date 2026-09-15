import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CONFIG_METAS,
  TIPOS_META,
  TipoMeta,
  UnidadeMeta,
  ehMetaDerivada,
  intervaloDoMes,
  metaDeEstimativas,
} from './metas.domain';
import { MetaDerivadaNaoEditavelError } from './metas.errors';

/** Uma meta mensal resolvida (valor + metadados de exibição). */
export interface MetaMensalView {
  tipo: TipoMeta;
  anoMes: string;
  titulo: string;
  unidade: UnidadeMeta;
  sentido: 'MAIOR_MELHOR' | 'MENOR_MELHOR';
  /** Valor da meta para o mês. */
  meta: number;
  /**
   * Verdadeiro quando o mês tem um valor próprio (não é só o padrão). Nas metas
   * digitadas, significa "há registro salvo"; nas derivadas (VENDAS), significa
   * "há estimativas cadastradas no mês".
   */
  definida: boolean;
  /**
   * Verdadeiro quando a meta é **calculada** a partir de outro dado do sistema
   * em vez de digitada. Em VENDAS, é a soma das estimativas diárias.
   */
  derivada: boolean;
  /** De onde vem o valor, para explicar ao gestor na tela de Metas. */
  origem: string;
}

/**
 * Serviço das Metas mensais. Fonte única de verdade das metas por período
 * mensal. Há dois regimes:
 *
 *  - **VENDAS (derivada):** a meta do mês é a soma das estimativas diárias
 *    (`estimativas_venda_dia`, Central de Vendas). Não se digita e não aceita
 *    registro em `metas_mensais`; um mês sem estimativas resolve 0, que o
 *    sistema lê como "meta ainda não definida". Ver ADR 0017.
 *  - **Demais tipos (digitadas):** registro salvo em `metas_mensais`
 *    (tipo + anoMes) e, na falta dele, o valor padrão de CONFIG_METAS.
 *
 * A meta legada de `config_vendas.metaMensal` deixou de ser consultada: a
 * consolidação numa fonte única era a dívida registrada no atlas de Metas.
 */
@Injectable()
export class MetasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve o valor da meta de um tipo no mês. Usado pelos serviços de Vendas
   * e Arrecadação para colorir/projetar os indicadores.
   */
  async resolver(tipo: TipoMeta, anoMes: string): Promise<number> {
    if (ehMetaDerivada(tipo)) {
      return this.somarEstimativas(anoMes);
    }
    try {
      const registro = await this.prisma.metaMensal.findUnique({
        where: { tipo_anoMes: { tipo, anoMes } },
      });
      if (registro) {
        return Number(registro.meta);
      }
    } catch {
      // Tabela ainda não migrada: cai no valor padrão.
    }
    return CONFIG_METAS[tipo].valorPadrao;
  }

  /**
   * Soma as estimativas diárias do mês (meta de VENDAS). Lê `EstimativaVendaDia`
   * direto pelo Prisma de propósito: `VendasService` já depende deste serviço,
   * então injetá-lo aqui criaria dependência circular.
   */
  private async somarEstimativas(anoMes: string): Promise<number> {
    try {
      const { inicio, fim } = intervaloDoMes(anoMes);
      const regs = await this.prisma.estimativaVendaDia.findMany({
        where: { data: { gte: inicio, lt: fim } },
        select: { valor: true },
      });
      return metaDeEstimativas(regs.map((r) => Number(r.valor)));
    } catch {
      // Período inválido ou tabela ausente: sem meta para o mês.
      return 0;
    }
  }

  /** Lista as metas dos 5 tipos para o mês (valor resolvido + metadados). */
  async listar(anoMes: string): Promise<MetaMensalView[]> {
    let salvos: { tipo: string; meta: unknown }[] = [];
    try {
      salvos = await this.prisma.metaMensal.findMany({
        where: { anoMes },
        select: { tipo: true, meta: true },
      });
    } catch {
      salvos = [];
    }
    const porTipo = new Map(salvos.map((s) => [s.tipo, Number(s.meta)]));

    return Promise.all(
      TIPOS_META.map(async (tipo) => {
        if (ehMetaDerivada(tipo)) {
          const meta = await this.somarEstimativas(anoMes);
          return this.montarView(tipo, anoMes, meta, meta > 0);
        }
        const definida = porTipo.has(tipo);
        const meta = definida
          ? (porTipo.get(tipo) as number)
          : CONFIG_METAS[tipo].valorPadrao;
        return this.montarView(tipo, anoMes, meta, definida);
      }),
    );
  }

  /**
   * Define (cria/atualiza) a meta de um tipo no mês. Recusa os tipos derivados:
   * a meta de VENDAS só muda mexendo nas estimativas diárias.
   */
  async definir(
    tipo: TipoMeta,
    anoMes: string,
    meta: number,
    atualizadoPor?: string,
  ): Promise<MetaMensalView> {
    if (ehMetaDerivada(tipo)) {
      throw new MetaDerivadaNaoEditavelError(tipo);
    }
    await this.prisma.metaMensal.upsert({
      where: { tipo_anoMes: { tipo, anoMes } },
      update: { meta, atualizadoPor },
      create: { tipo, anoMes, meta, atualizadoPor },
    });
    return this.montarView(tipo, anoMes, meta, true);
  }

  /** Monta a view de uma meta (rótulos + origem do valor). */
  private montarView(
    tipo: TipoMeta,
    anoMes: string,
    meta: number,
    definida: boolean,
  ): MetaMensalView {
    const config = CONFIG_METAS[tipo];
    const derivada = ehMetaDerivada(tipo);
    return {
      tipo,
      anoMes,
      titulo: config.titulo,
      unidade: config.unidade,
      sentido: config.sentido,
      meta,
      definida,
      derivada,
      origem: derivada
        ? 'Soma das estimativas diárias do mês (Central de Vendas).'
        : 'Valor definido pelo gestor em Centro de Controle ▸ Metas.',
    };
  }
}
