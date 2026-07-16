import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Insumo, Requisicao, StatusRequisicao } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { InsumosService } from '../insumos/insumos.service';

/** Requisição com os dados do insumo, para a UI. */
export interface RequisicaoResumo {
  id: string;
  insumoId: string;
  insumoNome: string;
  unidade: string;
  embalagem: string;
  fatorEmbalagem: number;
  /** Quantidade pedida em EMBALAGENS inteiras (ex.: 2 = 2 caixas/fardos/galões). */
  quantidade: number;
  status: StatusRequisicao;
  observacao: string | null;
  solicitanteNome: string | null;
  criadaEm: Date;
  decididaPorNome: string | null;
  decididaEm: Date | null;
  motivo: string | null;
}

type RequisicaoComInsumo = Requisicao & {
  insumo: Pick<Insumo, 'nome' | 'unidade' | 'embalagem' | 'fatorEmbalagem'>;
};

const INCLUDE_INSUMO = {
  insumo: {
    select: {
      nome: true,
      unidade: true,
      embalagem: true,
      fatorEmbalagem: true,
    },
  },
} as const;

/** Plural pt-BR da embalagem conforme a quantidade (1 caixa / 2 caixas / galões). */
function pluralEmbalagem(embalagem: string, qtd: number): string {
  if (qtd === 1) {
    return embalagem;
  }
  return embalagem.endsWith('ão')
    ? `${embalagem.slice(0, -2)}ões`
    : `${embalagem}s`;
}

/**
 * Serviço de Requisições de insumos: o fiscal solicita um insumo; gerente ou
 * supervisor aprova (gerando entrada no estoque) ou nega. Notifica os gestores
 * na criação e o solicitante na decisão.
 */
