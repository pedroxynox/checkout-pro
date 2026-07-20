import { Injectable, Optional } from '@nestjs/common';
import { FeriasColaborador } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { inicioDoDia } from '../common/datas';
import {
  estaDeFerias,
  periodosSobrepoem,
  validarPeriodoFerias,
} from './ferias.domain';
import {
  ColaboradorFeriasNaoEncontradoError,
  FeriasNaoEncontradaError,
  FeriasSobrepostaError,
  PeriodoFeriasInvalidoError,
} from './ferias.errors';

/** Autor de uma ação (usuário autenticado). */
export interface AutorFerias {
  id?: string;
  nome?: string;
}

/** Férias enriquecidas com o nome do colaborador (para o app). */
export interface FeriasDetalhada {
  id: string;
  colaboradorId: string;
  nome: string;
  matricula: string | null;
  inicio: string; // yyyy-mm-dd
  fim: string; // yyyy-mm-dd
  observacao: string | null;
  registradaPorNome: string | null;
  criadaEm: string;
  /** true quando o período engloba a data de referência (hoje, por padrão). */
  vigente: boolean;
}

/** Formata uma data (UTC) como "dd/mm" para textos de aviso. */
function formatarDiaMes(data: Date): string {
  const dd = String(data.getUTCDate()).padStart(2, '0');
  const mm = String(data.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

/**
 * Serviço de Férias: inativação NÃO rígida de um colaborador por um período.
 *
 * A decisão pura (período válido, sobreposição, "está de férias no dia") fica em
 * `ferias.domain`; aqui só os efeitos (Prisma + avisos). A EXCLUSÃO da escala é
 * consumida por `FiscaisService.escaladosDoDia` e pela escala consolidada via
 * `colaboradoresDeFeriasNoDia` — de modo que quem está de férias some da escala
 * e, por consequência, NÃO vira falta automática.
 */
@Injectable()
export class FeriasService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

  /**
   * Cadastra um período de férias para um colaborador. Valida o período (via
   * domínio), a existência do colaborador e a não-sobreposição com férias já
   * cadastradas. Avisa todos (best-effort). Não toca em `Colaborador.ativo` — a
   * inativação é apenas para a escala/detecção, não um desligamento.
   */
  async registrarFerias(
    colaboradorId: string,
    inicio: Date,
    fim: Date,
    dados: { observacao?: string | null } = {},
    autor: AutorFerias = {},
  ): Promise<FeriasColaborador> {
    const validacao = validarPeriodoFerias(inicio, fim);
    if (!validacao.ok) {
      throw new PeriodoFeriasInvalidoError(
        validacao.motivo === 'INTERVALO_INVERTIDO'
          ? 'A data final deve ser igual ou posterior à inicial.'
          : 'O período de férias é muito longo.',
      );
    }
    const d0 = inicioDoDia(inicio);
    const d1 = inicioDoDia(fim);

    const colaborador = await this.prisma.colaborador.findUnique({
      where: { id: colaboradorId },
      select: { nome: true },
    });
    if (!colaborador) throw new ColaboradorFeriasNaoEncontradoError();

    // Sobreposição com férias já cadastradas do MESMO colaborador.
    const existentes = await this.prisma.feriasColaborador.findMany({
      where: { colaboradorId },
      select: { inicio: true, fim: true },
    });
    const novo = { inicio: d0, fim: d1 };
    if (existentes.some((e) => periodosSobrepoem(e, novo))) {
      throw new FeriasSobrepostaError();
    }

    const criada = await this.prisma.feriasColaborador.create({
      data: {
        colaboradorId,
        inicio: d0,
        fim: d1,
        observacao: dados.observacao ?? null,
        registradaPorId: autor.id ?? null,
        registradaPorNome: autor.nome ?? null,
      },
    });

    await this.avisarFeriasRegistradas(colaborador.nome, d0, d1);
    return criada;
  }

  /** Aviso único (a todos) de férias registradas. Best-effort. */
  private async avisarFeriasRegistradas(
    nome: string,
    inicio: Date,
    fim: Date,
  ): Promise<void> {
    if (!this.notificacoes) return;
    try {
      await this.notificacoes.notificarTodos({
        titulo: '🌴 Férias registradas',
        mensagem: `${nome} estará de férias de ${formatarDiaMes(inicio)} a ${formatarDiaMes(fim)}.`,
      });
    } catch {
      // best-effort: o aviso nunca deve impedir o registro.
    }
  }

  /**
   * Lista as férias, opcionalmente de um colaborador, com o nome resolvido e a
   * marca `vigente` (engloba a data de referência — hoje por padrão). Mais
   * recentes primeiro.
   */
  async listarFerias(
    filtro: { colaboradorId?: string; referencia?: Date } = {},
  ): Promise<FeriasDetalhada[]> {
    const referencia = inicioDoDia(filtro.referencia ?? new Date());
    const ferias = await this.prisma.feriasColaborador.findMany({
      where: filtro.colaboradorId
        ? { colaboradorId: filtro.colaboradorId }
        : {},
      orderBy: { inicio: 'desc' },
    });
    const ids = [...new Set(ferias.map((f) => f.colaboradorId))];
    const colaboradores = ids.length
      ? await this.prisma.colaborador.findMany({
          where: { id: { in: ids } },
          select: { id: true, nome: true, matricula: true },
        })
      : [];
    const porId = new Map(colaboradores.map((c) => [c.id, c]));
    return ferias.map((f) => ({
      id: f.id,
      colaboradorId: f.colaboradorId,
      nome: porId.get(f.colaboradorId)?.nome ?? f.colaboradorId,
      matricula: porId.get(f.colaboradorId)?.matricula ?? null,
      inicio: f.inicio.toISOString().slice(0, 10),
      fim: f.fim.toISOString().slice(0, 10),
      observacao: f.observacao,
      registradaPorNome: f.registradaPorNome,
      criadaEm: f.criadaEm.toISOString(),
      vigente: estaDeFerias([{ inicio: f.inicio, fim: f.fim }], referencia),
    }));
  }

  /**
   * Conjunto dos `colaboradorId` que estão de férias num dia. É a fonte única de
   * exclusão usada pela escala (fiscais e operadores): quem está aqui some da
   * escala do dia e, por consequência, não gera falta automática.
   */
  async colaboradoresDeFeriasNoDia(dia: Date): Promise<Set<string>> {
    const d = inicioDoDia(dia);
    // Um período engloba `d` quando inicio <= d <= fim.
    const ferias = await this.prisma.feriasColaborador.findMany({
      where: { inicio: { lte: d }, fim: { gte: d } },
      select: { colaboradorId: true },
    });
    return new Set(ferias.map((f) => f.colaboradorId));
  }

  /** Remove um período de férias. 404 se não existir. */
  async removerFerias(id: string): Promise<void> {
    const existe = await this.prisma.feriasColaborador.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existe) throw new FeriasNaoEncontradaError();
    await this.prisma.feriasColaborador.delete({ where: { id } });
  }
}
