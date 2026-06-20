import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { SessaoFiscal } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StatusFiscal, validarStatus } from './fiscais.domain';
import { FiscalStatusEventos } from './fiscais.eventos';
import { CheckInAtivoError } from './fiscais.errors';

/**
 * Serviço do monitoramento de fiscais (Req 4.1, 4.2): alteração de status com
 * "última alteração vence", check-in/check-out registrando data/horário e
 * histórico de sessões por fiscal.
 *
 * A lógica de decisão pura (validação de status, transições) é delegada a
 * `fiscais.domain`; este serviço cuida apenas dos efeitos colaterais via
 * Prisma. Uma sessão é considerada ativa enquanto `checkOut` é `null`.
 */
@Injectable()
export class FiscaisService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly eventos?: FiscalStatusEventos,
  ) {}

  /** Localiza a sessão ativa (checkOut nulo) mais recente de um fiscal. */
  private async sessaoAtiva(fiscalId: string): Promise<SessaoFiscal | null> {
    return this.prisma.sessaoFiscal.findFirst({
      where: { fiscalId, checkOut: null },
      orderBy: { checkIn: 'desc' },
    });
  }

  /**
   * Indica se o fiscal pertence ao usuário informado (Fiscal.usuarioId). Usado
   * para garantir que apenas o próprio fiscal (ou o desenvolvedor) altere o
   * seu status / check-in / check-out.
   */
  async pertenceAoUsuario(
    fiscalId: string,
    usuarioId?: string,
  ): Promise<boolean> {
    if (!usuarioId) {
      return false;
    }
    const fiscal = await this.prisma.fiscal.findUnique({
      where: { id: fiscalId },
    });
    return !!fiscal && fiscal.usuarioId === usuarioId;
  }

  /**
   * Altera o status de um fiscal (Req 4.1.1, 4.1.2). Valida o status e aplica a
   * regra "última alteração vence", atualizando o status atual da sessão ativa
   * e o horário em que ele foi definido (Req 4.1.3).
   */
  async alterarStatus(
    fiscalId: string,
    status: StatusFiscal,
    em: Date,
  ): Promise<SessaoFiscal> {
    const statusValidado = validarStatus(status);
    const sessao = await this.sessaoAtiva(fiscalId);
    if (!sessao) {
      throw new NotFoundException('Nenhuma sessão ativa para o fiscal.');
    }
    const atualizada = await this.prisma.sessaoFiscal.update({
      where: { id: sessao.id },
      data: { statusAtual: statusValidado, statusDefinidoEm: em },
    });
    // Propaga a mudança em tempo real ao painel de fiscais (Req 4.1.1–4.1.3).
    this.eventos?.publicar({
      fiscalId,
      status: statusValidado,
      statusDefinidoEm: atualizada.statusDefinidoEm,
    });
    return atualizada;
  }

  /**
   * Realiza o check-in de um fiscal (Req 4.2.1): registra a entrada e define o
   * status como "disponível". Rejeita com `CheckInAtivoError` quando já existe
   * uma sessão ativa (Req 4.2.3), mantendo a sessão original inalterada.
   */
  async checkIn(fiscalId: string, em: Date): Promise<SessaoFiscal> {
    const ativa = await this.sessaoAtiva(fiscalId);
    if (ativa) {
      throw new CheckInAtivoError(fiscalId);
    }
    const sessao = await this.prisma.sessaoFiscal.create({
      data: {
        fiscalId,
        checkIn: em,
        statusAtual: 'DISPONIVEL',
        statusDefinidoEm: em,
      },
    });
    // O check-in define o status inicial "DISPONIVEL"; propaga ao painel.
    this.eventos?.publicar({
      fiscalId,
      status: 'DISPONIVEL',
      statusDefinidoEm: sessao.statusDefinidoEm,
    });
    return sessao;
  }

  /**
   * Realiza o check-out de um fiscal (Req 4.2.2): registra a saída e marca a
   * sessão como fora de serviço. Lança `NotFoundException` quando não há sessão
   * ativa.
   */
  async checkOut(fiscalId: string, em: Date): Promise<SessaoFiscal> {
    const sessao = await this.sessaoAtiva(fiscalId);
    if (!sessao) {
      throw new NotFoundException('Nenhuma sessão ativa para o fiscal.');
    }
    return this.prisma.sessaoFiscal.update({
      where: { id: sessao.id },
      data: { checkOut: em },
    });
  }

  /**
   * Histórico de check-in/check-out de um fiscal (Req 4.2.4), ordenado da
   * sessão mais recente para a mais antiga.
   */
  async historicoSessoes(fiscalId: string): Promise<SessaoFiscal[]> {
    return this.prisma.sessaoFiscal.findMany({
      where: { fiscalId },
      orderBy: { checkIn: 'desc' },
    });
  }
}
