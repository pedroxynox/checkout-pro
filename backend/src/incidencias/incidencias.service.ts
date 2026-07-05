import { Injectable, Optional } from '@nestjs/common';
import { IncidenciaEscala, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { inicioDoDia, inicioDoMes, inicioDoProximoMes } from '../common/datas';
import { mapearFiscalColaborador } from '../fiscais/colaborador-vinculo';
import { primeiroNome } from '../fiscais/fiscais.domain';
import {
  AnaliseIncidencias,
  ItemTimeline,
  TipoIncidencia,
  TransicaoPonto,
  analisarIncidencias,
  derivarHoraEsperadaRetorno,
  detectarNaoRetorno,
  rankingIncidencias,
  timelineUnificada,
  ItemRankingIncidencias,
} from './incidencias.domain';
import {
  ColaboradorIncidenciaInvalidoError,
  DadosIncidenciaInvalidosError,
  IncidenciaDuplicadaError,
  IncidenciaNaoEncontradaError,
} from './incidencias.errors';

/** Dados para registrar uma incidência (vindos do DTO já validado). */
export interface RegistrarIncidenciaInput {
  colaboradorId: string;
  tipo: TipoIncidencia;
  /** Data ISO (yyyy-mm-dd ou ISO completo). */
  data: string;
  horaSaida?: string;
  horaEsperadaRetorno?: string;
  horaReal?: string;
  motivo?: string;
  observacao?: string;
}

/** Campos editáveis de uma incidência. */
export interface EditarIncidenciaInput {
  horaSaida?: string;
  horaEsperadaRetorno?: string;
  horaReal?: string;
  motivo?: string;
  observacao?: string;
}

/** Filtros de listagem. */
export interface ListarIncidenciasFiltros {
  colaboradorId?: string;
  tipo?: TipoIncidencia;
  inicio?: string;
  fim?: string;
}

/** Autor do registro (usuário autenticado). */
export interface AutorIncidencia {
  id: string;
  nome: string;
}

/** Candidato de auto-detecção do ponto (sugestão de incidência). */
export interface SugestaoIncidencia {
  colaboradorId: string;
  funcionarioId: string;
  nome: string;
  tipo: TipoIncidencia;
  horaSaida: string;
  horaEsperadaRetorno: string;
  origem: 'DETECTADO_PONTO';
}

/** Resumo de incidências do colaborador (consumido pelo perfil). */
export interface ResumoIncidenciasColaborador {
  analise: AnaliseIncidencias;
  timeline: ItemTimeline[];
}

/** A partir de quantas incidências no mês os gestores são avisados. */
const LIMITE_ALERTA_MES = 3;

/** Teto de linhas retornadas nas listagens (defensivo). */
const LIMITE_LISTAGEM = 500;

/** Janela padrão do resumo do perfil (meses). */
const MESES_RESUMO = 6;

/**
 * Serviço das Incidências de Escala (Fase 1 — evento "não retornou do
 * intervalo").
 *
 * Registra/edita/remove incidências por data, com unicidade colaborador+tipo+
 * data; auto-detecta candidatos a partir do ponto dos fiscais; gera ranking e
 * o resumo analítico do colaborador (para o perfil). A lógica de decisão é
 * delegada a funções puras (`incidencias.domain`); aqui ficam apenas os efeitos
 * colaterais (Prisma) e os avisos.
 *
 * `notificacoes` é opcional (injetado em produção; ausente em testes unitários
 * que exercitam só a persistência), no mesmo padrão de `OperadoresService`.
 */
@Injectable()
export class IncidenciasService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

  /**
   * Registra uma incidência de escala. Resolve o `funcionarioId` (Fiscal) do
   * colaborador quando aplicável; deriva o horário esperado de retorno da
   * escala quando não informado (mas há hora de saída). Rejeita duplicatas
   * (colaborador+tipo+data) com 409. Após criar, checa o limite mensal e avisa
   * os gestores ao cruzá-lo.
   */
  async registrar(
    dto: RegistrarIncidenciaInput,
    autor: AutorIncidencia,
  ): Promise<IncidenciaEscala> {
    const data = inicioDoDia(new Date(dto.data));
    if (Number.isNaN(data.getTime())) {
      throw new DadosIncidenciaInvalidosError('Data da incidência inválida.');
    }

    // Valida a existência do colaborador antes de persistir: sem isso, um id
    // inválido criaria uma incidência órfã que polui o ranking (nome = id cru)
    // e a listagem. O erro é 400 (ColaboradorIncidenciaInvalidoError).
    const colaborador = await this.prisma.colaborador.findUnique({
      where: { id: dto.colaboradorId },
      select: { id: true },
    });
    if (!colaborador) {
      throw new ColaboradorIncidenciaInvalidoError();
    }

    const funcionarioId = await this.resolverFuncionarioId(dto.colaboradorId);

    // Deriva o horário esperado de retorno quando não informado (mas há saída).
    let horaEsperadaRetorno = dto.horaEsperadaRetorno ?? null;
    if (!horaEsperadaRetorno && dto.horaSaida && funcionarioId) {
      const intervaloMin = await this.intervaloDaEscala(
        funcionarioId,
        data.getUTCDay(),
      );
      const derivada = derivarHoraEsperadaRetorno(dto.horaSaida, intervaloMin);
      horaEsperadaRetorno = derivada || null;
    }

    try {
      const criada = await this.prisma.incidenciaEscala.create({
        data: {
          colaboradorId: dto.colaboradorId,
          funcionarioId,
          tipo: dto.tipo,
          data,
          horaSaida: dto.horaSaida ?? null,
          horaEsperadaRetorno,
          horaReal: dto.horaReal ?? null,
          origem: 'MANUAL',
          motivo: dto.motivo ?? null,
          observacao: dto.observacao ?? null,
          registradoPorId: autor?.id ?? null,
          registradoPorNome: autor?.nome ?? null,
        },
      });
      await this.verificarLimiteMes(dto.colaboradorId, dto.tipo, data);
      return criada;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new IncidenciaDuplicadaError();
      }
      throw e;
    }
  }

  /** Edita os campos editáveis de uma incidência (404 se não existir). */
  async editar(
    id: string,
    dto: EditarIncidenciaInput,
  ): Promise<IncidenciaEscala> {
    const existente = await this.prisma.incidenciaEscala.findUnique({
      where: { id },
    });
    if (!existente) {
      throw new IncidenciaNaoEncontradaError();
    }
    return this.prisma.incidenciaEscala.update({
      where: { id },
      data: {
        horaSaida: dto.horaSaida ?? existente.horaSaida,
        horaEsperadaRetorno:
          dto.horaEsperadaRetorno ?? existente.horaEsperadaRetorno,
        horaReal: dto.horaReal ?? existente.horaReal,
        motivo: dto.motivo ?? existente.motivo,
        observacao: dto.observacao ?? existente.observacao,
      },
    });
  }

  /** Remove uma incidência (404 se não existir). */
  async remover(id: string): Promise<void> {
    const existente = await this.prisma.incidenciaEscala.findUnique({
      where: { id },
    });
    if (!existente) {
      throw new IncidenciaNaoEncontradaError();
    }
    await this.prisma.incidenciaEscala.delete({ where: { id } });
  }

  /** Lista incidências pelos filtros informados, mais recentes primeiro. */
  async listar(filtros: ListarIncidenciasFiltros): Promise<IncidenciaEscala[]> {
    const where: Prisma.IncidenciaEscalaWhereInput = {};
    if (filtros.colaboradorId) where.colaboradorId = filtros.colaboradorId;
    if (filtros.tipo) where.tipo = filtros.tipo;
    if (filtros.inicio || filtros.fim) {
      where.data = {};
      if (filtros.inicio)
        where.data.gte = inicioDoDia(new Date(filtros.inicio));
      if (filtros.fim) where.data.lte = inicioDoDia(new Date(filtros.fim));
    }
    return this.prisma.incidenciaEscala.findMany({
      where,
      orderBy: { data: 'desc' },
      take: LIMITE_LISTAGEM,
    });
  }

  /**
   * Auto-detecção (fiscais): para a data informada, monta o log de transições
   * de cada fiscal a partir do ponto (formatando o instante em HH:mm no fuso de
   * Brasília), detecta o "não retorno do intervalo" e retorna os candidatos que
   * ainda NÃO têm incidência registrada (colaborador+tipo+data).
   */
  async sugestoes(data?: string): Promise<SugestaoIncidencia[]> {
    const dia = inicioDoDia(data ? new Date(data) : new Date());
    const diaSemana = dia.getUTCDay();

    const [fiscais, usuarios, colaboradores, pontos, escalas, jaRegistradas] =
      await Promise.all([
        this.prisma.fiscal.findMany({
          select: { id: true, nome: true, usuarioId: true },
        }),
        this.prisma.usuario.findMany({ select: { id: true, login: true } }),
        this.prisma.colaborador.findMany({
          where: { funcao: 'FISCAL' },
          select: { id: true, nome: true, matricula: true, usuarioId: true },
        }),
        this.prisma.registroPontoFiscal.findMany({
          where: { data: dia },
          orderBy: { em: 'asc' },
        }),
        this.prisma.escalaEntry.findMany({ where: { diaSemana } }),
        this.prisma.incidenciaEscala.findMany({
          where: { tipo: 'NAO_RETORNO_INTERVALO', data: dia },
          select: { colaboradorId: true },
        }),
      ]);

    const mapaCol = mapearFiscalColaborador(fiscais, usuarios, colaboradores);
    const jaSet = new Set(jaRegistradas.map((r) => r.colaboradorId));

    // Intervalo por funcionário (especial prevalece sobre geral).
    const intervaloPorFuncionario = new Map<string, number>();
    for (const e of escalas) {
      const atual = intervaloPorFuncionario.get(e.funcionarioId);
      if (e.especial || atual === undefined) {
        intervaloPorFuncionario.set(e.funcionarioId, e.intervaloMin);
      }
    }

    // Agrupa transições por fiscal (já vêm ordenadas por `em`).
    const porFiscal = new Map<string, TransicaoPonto[]>();
    for (const p of pontos) {
      const arr = porFiscal.get(p.fiscalId) ?? [];
      arr.push({
        status: p.status as TransicaoPonto['status'],
        hhmm: this.formatarHhmmBrasilia(p.em),
      });
      porFiscal.set(p.fiscalId, arr);
    }

    const sugestoes: SugestaoIncidencia[] = [];
    for (const fiscal of fiscais) {
      const col = mapaCol.get(fiscal.id);
      if (!col) continue; // sem ficha canônica: não sugere
      if (jaSet.has(col.colaboradorId)) continue; // já registrada

      const transicoes = porFiscal.get(fiscal.id) ?? [];
      const intervaloMin = intervaloPorFuncionario.get(fiscal.id) ?? 0;
      const deteccao = detectarNaoRetorno(transicoes, intervaloMin);
      if (!deteccao) continue;

      sugestoes.push({
        colaboradorId: col.colaboradorId,
        funcionarioId: fiscal.id,
        nome: col.nome,
        tipo: 'NAO_RETORNO_INTERVALO',
        horaSaida: deteccao.horaSaida,
        horaEsperadaRetorno: deteccao.horaEsperadaRetorno,
        origem: 'DETECTADO_PONTO',
      });
    }
    return sugestoes.sort((a, b) => a.nome.localeCompare(b.nome));
  }

  /**
   * Ranking de incidências por colaborador na janela [inicio, fim], com o nome
   * resolvido do colaborador, ordenado de forma decrescente pelo total.
   */
  async ranking(
    inicio: string,
    fim: string,
  ): Promise<ItemRankingIncidencias[]> {
    const gte = inicioDoDia(new Date(inicio));
    const lte = inicioDoDia(new Date(fim));
    const incidencias = await this.prisma.incidenciaEscala.findMany({
      where: { data: { gte, lte } },
      select: { colaboradorId: true },
    });
    if (incidencias.length === 0) return [];

    const totais = new Map<string, number>();
    for (const inc of incidencias) {
      totais.set(inc.colaboradorId, (totais.get(inc.colaboradorId) ?? 0) + 1);
    }
    const colaboradores = await this.prisma.colaborador.findMany({
      where: { id: { in: [...totais.keys()] } },
      select: { id: true, nome: true },
    });
    const nomePorId = new Map(colaboradores.map((c) => [c.id, c.nome]));

    const linhas: ItemRankingIncidencias[] = [...totais.entries()].map(
      ([colaboradorId, total]) => ({
        colaboradorId,
        nome: nomePorId.get(colaboradorId) ?? colaboradorId,
        total,
      }),
    );
    return rankingIncidencias(linhas);
  }

  /**
   * Resumo analítico das incidências de um colaborador (últimos ~6 meses) mais
   * a linha do tempo unificada (incidências + faltas). Consumido pelo perfil.
   */
  async resumoDoColaborador(
    colaboradorId: string,
    hoje: Date = new Date(),
  ): Promise<ResumoIncidenciasColaborador> {
    const base = inicioDoMes(hoje);
    const inicio = new Date(
      Date.UTC(
        base.getUTCFullYear(),
        base.getUTCMonth() - (MESES_RESUMO - 1),
        1,
      ),
    );
    const fimExcl = inicioDoProximoMes(hoje);

    const [colaborador, incidencias, ausencias] = await Promise.all([
      this.prisma.colaborador.findUnique({
        where: { id: colaboradorId },
        select: { folgaDiaSemana: true },
      }),
      this.prisma.incidenciaEscala.findMany({
        where: { colaboradorId, data: { gte: inicio, lt: fimExcl } },
        orderBy: { data: 'desc' },
        select: { tipo: true, data: true },
      }),
      this.prisma.ausencia.findMany({
        where: { pessoaId: colaboradorId, data: { gte: inicio, lt: fimExcl } },
        select: { data: true },
      }),
    ]);

    const fimEscala = hoje.getTime() < fimExcl.getTime() ? hoje : fimExcl;
    const diasEscalados = this.contarDiasEscalados(
      colaborador?.folgaDiaSemana ?? -1,
      inicio,
      fimEscala,
    );

    const regs = incidencias.map((i) => ({
      tipo: i.tipo as TipoIncidencia,
      data: i.data,
    }));
    const analise = analisarIncidencias(regs, diasEscalados, hoje);
    const timeline = timelineUnificada(ausencias, regs);
    return { analise, timeline };
  }

  /**
   * Conta as incidências de "não retorno do intervalo" de um colaborador na
   * janela `[inicio, fim)` (fim exclusivo). Usada pelo perfil para penalizar a
   * Disciplina do operador com os não-retornos DENTRO do período avaliado
   * (diferente do resumo de ~6 meses de `resumoDoColaborador`). Uma única query
   * `count`, sem tabelas novas.
   */
  async contarNaoRetornos(
    colaboradorId: string,
    inicio: Date,
    fimExcl: Date,
  ): Promise<number> {
    return this.prisma.incidenciaEscala.count({
      where: {
        colaboradorId,
        tipo: 'NAO_RETORNO_INTERVALO',
        data: { gte: inicioDoDia(inicio), lt: fimExcl },
      },
    });
  }

  // -------------------------------------------------------------------------
  // Auxiliares (efeitos colaterais / resolução)
  // -------------------------------------------------------------------------

  /**
   * Avisa os gestores quando o colaborador atinge `LIMITE_ALERTA_MES`
   * incidências do tipo no mês da data. Dispara só ao cruzar o limite
   * (contagem === limite) para não repetir. Defensivo: nunca bloqueia o
   * registro.
   */
  private async verificarLimiteMes(
    colaboradorId: string,
    tipo: TipoIncidencia,
    data: Date,
  ): Promise<void> {
    if (!this.notificacoes) return;
    try {
      const ini = inicioDoMes(data);
      const fim = inicioDoProximoMes(data);
      const qtd = await this.prisma.incidenciaEscala.count({
        where: { colaboradorId, tipo, data: { gte: ini, lt: fim } },
      });
      if (qtd !== LIMITE_ALERTA_MES) return;
      const col = await this.prisma.colaborador.findUnique({
        where: { id: colaboradorId },
        select: { nome: true },
      });
      if (!col) return;
      const gestores = await this.notificacoes.gestores();
      if (gestores.length === 0) return;
      await this.notificacoes.enviar(gestores, {
        titulo: '🔴 Incidências recorrentes na escala',
        mensagem: `${primeiroNome(col.nome)} já tem ${qtd} incidências de "não retorno do intervalo" neste mês. Vale acompanhar.`,
      });
    } catch {
      // defensivo: o aviso nunca deve impedir o registro da incidência.
    }
  }

  /**
   * Resolve o `funcionarioId` (Fiscal.id) de um colaborador, quando ele é um
   * fiscal (por conta de acesso ou matrícula). Retorna null quando não há
   * vínculo (ex.: operador).
   */
  private async resolverFuncionarioId(
    colaboradorId: string,
  ): Promise<string | null> {
    const [fiscais, usuarios, colaboradores] = await Promise.all([
      this.prisma.fiscal.findMany({
        select: { id: true, nome: true, usuarioId: true },
      }),
      this.prisma.usuario.findMany({ select: { id: true, login: true } }),
      this.prisma.colaborador.findMany({
        where: { funcao: 'FISCAL' },
        select: { id: true, nome: true, matricula: true, usuarioId: true },
      }),
    ]);
    const mapa = mapearFiscalColaborador(fiscais, usuarios, colaboradores);
    for (const [fiscalId, col] of mapa.entries()) {
      if (col.colaboradorId === colaboradorId) return fiscalId;
    }
    return null;
  }

  /**
   * Duração do intervalo (min) da escala de um funcionário num dia da semana;
   * o horário especial prevalece sobre o geral. Fallback 0.
   */
  private async intervaloDaEscala(
    funcionarioId: string,
    diaSemana: number,
  ): Promise<number> {
    const entries = await this.prisma.escalaEntry.findMany({
      where: { funcionarioId, diaSemana },
    });
    const especial = entries.find((e) => e.especial);
    const geral = entries.find((e) => !e.especial);
    return (especial ?? geral)?.intervaloMin ?? 0;
  }

  /** Conta dias escalados (dow != folga) em [inicio, fim] inclusivo (UTC). */
  private contarDiasEscalados(folga: number, inicio: Date, fim: Date): number {
    let count = 0;
    const d = new Date(
      Date.UTC(
        inicio.getUTCFullYear(),
        inicio.getUTCMonth(),
        inicio.getUTCDate(),
      ),
    );
    const fimDia = Date.UTC(
      fim.getUTCFullYear(),
      fim.getUTCMonth(),
      fim.getUTCDate(),
    );
    while (d.getTime() <= fimDia) {
      if (d.getUTCDay() !== folga) count += 1;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return count;
  }

  /** Formata um instante como "HH:mm" no fuso de Brasília (America/Sao_Paulo). */
  private formatarHhmmBrasilia(em: Date): string {
    const partes = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(em);
    const g = (t: string): string =>
      partes.find((x) => x.type === t)?.value ?? '00';
    // hour12:false pode devolver "24" à meia-noite em alguns ambientes.
    const hh = g('hour') === '24' ? '00' : g('hour');
    return `${hh}:${g('minute')}`;
  }
}
