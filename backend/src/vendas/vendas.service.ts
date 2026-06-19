import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LinhaVendaHora } from './vendas.parser';
import {
  inicioDaProximaSemana,
  inicioDaSemana,
  inicioDoDia,
  inicioDoMes,
  inicioDoProximoDia,
  inicioDoProximoMes,
} from './vendas.domain';

export interface ResultadoUploadVendas {
  data: Date;
  horas: number;
  total: number;
}

export interface ItemVendaHora {
  hora: number;
  valor: number;
}

export interface VendasPorHora {
  total: number;
  horas: ItemVendaHora[];
}

export interface ResumoVendas {
  totalDia: number;
  totalSemana: number;
  totalMes: number;
}

function arredondar(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Serviço de Vendas por hora. Importa o arquivo .txt (substituindo o dia),
 * mantém o total diário em `VendaDiaria` (que alimenta os percentuais dos
 * indicadores) e fornece os totais por período e a distribuição por hora.
 */
@Injectable()
export class VendasService {
  constructor(private readonly prisma: PrismaService) {}

  /** Substitui as vendas por hora do dia e atualiza o total em VendaDiaria. */
  async importar(
    data: Date,
    linhas: LinhaVendaHora[],
  ): Promise<ResultadoUploadVendas> {
    const dia = inicioDoDia(data);
    const proximo = inicioDoProximoDia(data);
    const total = arredondar(linhas.reduce((s, l) => s + l.valor, 0));
    await this.prisma.$transaction([
      this.prisma.vendaHora.deleteMany({
        where: { data: { gte: dia, lt: proximo } },
      }),
      this.prisma.vendaHora.createMany({
        data: linhas.map((l) => ({ data: dia, hora: l.hora, valor: l.valor })),
      }),
      this.prisma.vendaDiaria.upsert({
        where: { data: dia },
        create: { data: dia, valor: total },
        update: { valor: total },
      }),
    ]);
    return { data: dia, horas: linhas.length, total };
  }

  private async somar(gte: Date, lt: Date): Promise<number> {
    const r = await this.prisma.vendaDiaria.aggregate({
      where: { data: { gte, lt } },
      _sum: { valor: true },
    });
    return arredondar(Number(r._sum.valor ?? 0));
  }

  /** Totais do dia/semana/mês que contêm a data. */
  async resumo(data: Date): Promise<ResumoVendas> {
    const [totalDia, totalSemana, totalMes] = await Promise.all([
      this.somar(inicioDoDia(data), inicioDoProximoDia(data)),
      this.somar(inicioDaSemana(data), inicioDaProximaSemana(data)),
      this.somar(inicioDoMes(data), inicioDoProximoMes(data)),
    ]);
    return { totalDia, totalSemana, totalMes };
  }

  /**
   * Distribuição por hora (0..23) somada no intervalo [início, fim] (inclusive)
   * e o total do período. Serve tanto para um único dia (início=fim) quanto
   * para um intervalo personalizado.
   */
  async porHora(inicio: Date, fim: Date): Promise<VendasPorHora> {
    const gte = inicioDoDia(inicio);
    const lt = inicioDoProximoDia(fim);
    const regs = await this.prisma.vendaHora.findMany({
      where: { data: { gte, lt } },
      select: { hora: true, valor: true },
    });
    const mapa = new Map<number, number>();
    for (const r of regs) {
      mapa.set(r.hora, (mapa.get(r.hora) ?? 0) + Number(r.valor));
    }
    const horas = Array.from(mapa.entries())
      .map(([hora, valor]) => ({ hora, valor: arredondar(valor) }))
      .sort((a, b) => a.hora - b.hora);
    const total = arredondar(horas.reduce((s, h) => s + h.valor, 0));
    return { total, horas };
  }

  /** Indica se já há vendas enviadas no dia informado. */
  async status(data: Date): Promise<{ enviado: boolean }> {
    const qtd = await this.prisma.vendaHora.count({
      where: {
        data: { gte: inicioDoDia(data), lt: inicioDoProximoDia(data) },
      },
    });
    return { enviado: qtd > 0 };
  }
}
