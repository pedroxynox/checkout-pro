import { Injectable, NotFoundException } from '@nestjs/common';
import { Feedforward, FeedforwardPonto } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { inicioDoDia } from '../common/datas';
import {
  SituacaoPontoFeedforward,
  StatusPontoFeedforward,
  pontoVencido,
  situacaoPonto,
} from './feedforward.domain';
import { CriarFeedforwardDto } from './dto/feedforward.dto';

/** Autor de uma ação (usuário autenticado). */
export interface AutorFeedforward {
  id?: string;
  nome?: string;
}

/** Ponto a melhorar, já com a situação (semáforo) calculada. */
export interface PontoFeedforwardView {
  id: string;
  descricao: string;
  prazo: string;
  status: StatusPontoFeedforward;
  situacao: SituacaoPontoFeedforward;
  revisadoPorNome: string | null;
  revisadoEm: string | null;
  observacaoRevisao: string | null;
}

/** Uma rodada de feedforward (para o histórico do perfil). */
export interface RodadaFeedforward {
  id: string;
  colaboradorId: string;
  data: string;
  liderNome: string | null;
  cargo: string | null;
  pontosFortes: string | null;
  oportunidades: string | null;
  compromissoFinal: string | null;
  evolucaoNota: number | null;
  fotoUrl: string | null;
  criadoEm: string;
  pontos: PontoFeedforwardView[];
}

/** Um ponto vencido (para o cron de avisos). */
export interface PontoVencido {
  pontoId: string;
  colaboradorId: string;
  nome: string;
  descricao: string;
  prazo: Date;
}

type FeedforwardComPontos = Feedforward & { pontos: FeedforwardPonto[] };

/**
 * Serviço do Feedforward: registro das rodadas de acompanhamento no perfil do
 * colaborador (foto do formulário + registro do líder + pontos a melhorar com
 * prazo + nota de evolução). O estado dos pontos é revisado ao vencer o prazo;
 * o cron avisa supervisores e gerentes. Segue o padrão dos Contratos: os
 * efeitos (Prisma) aqui, a regra do semáforo no domínio puro.
 */
