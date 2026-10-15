import { Injectable, NotFoundException } from '@nestjs/common';
import { Feedforward, FeedforwardPonto, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { inicioDoDia } from '../common/datas';
import {
  SituacaoPontoFeedforward,
  StatusPontoFeedforward,
  deveAvisarPonto,
  diasDeAtraso,
  garantirPontoPendente,
  normalizarTextoEdicao,
  situacaoPonto,
  validarProrrogacao,
} from './feedforward.domain';
import {
  CriarFeedforwardDto,
  EditarFeedforwardDto,
} from './dto/feedforward.dto';

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
  /** Prazo antes da primeira prorrogação (null = nunca prorrogado). */
  prazoOriginal: string | null;
  prorrogacoes: number;
  prorrogadoPorNome: string | null;
  prorrogadoEm: string | null;
  motivoProrrogacao: string | null;
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
  /** Dias de atraso em `hoje` (0 = vence hoje). */
  diasAtraso: number;
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

  /**
   * Edita os dados de uma rodada (data, textos e nota). Campos ausentes não
   * mudam; texto vazio limpa; `evolucaoNota: null` remove a nota. Os pontos
   * são geridos pelas rotas próprias (adicionar/editar/prorrogar/remover).
   */
  async editar(id: string, dto: EditarFeedforwardDto): Promise<RodadaFeedforward> {
    const data: Prisma.FeedforwardUpdateInput = {};
    if (dto.data !== undefined) data.data = inicioDoDia(new Date(dto.data));
    const pontosFortes = normalizarTextoEdicao(dto.pontosFortes);
    if (pontosFortes !== undefined) data.pontosFortes = pontosFortes;
    const oportunidades = normalizarTextoEdicao(dto.oportunidades);
    if (oportunidades !== undefined) data.oportunidades = oportunidades;
    const compromisso = normalizarTextoEdicao(dto.compromissoFinal);
    if (compromisso !== undefined) data.compromissoFinal = compromisso;
    if (dto.evolucaoNota !== undefined) data.evolucaoNota = dto.evolucaoNota;

    const ff = await this.prisma.feedforward
      .update({
        where: { id },
        data,
        include: { pontos: { orderBy: { prazo: 'asc' } } },
      })
      .catch(() => null);
    if (!ff) throw new NotFoundException('Feedforward não encontrado.');
    return this.mapear(ff);
  }

  /** Adiciona um ponto a melhorar (com prazo) a uma rodada existente. */
  async adicionarPonto(
    feedforwardId: string,
    ponto: { descricao: string; prazo: string },
  ): Promise<PontoFeedforwardView> {
    const ff = await this.prisma.feedforward.findUnique({
      where: { id: feedforwardId },
      select: { id: true, colaboradorId: true },
    });
    if (!ff) throw new NotFoundException('Feedforward não encontrado.');
    const criado = await this.prisma.feedforwardPonto.create({
      data: {
        feedforwardId: ff.id,
        colaboradorId: ff.colaboradorId,
        descricao: ponto.descricao.trim(),
        prazo: inicioDoDia(new Date(ponto.prazo)),
      },
    });
    return this.mapearPonto(criado);
  }

  /** Edita a descrição de um ponto PENDENTE. */
  async editarPonto(
    pontoId: string,
    descricao: string,
  ): Promise<PontoFeedforwardView> {
    const atual = await this.pontoOuErro(pontoId);
    garantirPontoPendente(atual.status as StatusPontoFeedforward);
    const ponto = await this.prisma.feedforwardPonto.update({
      where: { id: pontoId },
      data: { descricao: descricao.trim() },
    });
    return this.mapearPonto(ponto);
  }

  /**
   * Prorroga o prazo de um ponto PENDENTE (regra pura `validarProrrogacao`),
   * guardando o prazo original na primeira vez e a auditoria da última.
   */
  async prorrogarPonto(
    pontoId: string,
    novoPrazoISO: string,
    autor: AutorFeedforward = {},
    motivo?: string,
    hoje: Date = new Date(),
  ): Promise<PontoFeedforwardView> {
    const atual = await this.pontoOuErro(pontoId);
    const novoPrazo = inicioDoDia(new Date(novoPrazoISO));
    validarProrrogacao(
      atual.status as StatusPontoFeedforward,
      atual.prazo,
      novoPrazo,
      hoje,
    );
    const ponto = await this.prisma.feedforwardPonto.update({
      where: { id: pontoId },
      data: {
        prazo: novoPrazo,
        prazoOriginal: atual.prazoOriginal ?? atual.prazo,
        prorrogacoes: { increment: 1 },
        prorrogadoPorId: autor.id ?? null,
        prorrogadoPorNome: autor.nome ?? null,
        prorrogadoEm: hoje,
        motivoProrrogacao: normalizarTextoEdicao(motivo) ?? null,
      },
    });
    return this.mapearPonto(ponto);
  }

  /** Remove um ponto PENDENTE (pontos revisados são histórico). */
  async removerPonto(pontoId: string): Promise<void> {
    const atual = await this.pontoOuErro(pontoId);
    garantirPontoPendente(atual.status as StatusPontoFeedforward);
    await this.prisma.feedforwardPonto.delete({ where: { id: pontoId } });
  }

  /** Remove uma rodada (e seus pontos, em cascata). */
  async remover(id: string): Promise<void> {
    await this.prisma.feedforward.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Feedforward não encontrado.');
    });
  }

  /**
   * Pontos PENDENTES vencidos que devem ser avisados **hoje** — no dia em que o
   * prazo vence e, se continuarem pendentes, a cada 7 dias (regra pura
   * `deveAvisarPonto`). Consumido pelo cron; traz o nome do colaborador.
   */
  async pontosVencidosDoDia(hoje: Date = new Date()): Promise<PontoVencido[]> {
    const dia = inicioDoDia(hoje);
    const pontos = await this.prisma.feedforwardPonto.findMany({
      where: { status: 'PENDENTE', prazo: { lte: dia } },
      orderBy: { prazo: 'asc' },
    });
    // A regra do domínio decide quais avisar hoje (fonte única da verdade).
    const vencidos = pontos.filter((p) =>
      deveAvisarPonto('PENDENTE', p.prazo, hoje),
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
      diasAtraso: diasDeAtraso(p.prazo, hoje),
    }));
  }

  // -------------------------------------------------------------------------

  private async pontoOuErro(pontoId: string): Promise<FeedforwardPonto> {
    const ponto = await this.prisma.feedforwardPonto.findUnique({
      where: { id: pontoId },
    });
    if (!ponto) throw new NotFoundException('Ponto não encontrado.');
    return ponto;
  }

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
      prazoOriginal: p.prazoOriginal ? p.prazoOriginal.toISOString() : null,
      prorrogacoes: p.prorrogacoes ?? 0,
      prorrogadoPorNome: p.prorrogadoPorNome ?? null,
      prorrogadoEm: p.prorrogadoEm ? p.prorrogadoEm.toISOString() : null,
      motivoProrrogacao: p.motivoProrrogacao ?? null,
    };
  }
}
