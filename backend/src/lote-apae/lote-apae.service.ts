import { Injectable, NotFoundException } from '@nestjs/common';
import { LoteApae } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  atualizacaoSaldoValida,
  calcularPercentualVendido,
  calcularQuantidadeVendida,
  criarLote,
} from './lote-apae.domain';
import {
  QuantidadeInicialInvalidaError,
  SaldoInvalidoError,
} from './lote-apae.errors';

/**
 * Serviço do ciclo de Lote de Sacolas APAE (Req 2.6): registro do lote inicial,
 * atualização de saldo com cálculo de vendida/percentual, reinício preservando
 * histórico e listagem do histórico de lotes encerrados.
 *
 * A lógica de cálculo/validação é delegada a funções puras
 * (`lote-apae.domain`); este serviço cuida apenas dos efeitos colaterais
 * (consultas e escritas via Prisma).
 */
@Injectable()
export class LoteApaeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra um novo lote inicial de sacolas APAE (Req 2.6.1) com o saldo
   * igual à quantidade inicial e nada vendido. Rejeita quantidade inválida.
   */
  async registrarLoteInicial(quantidadeInicial: number): Promise<LoteApae> {
    if (!Number.isInteger(quantidadeInicial) || quantidadeInicial < 0) {
      throw new QuantidadeInicialInvalidaError(quantidadeInicial);
    }
    const estado = criarLote(quantidadeInicial, new Date());
    return this.prisma.loteApae.create({
      data: {
        quantidadeInicial: estado.quantidadeInicial,
        saldoAtual: estado.saldoAtual,
        quantidadeVendida: estado.quantidadeVendida,
        dataInicio: estado.dataInicio,
        status: 'ABERTO',
      },
    });
  }

  /**
   * Atualiza o saldo restante de um lote (Req 2.6.2, 2.6.3). Calcula a
   * quantidade vendida (`inicial - saldoAtual`) e persiste. Rejeita saldo
   * atual maior que o anterior lançando `SaldoInvalidoError` (Req 2.6.4),
   * caso em que o lote permanece inalterado.
   */
  async atualizarSaldo(loteId: string, saldoAtual: number): Promise<LoteApae> {
    const lote = await this.prisma.loteApae.findUnique({
      where: { id: loteId },
    });
    if (!lote) {
      throw new NotFoundException('Lote de sacolas APAE não encontrado.');
    }
    if (!atualizacaoSaldoValida(lote.saldoAtual, saldoAtual)) {
      throw new SaldoInvalidoError(saldoAtual, lote.saldoAtual);
    }
    const quantidadeVendida = calcularQuantidadeVendida(
      lote.quantidadeInicial,
      saldoAtual,
    );
    return this.prisma.loteApae.update({
      where: { id: loteId },
      data: { saldoAtual, quantidadeVendida },
    });
  }

  /**
   * Percentual vendido de um lote (Req 2.6.3), sempre em [0, 1]. Delega à
   * função pura `calcularPercentualVendido`.
   */
  percentualVendido(
    lote: Pick<LoteApae, 'quantidadeInicial' | 'quantidadeVendida'>,
  ): number {
    return calcularPercentualVendido(
      lote.quantidadeInicial,
      lote.quantidadeVendida,
    );
  }

  /**
   * Reinicia o ciclo (Req 2.6.5, 2.6.6): encerra o lote atual preservando a
   * quantidade inicial, a quantidade total vendida e as datas de início e
   * encerramento, e inicia um novo lote com quantidade vendida zerada.
   */
  async reiniciarLote(
    loteId: string,
    novaQuantidadeInicial: number,
  ): Promise<{ encerrado: LoteApae; novo: LoteApae }> {
    if (!Number.isInteger(novaQuantidadeInicial) || novaQuantidadeInicial < 0) {
      throw new QuantidadeInicialInvalidaError(novaQuantidadeInicial);
    }
    const lote = await this.prisma.loteApae.findUnique({
      where: { id: loteId },
    });
    if (!lote) {
      throw new NotFoundException('Lote de sacolas APAE não encontrado.');
    }

    const agora = new Date();
    const quantidadeVendida = calcularQuantidadeVendida(
      lote.quantidadeInicial,
      lote.saldoAtual,
    );

    return this.prisma.$transaction(async (tx) => {
      const encerrado = await tx.loteApae.update({
        where: { id: loteId },
        data: {
          quantidadeVendida,
          dataEncerramento: agora,
          status: 'ENCERRADO',
        },
      });
      const novoEstado = criarLote(novaQuantidadeInicial, agora);
      const novo = await tx.loteApae.create({
        data: {
          quantidadeInicial: novoEstado.quantidadeInicial,
          saldoAtual: novoEstado.saldoAtual,
          quantidadeVendida: novoEstado.quantidadeVendida,
          dataInicio: novoEstado.dataInicio,
          status: 'ABERTO',
        },
      });
      return { encerrado, novo };
    });
  }

  /**
   * Lista o histórico de lotes encerrados (Req 2.6.7), ordenado do
   * encerramento mais recente para o mais antigo.
   */
  async historicoLotes(): Promise<LoteApae[]> {
    return this.prisma.loteApae.findMany({
      where: { status: 'ENCERRADO' },
      orderBy: { dataEncerramento: 'desc' },
    });
  }
}