@Injectable()
export class FeedforwardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cria uma rodada de feedforward (com os pontos a melhorar). */
  async criar(
    dto: CriarFeedforwardDto,
    autor: AutorFeedforward = {},
  ): Promise<RodadaFeedforward> {
    const colaborador = await this.prisma.colaborador.findUnique({
      where: { id: dto.colaboradorId },
      select: { id: true, funcao: true },
    });
    if (!colaborador) {
      throw new NotFoundException('Colaborador não encontrado.');
    }

    const ff = await this.prisma.feedforward.create({
      data: {
        colaboradorId: dto.colaboradorId,
        data: inicioDoDia(new Date(dto.data)),
        liderId: autor.id ?? null,
        liderNome: autor.nome ?? null,
        cargo: colaborador.funcao,
        pontosFortes: dto.pontosFortes ?? null,
        oportunidades: dto.oportunidades ?? null,
        compromissoFinal: dto.compromissoFinal ?? null,
        evolucaoNota: dto.evolucaoNota ?? null,
        pontos: {
          create: (dto.pontos ?? []).map((p) => ({
            colaboradorId: dto.colaboradorId,
            descricao: p.descricao,
            prazo: inicioDoDia(new Date(p.prazo)),
          })),
        },
      },
      include: { pontos: { orderBy: { prazo: 'asc' } } },
    });
    return this.mapear(ff);
  }

  /** Define/atualiza a foto do formulário de uma rodada. */
  async definirFoto(id: string, url: string): Promise<RodadaFeedforward> {
    const ff = await this.prisma.feedforward
      .update({
        where: { id },
        data: { fotoUrl: url },
        include: { pontos: { orderBy: { prazo: 'asc' } } },
      })
      .catch(() => null);
    if (!ff) throw new NotFoundException('Feedforward não encontrado.');
    return this.mapear(ff);
  }

  /** Histórico de rodadas de um colaborador (mais recentes primeiro). */
  async listarDoColaborador(
    colaboradorId: string,
  ): Promise<RodadaFeedforward[]> {
    const rodadas = await this.prisma.feedforward.findMany({
      where: { colaboradorId },
      orderBy: { data: 'desc' },
      include: { pontos: { orderBy: { prazo: 'asc' } } },
    });
    return rodadas.map((r) => this.mapear(r));
  }

  /** Revisa um ponto (atingido / não atingido), com auditoria. */
  async revisarPonto(
    pontoId: string,
    status: 'ATINGIDO' | 'NAO_ATINGIDO',
    autor: AutorFeedforward = {},
    observacao?: string,
  ): Promise<PontoFeedforwardView> {
    const ponto = await this.prisma.feedforwardPonto
      .update({
        where: { id: pontoId },
        data: {
          status,
          revisadoPorId: autor.id ?? null,
          revisadoPorNome: autor.nome ?? null,
          revisadoEm: new Date(),
          observacaoRevisao: observacao ?? null,
        },
      })
      .catch(() => null);
    if (!ponto) throw new NotFoundException('Ponto não encontrado.');
    return this.mapearPonto(ponto);
  }

  /** Remove uma rodada (e seus pontos, em cascata). */
  async remover(id: string): Promise<void> {
    await this.prisma.feedforward.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Feedforward não encontrado.');
    });
  }

  /**
   * Pontos PENDENTES cujo prazo já venceu (hoje ou antes) — consumido pelo
   * cron para avisar supervisores e gerentes. Traz o nome do colaborador.
   */
  async pontosVencidosDoDia(hoje: Date = new Date()): Promise<PontoVencido[]> {
    const dia = inicioDoDia(hoje);
    const pontos = await this.prisma.feedforwardPonto.findMany({
      where: { status: 'PENDENTE', prazo: { lte: dia } },
      orderBy: { prazo: 'asc' },
    });
    // Filtro defensivo pela regra do domínio (fonte única da verdade).
    const vencidos = pontos.filter((p) =>
      pontoVencido('PENDENTE', p.prazo, hoje),
    );
    if (vencidos.length === 0) return [];

    const ids = [...new Set(vencidos.map((p) => p.colaboradorId))];
    const colaboradores = await this.prisma.colaborador.findMany({
      where: { id: { in: ids } },
      select: { id: true, nome: true },
    });
    const nome = new Map(colaboradores.map((c) => [c.id, c.nome]));
    return vencidos.map((p) => ({
      pontoId: p.id,
      colaboradorId: p.colaboradorId,
      nome: nome.get(p.colaboradorId) ?? p.colaboradorId,
      descricao: p.descricao,
      prazo: p.prazo,
    }));
  }

  /** Destinatários do aviso de acompanhamento: supervisores e gerentes. */
  async destinatariosAcompanhamento(): Promise<{ id: string }[]> {
    return this.prisma.usuario.findMany({
      where: {
        perfil: { in: ['SUPERVISOR', 'GERENTE', 'ADMINISTRADOR'] },
      },
      select: { id: true },
    });
  }

  // -------------------------------------------------------------------------

  private mapear(ff: FeedforwardComPontos): RodadaFeedforward {
    return {
      id: ff.id,
      colaboradorId: ff.colaboradorId,
      data: ff.data.toISOString(),
      liderNome: ff.liderNome,
      cargo: ff.cargo,
      pontosFortes: ff.pontosFortes,
      oportunidades: ff.oportunidades,
      compromissoFinal: ff.compromissoFinal,
      evolucaoNota: ff.evolucaoNota,
      fotoUrl: ff.fotoUrl,
      criadoEm: ff.criadoEm.toISOString(),
      pontos: ff.pontos.map((p) => this.mapearPonto(p)),
    };
  }

  private mapearPonto(
    p: FeedforwardPonto,
    hoje: Date = new Date(),
  ): PontoFeedforwardView {
    const status = p.status as StatusPontoFeedforward;
    return {
      id: p.id,
      descricao: p.descricao,
      prazo: p.prazo.toISOString(),
      status,
      situacao: situacaoPonto(status, p.prazo, hoje),
      revisadoPorNome: p.revisadoPorNome,
      revisadoEm: p.revisadoEm ? p.revisadoEm.toISOString() : null,
      observacaoRevisao: p.observacaoRevisao,
    };
  }
}
