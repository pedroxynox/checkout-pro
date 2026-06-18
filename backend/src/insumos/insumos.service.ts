import { Injectable, NotFoundException } from '@nestjs/common';
import { CategoriaInsumo, Insumo, MovimentoEstoque } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  calcularSaldo,
  deltaConsumo,
  deltaRetiradaFardo,
  estoqueBaixo,
  resolverFardo,
} from './insumos.domain';
import { FardoNaoReconhecidoError } from './insumos.errors';

/** Parâmetros de uma retirada de fardo de sacolas (Req 3.1.1). */
export interface RetiradaFardoInput {
  codigoBarras: string;
  /** Insumo de sacolas cujo saldo será reduzido. */
  insumoId: string;
  responsavelId?: string;
  destino?: string;
}

/**
 * Serviço do Modulo_Insumos (Req 3.1–3.3): controle de sacolas por fardo (via
 * código de barras), bobinas por PDV, panos e demais insumos, com saldo em
 * tempo real derivado da soma dos movimentos e alerta de estoque baixo.
 *
 * A lógica de cálculo/validação é delegada a funções puras
 * (`insumos.domain`); este serviço cuida apenas dos efeitos colaterais
 * (consultas e escritas via Prisma).
 */
@Injectable()
export class InsumosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cadastra um novo tipo de insumo com seu limite mínimo (Req 3.3.4). Quando
   * informado um `saldoInicial` positivo, registra um movimento de entrada para
   * que o saldo permaneça igual à soma dos movimentos.
   */
  async cadastrarInsumo(
    nome: string,
    categoria: CategoriaInsumo,
    limiteMinimo: number,
    saldoInicial = 0,
  ): Promise<Insumo> {
    const insumo = await this.prisma.insumo.create({
      data: { nome, categoria, limiteMinimo, saldo: 0 },
    });
    if (saldoInicial > 0) {
      await this.prisma.movimentoEstoque.create({
        data: { insumoId: insumo.id, delta: saldoInicial },
      });
    }
    return insumo;
  }

  /**
   * Saldo de estoque de um insumo em tempo real (Req 3.1.4, 3.2.1, 3.3.1):
   * soma de todos os deltas dos movimentos registrados.
   */
  async saldo(insumoId: string): Promise<number> {
    const movimentos = await this.prisma.movimentoEstoque.findMany({
      where: { insumoId },
      select: { delta: true },
    });
    return calcularSaldo(0, movimentos);
  }

  /**
   * Registra a retirada de um fardo de sacolas a partir do código de barras
   * (Req 3.1.1, 3.1.2). Resolve o fardo, reduz o saldo do insumo de sacolas
   * exatamente pela quantidade de sacolas do fardo e registra responsável,
   * data/horário e destino. Lança `FardoNaoReconhecidoError` quando o código
   * não corresponde a nenhum fardo — mantendo o saldo inalterado (Req 3.1.3).
   */
  async registrarRetiradaFardo(entrada: RetiradaFardoInput): Promise<number> {
    const fardos = await this.prisma.fardo.findMany();
    const fardo = resolverFardo(fardos, entrada.codigoBarras);
    if (!fardo) {
      throw new FardoNaoReconhecidoError(entrada.codigoBarras);
    }
    await this.prisma.movimentoEstoque.create({
      data: {
        insumoId: entrada.insumoId,
        delta: deltaRetiradaFardo(fardo.quantidadeSacolas),
        responsavelId: entrada.responsavelId,
        destino: entrada.destino,
      },
    });
    return this.saldo(entrada.insumoId);
  }

  /**
   * Registra o consumo de bobinas de um PDV (Req 3.2.2), reduzindo o saldo de
   * bobinas na quantidade correspondente. Retorna o novo saldo.
   */
  async registrarConsumoBobina(
    insumoId: string,
    pdvId: string,
    quantidade: number,
  ): Promise<number> {
    await this.prisma.movimentoEstoque.create({
      data: { insumoId, delta: deltaConsumo(quantidade), pdvId },
    });
    return this.saldo(insumoId);
  }

  /**
   * Registra o consumo de um insumo (Req 3.3.2), reduzindo o saldo na
   * quantidade correspondente. Retorna o novo saldo.
   */
  async registrarConsumoInsumo(
    insumoId: string,
    quantidade: number,
  ): Promise<number> {
    await this.prisma.movimentoEstoque.create({
      data: { insumoId, delta: deltaConsumo(quantidade) },
    });
    return this.saldo(insumoId);
  }

  /**
   * Verifica se o estoque de um insumo está baixo (Req 3.1.5, 3.2.3, 3.3.3):
   * verdadeiro se e somente se o saldo atual for menor ou igual ao limite
   * mínimo configurado. Usado pela camada de API/cron para disparar o alerta
   * via serviço de notificações.
   */
  async verificarEstoqueBaixo(insumoId: string): Promise<boolean> {
    const insumo = await this.prisma.insumo.findUnique({
      where: { id: insumoId },
    });
    if (!insumo) {
      throw new NotFoundException('Insumo não encontrado.');
    }
    const saldoAtual = await this.saldo(insumoId);
    return estoqueBaixo(saldoAtual, insumo.limiteMinimo);
  }

  /**
   * Histórico de consumo/movimentos de um insumo (Req 3.1.6, 3.2.4), ordenado
   * do mais recente para o mais antigo, para apoiar a previsão de compras.
   */
  async historicoConsumo(insumoId: string): Promise<MovimentoEstoque[]> {
    return this.prisma.movimentoEstoque.findMany({
      where: { insumoId },
      orderBy: { dataHora: 'desc' },
    });
  }
}
