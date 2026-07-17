import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsuarioAutenticado } from '../common/decorators/usuario-atual.decorator';
import {
  agoraNaBrasilia,
  periodoFolha,
  periodoFolhaDeslocado,
  rotuloPeriodoFolha,
} from '../common/datas';
import { CicloFechadoError, CicloNaoFechadoError } from './ciclo-folha.errors';

/** Período do ciclo (serializável) exposto ao app. */
export interface PeriodoCiclo {
  inicio: string;
  fim: string;
  rotulo: string;
  deslocamento: number;
}

/** Estado de fechamento de um ciclo de folha. */
export interface EstadoCicloFolha {
  periodo: PeriodoCiclo;
  status: 'ABERTO' | 'FECHADO';
  fechadoPorNome: string | null;
  fechadoEm: string | null;
  reabertoPorNome: string | null;
  reabertoEm: string | null;
}

/** Um evento da trilha (fechamento/reabertura). */
export interface EventoCicloView {
  tipo: 'FECHADO' | 'REABERTO';
  porNome: string | null;
  em: string;
}

/**
 * Fechamento/reabertura do ciclo de folha (26→25).
 *
 * Módulo autônomo (depende só do Prisma + do cálculo puro de período), para ser
 * reutilizado tanto pelo Ponto quanto pela Central de Jornada sem dependência
 * circular. A âncora de um ciclo é o `inicio` (dia 26, 00:00 UTC). Sem linha =
 * ABERTO; uma linha FECHADO bloqueia modificações ordinárias no período.
 */
@Injectable()
export class CicloFolhaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolve o período (âncora inicio/fim) a partir de um deslocamento. */
  private periodoDe(deslocamento: number): {
    inicio: Date;
    fimExclusivo: Date;
  } {
    return periodoFolhaDeslocado(agoraNaBrasilia(), deslocamento);
  }

  private montarPeriodo(
    p: { inicio: Date; fimExclusivo: Date },
    deslocamento: number,
  ): PeriodoCiclo {
    const fim = new Date(p.fimExclusivo);
    fim.setUTCDate(fim.getUTCDate() - 1);
    return {
      inicio: p.inicio.toISOString(),
      fim: fim.toISOString(),
      rotulo: rotuloPeriodoFolha(p),
      deslocamento,
    };
  }

  /** Estado atual do ciclo indicado pelo deslocamento (0 = atual). */
  async status(deslocamento = 0): Promise<EstadoCicloFolha> {
    const p = this.periodoDe(deslocamento);
    const ciclo = await this.prisma.cicloFolha.findUnique({
      where: { inicio: p.inicio },
    });
    return {
      periodo: this.montarPeriodo(p, deslocamento),
      status: ciclo?.status === 'FECHADO' ? 'FECHADO' : 'ABERTO',
      fechadoPorNome: ciclo?.fechadoPorNome ?? null,
      fechadoEm: ciclo?.fechadoEm?.toISOString() ?? null,
      reabertoPorNome: ciclo?.reabertoPorNome ?? null,
      reabertoEm: ciclo?.reabertoEm?.toISOString() ?? null,
    };
  }

  /** Fecha o ciclo (revisado): bloqueia modificações ordinárias no período. */
  async fechar(
    deslocamento: number,
    usuario: UsuarioAutenticado,
  ): Promise<EstadoCicloFolha> {
    const p = this.periodoDe(deslocamento);
    const agora = new Date();
    await this.prisma.cicloFolha.upsert({
      where: { inicio: p.inicio },
      create: {
        inicio: p.inicio,
        fimExclusivo: p.fimExclusivo,
        status: 'FECHADO',
        fechadoPor: usuario.sub,
        fechadoPorNome: usuario.nome ?? null,
        fechadoEm: agora,
      },
      update: {
        status: 'FECHADO',
        fechadoPor: usuario.sub,
        fechadoPorNome: usuario.nome ?? null,
        fechadoEm: agora,
        // Um novo fechamento zera a marca da reabertura anterior.
        reabertoPor: null,
        reabertoPorNome: null,
        reabertoEm: null,
      },
    });
    await this.prisma.cicloFolhaEvento.create({
      data: {
        inicio: p.inicio,
        tipo: 'FECHADO',
        por: usuario.sub,
        porNome: usuario.nome ?? null,
      },
    });
    return this.status(deslocamento);
  }

  /**
   * Reabre um ciclo fechado (exige autorização — só administrador no
   * controller). Volta a ABERTO e registra quem reabriu. Como os relatórios são
   * calculados sob demanda, a reabertura já faz a próxima apuração refletir as
   * novas correções (não há snapshot a invalidar).
   */
  async reabrir(
    deslocamento: number,
    usuario: UsuarioAutenticado,
  ): Promise<EstadoCicloFolha> {
    const p = this.periodoDe(deslocamento);
    const atual = await this.prisma.cicloFolha.findUnique({
      where: { inicio: p.inicio },
    });
    if (!atual || atual.status !== 'FECHADO') {
      throw new CicloNaoFechadoError();
    }
    await this.prisma.cicloFolha.update({
      where: { inicio: p.inicio },
      data: {
        status: 'ABERTO',
        reabertoPor: usuario.sub,
        reabertoPorNome: usuario.nome ?? null,
        reabertoEm: new Date(),
      },
    });
    await this.prisma.cicloFolhaEvento.create({
      data: {
        inicio: p.inicio,
        tipo: 'REABERTO',
        por: usuario.sub,
        porNome: usuario.nome ?? null,
      },
    });
    return this.status(deslocamento);
  }

  /** Trilha de fechamentos/reaberturas do ciclo (mais recentes por último). */
  async eventos(deslocamento = 0): Promise<EventoCicloView[]> {
    const p = this.periodoDe(deslocamento);
    const eventos = await this.prisma.cicloFolhaEvento.findMany({
      where: { inicio: p.inicio },
      orderBy: [{ em: 'asc' }, { id: 'asc' }],
    });
    return eventos.map((e) => ({
      tipo: e.tipo,
      porNome: e.porNome,
      em: e.em.toISOString(),
    }));
  }

  /**
   * Lança `CicloFechadoError` (409) quando a `data` cai num ciclo FECHADO.
   * Usado pelo Ponto (registrar/corrigir/excluir batida) e pela Central
   * (marcar débito) para bloquear modificações ordinárias em ciclos fechados.
   */
  async exigirCicloAberto(data: Date): Promise<void> {
    const { inicio } = periodoFolha(data);
    const ciclo = await this.prisma.cicloFolha.findUnique({
      where: { inicio },
      select: { status: true },
    });
    if (ciclo?.status === 'FECHADO') {
      throw new CicloFechadoError();
    }
  }
}
