import { Injectable, Optional } from '@nestjs/common';
import { IncidenciaEscala, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { ValidacaoDataService } from '../data-inicial/validacao-data.service';
import { inicioDoDia, inicioDoMes, inicioDoProximoMes } from '../common/datas';
import {
  MotivoJustificativa,
  StatusJustificativa,
  motivoObrigatorio,
  somaPonderada,
} from '../common/justificativas';
import { mapearFiscalColaborador } from '../fiscais/colaborador-vinculo';
import { primeiroNome } from '../fiscais/fiscais.domain';
import {
  AnaliseIncidencias,
  ItemTimeline,
  META_TIPO_INCIDENCIA,
  ResumoSancoes,
  TIPOS_DISCIPLINARES,
  TipoIncidencia,
  TransicaoPonto,
  analisarIncidencias,
  derivarHoraEsperadaRetorno,
  detectarNaoRetorno,
  rankingIncidencias,
  resumirSancoes,
  rotuloTipoIncidencia,
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
  /** Duração da suspensão em dias (só para SUSPENSAO; mínimo 1). */
  diasSuspensao?: number;
  /** Vínculo opcional com a ocorrência que motivou a sanção (informativo). */
  causaTipo?: string;
  causaData?: string;
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

/** Filtros do ranking (janela + tipo opcional para comparativa por evento). */
export interface RankingIncidenciasFiltros {
  inicio: string;
  fim: string;
  /** Quando informado, ranqueia apenas esse tipo (senão, todos os tipos). */
  tipo?: TipoIncidencia;
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
    @Optional() private readonly validacaoData?: ValidacaoDataService,
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

    // Rejeita datas anteriores à Data_Inicial_Sistema (Req 6.1–6.3).
    await this.validacaoData?.exigirDataPermitida(data);

    // O `colaboradorId` é um String sem FK; garante que a ficha existe antes de
    // persistir para não criar incidências órfãs (que contaminariam ranking e
    // perfil). Rejeita com 400 quando o colaborador não existe (Req 2.3).
    const colaborador = await this.prisma.colaborador.findUnique({
      where: { id: dto.colaboradorId },
      select: { id: true },
    });
    if (!colaborador) {
      throw new ColaboradorIncidenciaInvalidoError(
        'Colaborador informado não existe.',
      );
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

    // Sanção (advertência/suspensão): o motivo é obrigatório.
    const ehSancao = META_TIPO_INCIDENCIA[dto.tipo]?.registro === 'PERFIL';
    if (ehSancao && !dto.motivo?.trim()) {
      throw new DadosIncidenciaInvalidosError('Informe o motivo da sanção.');
    }

    // Suspensão com período: guarda a duração (dias) e a data final inclusiva.
    let diasSuspensao: number | null = null;
    let dataFim: Date | null = null;
    if (dto.tipo === 'SUSPENSAO') {
      const dias =
        Number.isFinite(dto.diasSuspensao) && (dto.diasSuspensao as number) > 0
          ? Math.floor(dto.diasSuspensao as number)
          : 1;
      diasSuspensao = dias;
      dataFim = new Date(data.getTime() + (dias - 1) * 24 * 60 * 60 * 1000);
    }

    // Vínculo opcional com a ocorrência que motivou a sanção (informativo).
    const causaTipo = dto.causaTipo?.trim() || null;
    const causaData =
      causaTipo && dto.causaData ? inicioDoDia(new Date(dto.causaData)) : null;

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
          diasSuspensao,
          dataFim,
          causaTipo,
          causaData,
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

  /**
   * Justifica/reabre/injustifica um não-retorno DEPOIS do registro (abono),
   * gravando quem justificou e quando. JUSTIFICADA exige motivo; reabrir/
   * injustificar limpa o motivo. Reduz o peso no score conforme o motivo (ver
   * ADR 0009). 404 se não existir.
   */
  async justificar(
    id: string,
    input: {
      status: StatusJustificativa;
      motivo?: MotivoJustificativa | null;
      observacao?: string | null;
    },
    autor: { id?: string; nome?: string } = {},
  ): Promise<IncidenciaEscala> {
    const existente = await this.prisma.incidenciaEscala.findUnique({
      where: { id },
    });
    if (!existente) throw new IncidenciaNaoEncontradaError();
    if (motivoObrigatorio(input.status) && !input.motivo) {
      throw new DadosIncidenciaInvalidosError(
        'Para justificar, informe o motivo.',
      );
    }
    const reabrir = input.status === 'PENDENTE';
    return this.prisma.incidenciaEscala.update({
      where: { id },
      data: {
        statusJustificativa: input.status,
        motivoJustificativa: reabrir
          ? null
          : input.status === 'JUSTIFICADA'
            ? (input.motivo ?? null)
            : null,
        observacaoJustificativa: reabrir ? null : (input.observacao ?? null),
        justificadaPorId: reabrir ? null : (autor.id ?? null),
        justificadaPorNome: reabrir ? null : (autor.nome ?? null),
        justificadaEm: reabrir ? null : new Date(),
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
   * resolvido do colaborador, ordenado de forma decrescente pelo total. Aceita
   * um `tipo` opcional para comparar um evento específico (senão, soma todos).
   */
  async ranking(
    inicio: string,
    fim: string,
    tipo?: TipoIncidencia,
  ): Promise<ItemRankingIncidencias[]> {
    const gte = inicioDoDia(new Date(inicio));
    const lte = inicioDoDia(new Date(fim));
    const incidencias = await this.prisma.incidenciaEscala.findMany({
      where: { data: { gte, lte }, ...(tipo ? { tipo } : {}) },
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
   * Panorama de **sanções** (advertência/suspensão) na janela [inicio, fim]:
   * contadores do período, tendência vs. o período anterior de mesmo tamanho,
   * quem está suspenso hoje (com dias restantes) e o resumo por colaborador com
   * a sugestão de próximo passo (disciplina progressiva). A lógica de agregação
   * é pura (`resumirSancoes`); aqui ficam só as consultas.
   */
  async panoramaSancoes(
    inicio: string,
    fim: string,
    hoje: Date = new Date(),
  ): Promise<ResumoSancoes> {
    const gte = inicioDoDia(new Date(inicio));
    const lte = inicioDoDia(new Date(fim));
    // Período anterior de mesmo tamanho (para a tendência).
    const tamanhoDias = Math.max(
      0,
      Math.round((lte.getTime() - gte.getTime()) / (24 * 60 * 60 * 1000)),
    );
    const antLte = new Date(gte.getTime() - 24 * 60 * 60 * 1000);
    const antGte = new Date(
      antLte.getTime() - tamanhoDias * 24 * 60 * 60 * 1000,
    );
    const inicioHoje = inicioDoDia(hoje);
    const SANCOES: TipoIncidencia[] = ['ADVERTENCIA', 'SUSPENSAO'];

    const [atuais, anteriores, suspensoesAtivas] = await Promise.all([
      this.prisma.incidenciaEscala.findMany({
        where: { tipo: { in: SANCOES }, data: { gte, lte } },
        select: { colaboradorId: true, tipo: true, data: true },
        orderBy: { data: 'desc' },
        take: LIMITE_LISTAGEM,
      }),
      this.prisma.incidenciaEscala.findMany({
        where: { tipo: { in: SANCOES }, data: { gte: antGte, lte: antLte } },
        select: { tipo: true },
        take: LIMITE_LISTAGEM,
      }),
      this.prisma.incidenciaEscala.findMany({
        where: {
          tipo: 'SUSPENSAO',
          data: { lte: inicioHoje },
          dataFim: { gte: inicioHoje },
        },
        select: { colaboradorId: true, data: true, dataFim: true },
      }),
    ]);

    const ids = new Set<string>();
    for (const a of atuais) ids.add(a.colaboradorId);
    for (const s of suspensoesAtivas) ids.add(s.colaboradorId);
    const colaboradores = await this.prisma.colaborador.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, nome: true },
    });
    const nomePorId = new Map(colaboradores.map((c) => [c.id, c.nome]));
    const nome = (id: string): string => nomePorId.get(id) ?? id;

    return resumirSancoes(
      atuais.map((a) => ({
        colaboradorId: a.colaboradorId,
        nome: nome(a.colaboradorId),
        tipo: a.tipo as TipoIncidencia,
        data: a.data,
      })),
      anteriores.map((a) => ({ tipo: a.tipo as TipoIncidencia })),
      suspensoesAtivas
        .filter((s) => s.dataFim)
        .map((s) => ({
          colaboradorId: s.colaboradorId,
          nome: nome(s.colaboradorId),
          data: s.data,
          dataFim: s.dataFim as Date,
        })),
      hoje,
    );
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
        select: { data: true, statusJustificativa: true },
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
    const timeline = timelineUnificada(
      ausencias.map((a) => ({
        data: a.data,
        justificada: a.statusJustificativa === 'JUSTIFICADA',
      })),
      regs,
    );
    return { analise, timeline };
  }

  /**
   * Soma **ponderada** das incidências **disciplinares** de um colaborador na
   * janela `[inicio, fim)` (fim exclusivo). Usada pelo perfil para penalizar a
   * Disciplina do operador com as incidências DENTRO do período avaliado
   * (diferente do resumo de ~6 meses de `resumoDoColaborador`).
   *
   * Considera todos os tipos disciplinares (`TIPOS_DISCIPLINARES`: não-retorno,
   * atraso, saída antecipada, retorno tardio, advertência — ver ADR 0010), não
   * só o não-retorno. Cada incidência contribui com o seu peso conforme a
   * justificativa: JUSTIFICADA por atestado pesa 2%, outros motivos 10%,
   * PENDENTE/INJUSTIFICADA pesam integral (ver ADR 0009). Uma única query, sem
   * tabelas novas.
   */
  async contarIncidenciasPonderadas(
    colaboradorId: string,
    inicio: Date,
    fimExcl: Date,
  ): Promise<number> {
    const linhas = await this.prisma.incidenciaEscala.findMany({
      where: {
        colaboradorId,
        tipo: { in: [...TIPOS_DISCIPLINARES] },
        data: { gte: inicioDoDia(inicio), lt: fimExcl },
      },
      select: { statusJustificativa: true, motivoJustificativa: true },
    });
    return somaPonderada(
      linhas.map((l) => ({
        statusJustificativa: l.statusJustificativa as StatusJustificativa,
        motivoJustificativa:
          l.motivoJustificativa as MotivoJustificativa | null,
      })),
    );
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
        mensagem: `${primeiroNome(col.nome)} já tem ${qtd} incidências de "${rotuloTipoIncidencia(tipo).toLowerCase()}" neste mês. Vale acompanhar.`,
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