@Injectable()
export class RequisicoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacoes: NotificacoesService,
    private readonly insumos: InsumosService,
  ) {}

  private mapResumo(r: RequisicaoComInsumo): RequisicaoResumo {
    return {
      id: r.id,
      insumoId: r.insumoId,
      insumoNome: r.insumo.nome,
      unidade: r.insumo.unidade,
      embalagem: r.insumo.embalagem,
      fatorEmbalagem: r.insumo.fatorEmbalagem,
      quantidade: r.quantidade,
      status: r.status,
      observacao: r.observacao,
      solicitanteNome: r.solicitanteNome,
      criadaEm: r.criadaEm,
      decididaPorNome: r.decididaPorNome,
      decididaEm: r.decididaEm,
      motivo: r.motivo,
    };
  }

  private async nomeDe(usuarioId?: string): Promise<string | null> {
    if (!usuarioId) {
      return null;
    }
    const u = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
    });
    return u?.nome ?? u?.login ?? null;
  }

  /** Cria uma requisição PENDENTE e notifica gerentes/supervisores. */
  async criar(
    insumoId: string,
    quantidade: number,
    observacao: string | undefined,
    solicitanteId?: string,
  ): Promise<RequisicaoResumo> {
    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      throw new BadRequestException(
        'A quantidade deve ser um inteiro maior que zero.',
      );
    }
    const insumo = await this.prisma.insumo.findUnique({
      where: { id: insumoId },
    });
    if (!insumo) {
      throw new NotFoundException('Insumo não encontrado.');
    }
    const solicitanteNome = await this.nomeDe(solicitanteId);
    const criada = await this.prisma.requisicao.create({
      data: {
        insumoId,
        quantidade,
        observacao,
        solicitanteId,
        solicitanteNome,
        status: 'PENDENTE',
      },
      include: INCLUDE_INSUMO,
    });

    const gestores =
      await this.notificacoes.destinatariosComPermissao('INSUMOS_GERENCIAR');
    await this.notificacoes.enviar(gestores, {
      titulo: 'Nova requisição de insumo',
      mensagem: `${solicitanteNome ?? 'Um fiscal'} solicitou ${quantidade} ${pluralEmbalagem(insumo.embalagem, quantidade)} de ${insumo.nome}.`,
    });

    return this.mapResumo(criada);
  }

  /** Lista requisições (opcionalmente filtradas por status), mais recentes primeiro. */
  async listar(status?: StatusRequisicao): Promise<RequisicaoResumo[]> {
    const lista = await this.prisma.requisicao.findMany({
      where: status ? { status } : undefined,
      orderBy: { criadaEm: 'desc' },
      include: INCLUDE_INSUMO,
    });
    return lista.map((r) => this.mapResumo(r));
  }

  /** Quantidade de requisições pendentes (para o badge). */
  async contarPendentes(): Promise<number> {
    return this.prisma.requisicao.count({ where: { status: 'PENDENTE' } });
  }

  /** Remove TODAS as requisições (operação administrativa). Retorna a quantidade. */
  async limparTodas(): Promise<number> {
    const { count } = await this.prisma.requisicao.deleteMany({});
    return count;
  }

  /** Aprova uma requisição pendente: gera entrada no estoque e notifica o solicitante. */
  async aprovar(id: string, decisorId?: string): Promise<RequisicaoResumo> {
    const req = await this.prisma.requisicao.findUnique({ where: { id } });
    if (!req) {
      throw new NotFoundException('Requisição não encontrada.');
    }
    if (req.status !== 'PENDENTE') {
      throw new BadRequestException('A requisição já foi decidida.');
    }
    // A requisição é em embalagens inteiras; converte para a unidade base ao
    // dar entrada no estoque (ex.: 2 caixas × 20 = 40 bobinas).
    const insumo = await this.prisma.insumo.findUnique({
      where: { id: req.insumoId },
    });
    const base = req.quantidade * (insumo?.fatorEmbalagem ?? 1);
    const decididaPorNome = await this.nomeDe(decisorId);
    // A entrada gerada guarda quem REQUISITOU e quem APROVOU (para o histórico
    // de movimentos mostrar ambos na entrada).
    await this.insumos.registrarEntrada(
      req.insumoId,
      base,
      'REQUISICAO',
      decisorId,
      undefined,
      decididaPorNome ?? undefined,
      req.solicitanteNome ?? undefined,
    );
    const atualizada = await this.prisma.requisicao.update({
      where: { id },
      data: {
        status: 'APROVADA',
        decididaPorId: decisorId,
        decididaPorNome,
        decididaEm: new Date(),
      },
      include: INCLUDE_INSUMO,
    });
    if (req.solicitanteId) {
      await this.notificacoes.enviar([{ id: req.solicitanteId }], {
        titulo: 'Requisição aprovada',
        mensagem: `Sua requisição de ${atualizada.quantidade} ${pluralEmbalagem(atualizada.insumo.embalagem, atualizada.quantidade)} de ${atualizada.insumo.nome} foi aprovada e somada ao estoque.`,
      });
    }
    return this.mapResumo(atualizada);
  }

  /** Nega uma requisição pendente (com motivo opcional) e notifica o solicitante. */
  async negar(
    id: string,
    motivo: string | undefined,
    decisorId?: string,
  ): Promise<RequisicaoResumo> {
    const req = await this.prisma.requisicao.findUnique({ where: { id } });
    if (!req) {
      throw new NotFoundException('Requisição não encontrada.');
    }
    if (req.status !== 'PENDENTE') {
      throw new BadRequestException('A requisição já foi decidida.');
    }
    const decididaPorNome = await this.nomeDe(decisorId);
    const atualizada = await this.prisma.requisicao.update({
      where: { id },
      data: {
        status: 'NEGADA',
        motivo,
        decididaPorId: decisorId,
        decididaPorNome,
        decididaEm: new Date(),
      },
      include: INCLUDE_INSUMO,
    });
    if (req.solicitanteId) {
      await this.notificacoes.enviar([{ id: req.solicitanteId }], {
        titulo: 'Requisição negada',
        mensagem: motivo
          ? `Sua requisição de ${atualizada.insumo.nome} foi negada: ${motivo}`
          : `Sua requisição de ${atualizada.insumo.nome} foi negada.`,
      });
    }
    return this.mapResumo(atualizada);
  }
}
