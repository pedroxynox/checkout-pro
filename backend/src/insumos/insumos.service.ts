import { Injectable, NotFoundException } from '@nestjs/common';
import { CategoriaInsumo, Insumo, MovimentoEstoque } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  calcularSaldo,
  deltaConsumo,
  deltaRetiradaFardo,
  estoqueBaixo,
  resolverFardo,
  resumoEstoque,
} from './insumos.domain';
import { FardoNaoReconhecidoError } from './insumos.errors';
import { QuantidadeInvalidaError } from './insumos.errors';

/** Parâmetros de uma retirada de fardo de sacolas (Req 3.1.1). */
export interface RetiradaFardoInput {
  codigoBarras: string;
  /** Insumo de sacolas cujo saldo será reduzido. */
  insumoId: string;
  responsavelId?: string;
  destino?: string;
}

/** Insumo com o resumo de estoque calculado (para o painel do almoxarifado). */
export interface InsumoComResumo extends Insumo {
  estoqueBaixo: boolean;
  consumoSemana: number;
  entradaSemana: number;
  semanasRestantes: number | null;
}

/** Uma entrada de estoque (movimento com delta > 0) para o "Controle de requisição". */
export interface EntradaResumo {
  id: string;
  insumoId: string;
  insumoNome: string;
  unidade: string;
  embalagem: string;
  fatorEmbalagem: number;
  quantidade: number;
  origem: string | null;
  dataHora: Date;
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
   * Lista os insumos ativos com o resumo de estoque calculado (saldo em tempo
   * real, alerta de estoque baixo, consumo e entrada da semana e previsão de
   * semanas restantes). Fonte compartilhada do painel do almoxarifado —
   * substitui a lista local por dispositivo.
   */
  async listarInsumos(): Promise<InsumoComResumo[]> {
    const insumos = await this.prisma.insumo.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
    });
    const agora = new Date();
    const resultado: InsumoComResumo[] = [];
    for (const insumo of insumos) {
      const movimentos = await this.prisma.movimentoEstoque.findMany({
        where: { insumoId: insumo.id },
        select: { delta: true, dataHora: true },
      });
      const resumo = resumoEstoque(movimentos, insumo.limiteMinimo, agora);
      resultado.push({ ...insumo, ...resumo });
    }
    return resultado;
  }

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

  /**
   * Registra uma **entrada** de estoque (delta positivo) — o "Controle de
   * requisição". Aumenta o saldo na quantidade informada (já em unidade base),
   * com origem (ex.: ENTRADA, REQUISICAO, COMPRA) e data opcional. Retorna o
   * novo saldo.
   */
  async registrarEntrada(
    insumoId: string,
    quantidade: number,
    origem = 'ENTRADA',
    responsavelId?: string,
    data?: Date,
  ): Promise<number> {
    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      throw new QuantidadeInvalidaError(quantidade);
    }
    await this.prisma.movimentoEstoque.create({
      data: {
        insumoId,
        delta: quantidade,
        origem,
        responsavelId,
        ...(data ? { dataHora: data } : {}),
      },
    });
    return this.saldo(insumoId);
  }

  /**
   * Lista as entradas (movimentos com delta > 0) mais recentes de todos os
   * insumos, com o nome/unidade do insumo, para o "Controle de requisição".
   */
  async listarEntradas(limite = 50): Promise<EntradaResumo[]> {
    const movimentos = await this.prisma.movimentoEstoque.findMany({
      where: { delta: { gt: 0 } },
      orderBy: { dataHora: 'desc' },
      take: limite,
      include: {
        insumo: {
          select: {
            nome: true,
            unidade: true,
            embalagem: true,
            fatorEmbalagem: true,
          },
        },
      },
    });
    return movimentos.map((m) => ({
      id: m.id,
      insumoId: m.insumoId,
      insumoNome: m.insumo.nome,
      unidade: m.insumo.unidade,
      embalagem: m.insumo.embalagem,
      fatorEmbalagem: m.insumo.fatorEmbalagem,
      quantidade: m.delta,
      origem: m.origem,
      dataHora: m.dataHora,
    }));
  }
}
