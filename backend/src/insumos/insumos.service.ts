import { Injectable, NotFoundException } from '@nestjs/common';
import { CategoriaInsumo, Insumo, MovimentoEstoque } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  deltaConsumo,
  deltaRetiradaFardo,
  estoqueBaixo,
  garantirSaldoSuficiente,
  resolverFardo,
  resumoEstoque,
  resumoProativo,
  NivelEstoque,
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

/** Insumo com resumo proativo (predicción ponderada, nivel, sugestão). */
export interface InsumoProativo extends Insumo {
  estoqueBaixo: boolean;
  consumoSemana: number;
  entradaSemana: number;
  semanasRestantes: number | null;
  diasAteRuptura: number | null;
  nivel: NivelEstoque;
  sugestaoReposicao: number;
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
    const movimentosPorInsumo = await this.movimentosPorInsumo(
      insumos.map((i) => i.id),
    );
    const agora = new Date();
    return insumos.map((insumo) => {
      const resumo = resumoEstoque(
        movimentosPorInsumo.get(insumo.id) ?? [],
        insumo.limiteMinimo,
        agora,
      );
      return { ...insumo, ...resumo };
    });
  }

  /**
   * Busca em UMA consulta os movimentos dos insumos informados e os agrupa por
   * insumoId (evita o N+1 de uma consulta por insumo). Retorna apenas os campos
   * necessários para os cálculos de estoque (delta e dataHora).
   */
  private async movimentosPorInsumo(
    ids: string[],
  ): Promise<Map<string, { delta: number; dataHora: Date }[]>> {
    const mapa = new Map<string, { delta: number; dataHora: Date }[]>();
    if (ids.length === 0) return mapa;
    const movimentos = await this.prisma.movimentoEstoque.findMany({
      where: { insumoId: { in: ids } },
      select: { insumoId: true, delta: true, dataHora: true },
    });
    for (const m of movimentos) {
      const arr = mapa.get(m.insumoId) ?? [];
      arr.push({ delta: m.delta, dataHora: m.dataHora });
      mapa.set(m.insumoId, arr);
    }
    return mapa;
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
    const r = await this.prisma.movimentoEstoque.aggregate({
      where: { insumoId },
      _sum: { delta: true },
    });
    return Number(r._sum.delta ?? 0);
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
    // Não permite retirar mais sacolas do que há em estoque (saldo não fica
    // negativo). Rejeita mantendo o saldo inalterado.
    const saldoAtual = await this.saldo(entrada.insumoId);
    garantirSaldoSuficiente(saldoAtual, fardo.quantidadeSacolas);
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
    // Valida a quantidade (inteiro > 0) e o saldo antes de gravar a saída.
    const delta = deltaConsumo(quantidade);
    const saldoAtual = await this.saldo(insumoId);
    garantirSaldoSuficiente(saldoAtual, quantidade);
    await this.prisma.movimentoEstoque.create({
      data: { insumoId, delta, pdvId },
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
    // Valida a quantidade (inteiro > 0) e o saldo antes de gravar a saída.
    const delta = deltaConsumo(quantidade);
    const saldoAtual = await this.saldo(insumoId);
    garantirSaldoSuficiente(saldoAtual, quantidade);
    await this.prisma.movimentoEstoque.create({
      data: { insumoId, delta },
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
   * Zera o estoque de todos os insumos removendo todos os movimentos. O saldo
   * de cada insumo (soma dos movimentos) volta a 0. Retorna quantos movimentos
   * foram removidos. Operação administrativa.
   */
  async zerarEstoque(): Promise<number> {
    const { count } = await this.prisma.movimentoEstoque.deleteMany({});
    return count;
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

  /**
   * Painel proativo: lista insumos com predicción ponderada, nível de urgência
   * e sugestão de reposição. Substitui o `listarInsumos` como endpoint principal.
   */
  async listarProativo(): Promise<InsumoProativo[]> {
    const insumos = await this.prisma.insumo.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
    });
    const movimentosPorInsumo = await this.movimentosPorInsumo(
      insumos.map((i) => i.id),
    );
    const agora = new Date();
    return insumos.map((insumo) => {
      const resumo = resumoProativo(
        movimentosPorInsumo.get(insumo.id) ?? [],
        insumo.limiteMinimo,
        insumo.fatorEmbalagem,
        agora,
      );
      return {
        ...insumo,
        saldo: resumo.saldo,
        estoqueBaixo: resumo.estoqueBaixo,
        consumoSemana: resumo.consumoSemana,
        entradaSemana: resumo.entradaSemana,
        semanasRestantes: resumo.semanasRestantes,
        diasAteRuptura: resumo.diasAteRuptura,
        nivel: resumo.nivel,
        sugestaoReposicao: resumo.sugestaoReposicao,
      };
    });
  }

  /**
   * Insumos que precisam de reposição (nível CRITICO ou ATENCAO com sugestão > 0).
   * Usado pelo cron de auto-reposição.
   */
  async insumosParaRepor(): Promise<InsumoProativo[]> {
    const todos = await this.listarProativo();
    return todos.filter(
      (i) =>
        i.sugestaoReposicao > 0 &&
        (i.nivel === 'CRITICO' || i.nivel === 'ATENCAO'),
    );
  }

  /**
   * Registra consumo simplificado em embalagens inteiras.
   * Converte embalagens → unidade base internamente.
   */
  async registrarConsumoEmbalagem(
    insumoId: string,
    embalagens: number,
    responsavelId?: string,
  ): Promise<{ saldo: number }> {
    const insumo = await this.prisma.insumo.findUnique({
      where: { id: insumoId },
    });
    if (!insumo) throw new NotFoundException('Insumo não encontrado.');
    const base = embalagens * insumo.fatorEmbalagem;
    // Valida a quantidade e o saldo (em unidade base) antes de gravar a saída —
    // não deixa o estoque ficar negativo.
    const delta = deltaConsumo(base);
    const saldoAtual = await this.saldo(insumoId);
    garantirSaldoSuficiente(saldoAtual, base, insumo.unidade);
    await this.prisma.movimentoEstoque.create({
      data: {
        insumoId,
        delta,
        origem: 'CONSUMO',
        responsavelId,
      },
    });
    // Sem reposição automática: NADA é criado sem aprovação do gestor. O
    // estoque crítico é apenas sinalizado (indicador na tela + alerta diário),
    // nunca gera requisição sozinho.
    return { saldo: await this.saldo(insumoId) };
  }
}
