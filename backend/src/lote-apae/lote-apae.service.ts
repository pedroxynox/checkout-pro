import { Injectable, NotFoundException } from '@nestjs/common';
import { LoteApae } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  atualizacaoSaldoValida,
  calcularPercentualVendido,
  calcularQuantidadeVendida,
  calcularValorArrecadado,
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
   *
   * **Ao zerar o saldo** (lote totalmente vendido), encerra automaticamente o
   * lote, salvando-o como "lote vendido" no histórico (status ENCERRADO +
   * data de encerramento). Não há mais saldo a atualizar, e um novo lote passa
   * a ser registrado pelo gerente.
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
    const encerrarAgora = saldoAtual === 0 && lote.status === 'ABERTO';
    return this.prisma.loteApae.update({
      where: { id: loteId },
      data: {
        saldoAtual,
        quantidadeVendida,
        ...(encerrarAgora
          ? { status: 'ENCERRADO', dataEncerramento: new Date() }
          : {}),
      },
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
   * Valor total arrecadado (em R$) de um lote em benefício da APAE. Delega à
   * função pura `calcularValorArrecadado` (quantidade vendida × preço unitário
   * da sacola).
   */
  valorArrecadado(lote: Pick<LoteApae, 'quantidadeVendida'>): number {
    return calcularValorArrecadado(lote.quantidadeVendida);
  }

  /**
   * Retorna o lote em andamento (status ABERTO), ou `null` se não houver
   * nenhum. Substitui o estado local do app (AsyncStorage) por uma fonte
   * compartilhada no backend, permitindo retomar o lote em qualquer
   * dispositivo. Caso exista mais de um lote aberto, retorna o mais recente.
   */
  async loteAtivo(): Promise<LoteApae | null> {
    return this.prisma.loteApae.findFirst({
      where: { status: 'ABERTO' },
      orderBy: { dataInicio: 'desc' },
    });
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

  /**
   * Remove **todos** os lotes encerrados do histórico, retornando a quantidade
   * removida. Não afeta o lote ativo (ABERTO). Usado para limpar lotes de
   * teste; o registro de novos lotes encerrados continua normalmente.
   */
  async limparHistorico(): Promise<number> {
    const { count } = await this.prisma.loteApae.deleteMany({
      where: { status: 'ENCERRADO' },
    });
    return count;
  }
}
