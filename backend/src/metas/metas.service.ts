import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CONFIG_METAS,
  TIPOS_META,
  TipoMeta,
  UnidadeMeta,
} from './metas.domain';

/** Uma meta mensal resolvida (valor + metadados de exibição). */
export interface MetaMensalView {
  tipo: TipoMeta;
  anoMes: string;
  titulo: string;
  unidade: UnidadeMeta;
  sentido: 'MAIOR_MELHOR' | 'MENOR_MELHOR';
  /** Valor da meta para o mês (com fallback ao padrão). */
  meta: number;
  /** Verdadeiro se há um registro salvo para este tipo+mês (não é só padrão). */
  definida: boolean;
}

/**
 * Serviço das Metas mensais. Fonte única de verdade das metas por período
 * mensal. Resolve o valor de cada indicador com fallback:
 *  1) registro salvo em `metas_mensais` (tipo + anoMes);
 *  2) para VENDAS, a meta legada de `config_vendas` (compatibilidade);
 *  3) o valor padrão de CONFIG_METAS.
 */
@Injectable()
export class MetasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve o valor da meta de um tipo no mês (com fallback). Usado pelos
   * serviços de Vendas e Arrecadação para colorir/projetar os indicadores.
   */
  async resolver(tipo: TipoMeta, anoMes: string): Promise<number> {
    try {
      const registro = await this.prisma.metaMensal.findUnique({
        where: { tipo_anoMes: { tipo, anoMes } },
      });
      if (registro) {
        return Number(registro.meta);
      }
    } catch {
      // Tabela ainda não migrada: cai no fallback abaixo.
    }
    return this.valorPadrao(tipo);
  }

  /** Valor padrão de um tipo (VENDAS herda a meta legada do Painel de Vendas). */
  private async valorPadrao(tipo: TipoMeta): Promise<number> {
    if (tipo === 'VENDAS') {
      try {
        const cfg = await this.prisma.configVendas.findUnique({
          where: { id: 'vendas' },
        });
        if (cfg && Number(cfg.metaMensal) > 0) {
          return Number(cfg.metaMensal);
        }
      } catch {
        // Sem config legada: usa o padrão.
      }
    }
    return CONFIG_METAS[tipo].valorPadrao;
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
        const config = CONFIG_METAS[tipo];
        const definida = porTipo.has(tipo);
        const meta = definida
          ? (porTipo.get(tipo) as number)
          : await this.valorPadrao(tipo);
        return {
          tipo,
          anoMes,
          titulo: config.titulo,
          unidade: config.unidade,
          sentido: config.sentido,
          meta,
          definida,
        };
      }),
    );
  }

  /** Define (cria/atualiza) a meta de um tipo no mês. */
  async definir(
    tipo: TipoMeta,
    anoMes: string,
    meta: number,
    atualizadoPor?: string,
  ): Promise<MetaMensalView> {
    await this.prisma.metaMensal.upsert({
      where: { tipo_anoMes: { tipo, anoMes } },
      update: { meta, atualizadoPor },
      create: { tipo, anoMes, meta, atualizadoPor },
    });
    const config = CONFIG_METAS[tipo];
    return {
      tipo,
      anoMes,
      titulo: config.titulo,
      unidade: config.unidade,
      sentido: config.sentido,
      meta,
      definida: true,
    };
  }
}
