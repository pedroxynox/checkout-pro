import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CheckoutReporte } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { UsuarioAutenticado } from '../common/decorators/usuario-atual.decorator';
import {
  CheckoutResumo,
  ehEquipamentoValido,
  LIMIAR_RECORRENCIA,
  montarTablero,
  primeiroDiaDoMes,
  quantidadeValida,
  rotuloEquipamento,
} from './checkouts.domain';

const CONFIG_ID = 'sistema';
const QUANTIDADE_PADRAO = 38;

/** Tablero da seção Check-Outs: quantidade + caixas com nº de avarias abertas. */
export interface TableroCheckouts {
  quantidade: number;
  checkouts: CheckoutResumo[];
}

/**
 * Serviço da seção Check-Outs. A quantidade de caixas vive em `ConfigSistema`
 * (singleton). Os reportes de avaria são registrados por qualquer fiscal e
 * resolvidos pela gestão. As notificações seguem o painel de permissões:
 * ao reportar, avisa quem tem `CHECKOUTS_GERENCIAR`; ao resolver, avisa o
 * fiscal que reportou.
 */
@Injectable()
export class CheckoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  /** Quantidade de check-outs configurada (padrão 38). */
  async obterQuantidade(): Promise<number> {
    const cfg = await this.prisma.configSistema.findUnique({
      where: { id: CONFIG_ID },
      select: { quantidadeCheckouts: true },
    });
    return cfg?.quantidadeCheckouts ?? QUANTIDADE_PADRAO;
  }

  /** Define a quantidade de check-outs (Centro de Controle — gerente/admin). */
  async definirQuantidade(quantidade: number, por?: string): Promise<number> {
    if (!quantidadeValida(quantidade)) {
      throw new BadRequestException('Quantidade de check-outs inválida.');
    }
    await this.prisma.configSistema.upsert({
      where: { id: CONFIG_ID },
      update: { quantidadeCheckouts: quantidade, atualizadoPor: por },
      create: {
        id: CONFIG_ID,
        quantidadeCheckouts: quantidade,
        atualizadoPor: por,
      },
    });
    return quantidade;
  }

  /**
   * Tablero: cada caixa (1..N) com a contagem de avarias ABERTAS, os
   * equipamentos afetados e a marca de problema recorrente no mês.
   */
  async tablero(): Promise<TableroCheckouts> {
    const desde = primeiroDiaDoMes(new Date());
    const [quantidade, abertos, doMes] = await Promise.all([
      this.obterQuantidade(),
      this.prisma.checkoutReporte.findMany({
        where: { status: 'ABERTO' },
        select: { checkoutNumero: true, equipamento: true },
      }),
      // Base da recorrência: todos os reportes do mês (qualquer status).
      this.prisma.checkoutReporte.findMany({
        where: { reportadoEm: { gte: desde } },
        select: { checkoutNumero: true, equipamento: true },
      }),
    ]);
    return { quantidade, checkouts: montarTablero(quantidade, abertos, doMes) };
  }

  /** Reportes de um check-out (abertos primeiro, depois por data desc). */
  async reportesDoCheckout(numero: number): Promise<CheckoutReporte[]> {
    return this.prisma.checkoutReporte.findMany({
      where: { checkoutNumero: numero },
      orderBy: [{ status: 'asc' }, { reportadoEm: 'desc' }],
    });
  }

  /** Lista reportes por status (padrão: todos), mais recentes primeiro. */
  async listarReportes(status?: string): Promise<CheckoutReporte[]> {
    return this.prisma.checkoutReporte.findMany({
      where: status ? { status } : undefined,
      orderBy: { reportadoEm: 'desc' },
      take: 300,
    });
  }

  /** Registra uma avaria e notifica a gestão (CHECKOUTS_GERENCIAR). */
  async criarReporte(
    input: {
      checkoutNumero: number;
      equipamento: string;
      descricao: string;
      fotoUrl?: string | null;
    },
    usuario?: UsuarioAutenticado,
  ): Promise<CheckoutReporte> {
    const quantidade = await this.obterQuantidade();
    if (
      !Number.isInteger(input.checkoutNumero) ||
      input.checkoutNumero < 1 ||
      input.checkoutNumero > quantidade
    ) {
      throw new BadRequestException(
        `Check-out inválido (use um número entre 1 e ${quantidade}).`,
      );
    }
    if (!ehEquipamentoValido(input.equipamento)) {
      throw new BadRequestException('Equipamento inválido.');
    }

    // Evita ruído: se já existe uma avaria ABERTA do mesmo equipamento nesta
    // caixa, não cria outra — avisa que já está reportada.
    const jaAberta = await this.prisma.checkoutReporte.findFirst({
      where: {
        checkoutNumero: input.checkoutNumero,
        equipamento: input.equipamento,
        status: 'ABERTO',
      },
      select: { id: true },
    });
    if (jaAberta) {
      throw new ConflictException(
        `Já existe uma avaria aberta de ${rotuloEquipamento(input.equipamento)} no Check-out ${input.checkoutNumero}. Aguarde a resolução.`,
      );
    }

    const reporte = await this.prisma.checkoutReporte.create({
      data: {
        checkoutNumero: input.checkoutNumero,
        equipamento: input.equipamento,
        descricao: input.descricao,
        fotoUrl: input.fotoUrl ?? null,
        status: 'ABERTO',
        reportadoPorId: usuario?.sub ?? null,
        reportadoPorNome: usuario?.nome ?? usuario?.login ?? null,
      },
    });

    // Avisa quem pode resolver (segue o painel de permissões). Best-effort.
    try {
      await this.notificacoes.notificarComPermissao('CHECKOUTS_GERENCIAR', {
        titulo: `🖥️ Avaria no Check-out ${reporte.checkoutNumero}`,
        mensagem: `${primeiroNome(reporte.reportadoPorNome)} reportou ${rotuloEquipamento(reporte.equipamento)}: ${reporte.descricao}`,
      });
    } catch {
      // best-effort: a notificação nunca bloqueia o registro.
    }

    // Aviso de problema RECORRENTE: se este equipamento já falhou LIMIAR vezes
    // nesta caixa no mês, avisa a gestão para avaliar manutenção/troca. Dispara
    // exatamente ao atingir o limiar (não repete nas próximas ocorrências).
    try {
      const desde = primeiroDiaDoMes(new Date());
      const totalNoMes = await this.prisma.checkoutReporte.count({
        where: {
          checkoutNumero: reporte.checkoutNumero,
          equipamento: reporte.equipamento,
          reportadoEm: { gte: desde },
        },
      });
      if (totalNoMes === LIMIAR_RECORRENCIA) {
        await this.notificacoes.notificarComPermissao('CHECKOUTS_GERENCIAR', {
          titulo: `🔁 Problema recorrente no Check-out ${reporte.checkoutNumero}`,
          mensagem: `${rotuloEquipamento(reporte.equipamento)} já apresentou ${totalNoMes} avarias neste mês nesta caixa. Vale avaliar manutenção ou troca.`,
        });
      }
    } catch {
      // best-effort.
    }

    return reporte;
  }

  /**
   * Marca um reporte como resolvido (gestão) e avisa o fiscal que reportou.
   * Idempotente: se já estiver resolvido, apenas retorna.
   */
  async resolver(
    id: string,
    usuario?: UsuarioAutenticado,
  ): Promise<CheckoutReporte> {
    const atual = await this.prisma.checkoutReporte.findUnique({
      where: { id },
    });
    if (!atual) {
      throw new NotFoundException('Reporte não encontrado.');
    }
    if (atual.status === 'RESOLVIDO') {
      return atual;
    }

    const resolvido = await this.prisma.checkoutReporte.update({
      where: { id },
      data: {
        status: 'RESOLVIDO',
        resolvidoPorId: usuario?.sub ?? null,
        resolvidoPorNome: usuario?.nome ?? usuario?.login ?? null,
        resolvidoEm: new Date(),
      },
    });

    // Avisa o fiscal que reportou (best-effort).
    if (resolvido.reportadoPorId) {
      try {
        await this.notificacoes.enviar([{ id: resolvido.reportadoPorId }], {
          titulo: '✅ Avaria resolvida',
          mensagem: `Seu reporte do Check-out ${resolvido.checkoutNumero} (${resolvido.equipamento}) foi marcado como resolvido.`,
        });
      } catch {
        // best-effort.
      }
    }

    return resolvido;
  }
}

/** Primeiro nome (fallback amigável) para a mensagem do aviso. */
function primeiroNome(nome?: string | null): string {
  const limpo = (nome ?? '').trim();
  if (!limpo) return 'Um fiscal';
  return limpo.split(/\s+/)[0];
}
