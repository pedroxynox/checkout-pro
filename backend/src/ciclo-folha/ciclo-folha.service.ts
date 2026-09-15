import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsuarioAutenticado } from '../common/decorators/usuario-atual.decorator';
import {
  UM_DIA_MS,
  agoraNaBrasilia,
  ciclosDoIntervalo,
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

/** Um ciclo tocado por um período, com o estado e os dias que lhe cabem. */
export interface CicloIntervaloView {
  inicio: string;
  fim: string;
  rotulo: string;
  /** Dias **do período consultado** que caem neste ciclo. */
  dias: number;
  status: 'ABERTO' | 'FECHADO';
}

/** Resultado da consulta "que ciclos este período toca?". */
export interface IntervaloCiclosView {
  ciclos: CicloIntervaloView[];
  /** true quando o período se reparte entre mais de um ciclo. */
  atravessaCiclos: boolean;
  /** Rótulos dos ciclos fechados (vazio quando todos estão abertos). */
  fechados: string[];
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
   * Usado pelo Ponto (registrar/corrigir/excluir batida) para bloquear
   * modificações ordinárias de **um dia** em ciclos fechados.
   *
   * Para um PERÍODO, use `exigirCiclosAbertos` — este método olha um dia só.
   */
  async exigirCicloAberto(data: Date): Promise<void> {
    const { inicio } = periodoFolha(data);
    const ciclo = await this.prisma.cicloFolha.findUnique({
      where: { inicio },
      select: { status: true },
    });
    if (ciclo?.status === 'FECHADO') {
      throw new CicloFechadoError([rotuloPeriodoFolha(periodoFolha(data))]);
    }
  }

  /**
   * Lança `CicloFechadoError` (409) quando **qualquer** ciclo tocado pelo
   * período `[inicio, fim]` está FECHADO, nomeando os ciclos culpados.
   *
   * Existe porque um período longo (atestado, ausência a prazo) pode atravessar
   * o corte 26→25 e gravar um dia de ausência em cada dia corrido: validar só o
   * primeiro dia deixava o resto do período entrar num ciclo já fechado sem
   * nenhum controle. Resolve todos os ciclos numa única consulta.
   */
  async exigirCiclosAbertos(inicio: Date, fim: Date): Promise<void> {
    const ciclos = ciclosDoIntervalo(inicio, fim);
    if (ciclos.length === 0) return;
    const fechados = await this.prisma.cicloFolha.findMany({
      where: {
        inicio: { in: ciclos.map((c) => c.inicio) },
        status: 'FECHADO',
      },
      select: { inicio: true },
    });
    if (fechados.length === 0) return;
    const ancoras = new Set(fechados.map((f) => f.inicio.getTime()));
    const rotulos = ciclos
      .filter((c) => ancoras.has(c.inicio.getTime()))
      .map((c) => c.rotulo);
    throw new CicloFechadoError(rotulos);
  }

  /**
   * Ciclos tocados por um período, cada um com o estado e quantos dias do
   * período lhe cabem. Consulta informativa: permite ao app avisar **antes** de
   * salvar que o período atravessa o fechamento da folha (ou que cai num ciclo
   * fechado), sem duplicar a regra do dia 26 no cliente.
   */
  async consultarIntervalo(
    inicio: Date,
    fim: Date,
  ): Promise<IntervaloCiclosView> {
    const ciclos = ciclosDoIntervalo(inicio, fim);
    if (ciclos.length === 0) {
      return { ciclos: [], atravessaCiclos: false, fechados: [] };
    }
    const registros = await this.prisma.cicloFolha.findMany({
      where: { inicio: { in: ciclos.map((c) => c.inicio) } },
      select: { inicio: true, status: true },
    });
    const statusPorAncora = new Map(
      registros.map((r) => [r.inicio.getTime(), r.status]),
    );
    const view = ciclos.map((c) => {
      const fim = new Date(c.fimExclusivo.getTime() - UM_DIA_MS);
      const fechado = statusPorAncora.get(c.inicio.getTime()) === 'FECHADO';
      return {
        inicio: c.inicio.toISOString(),
        fim: fim.toISOString(),
        rotulo: c.rotulo,
        dias: c.dias,
        status: fechado ? ('FECHADO' as const) : ('ABERTO' as const),
      };
    });
    return {
      ciclos: view,
      atravessaCiclos: view.length > 1,
      fechados: view.filter((c) => c.status === 'FECHADO').map((c) => c.rotulo),
    };
  }
}
