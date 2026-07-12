import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SolicitacaoAdvertencia } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import {
  IncidenciasService,
  AutorIncidencia,
} from '../incidencias/incidencias.service';
import { IncidenciaDuplicadaError } from '../incidencias/incidencias.errors';
import { inicioDoDia } from '../common/datas';

/** Motivo padrão de uma advertência por falta não justificada. */
const MOTIVO_DESIDIA = 'Desídia (falta não justificada)';

/**
 * Janela retroativa (dias) que o cron considera ao procurar faltas ainda
 * pendentes. Evita gerar solicitações para faltas muito antigas ao ligar a
 * funcionalidade (ex.: faltas de meses atrás nunca justificadas).
 */
const JANELA_DIAS = 30;

/** Solicitação de advertência já resolvida para a UI (com nome do colaborador). */
export interface SolicitacaoAdvertenciaResumo {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  ausenciaId: string;
  dataFalta: string;
  motivo: string;
  status: SolicitacaoAdvertencia['status'];
  criadaEm: string;
}

/**
 * Serviço de **solicitações automáticas de advertência** por falta não
 * justificada (ADR 0013).
 *
 * Todo dia às 08:00 (Brasília) o cron varre as faltas que continuam PENDENTES
 * de justificativa do dia anterior (ou antes, dentro de uma janela) e cria uma
 * solicitação PENDENTE por falta (idempotente: `ausenciaId` é único), avisando
 * os gestores. A advertência NÃO é lançada automaticamente: o gerente APROVA
 * (aí sim cria a advertência em Sanções) ou CANCELA. Se a falta for justificada
 * antes da decisão, a solicitação é cancelada automaticamente (na listagem e na
 * hora de aprovar), cobrindo o caso "o funcionário justificou e o gerente
 * esqueceu de marcar no app".
 */
@Injectable()
export class AdvertenciasService {
  private readonly logger = new Logger(AdvertenciasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacoes: NotificacoesService,
    private readonly incidencias: IncidenciasService,
  ) {}

  private mapResumo(
    s: SolicitacaoAdvertencia,
    nome: string,
  ): SolicitacaoAdvertenciaResumo {
    return {
      id: s.id,
      colaboradorId: s.colaboradorId,
      colaboradorNome: nome,
      ausenciaId: s.ausenciaId,
      dataFalta: s.dataFalta.toISOString().slice(0, 10),
      motivo: s.motivo,
      status: s.status,
      criadaEm: s.criadaEm.toISOString(),
    };
  }

  /**
   * CRON diário (08:00 Brasília): gera as solicitações de advertência das
   * faltas ainda não justificadas. Defensivo: nunca deve derrubar o processo.
   */
  @Cron('0 8 * * *', { timeZone: 'America/Sao_Paulo' })
  async gerarSolicitacoesDiarias(): Promise<void> {
    try {
      const criadas = await this.gerarSolicitacoes(new Date());
      if (criadas > 0) {
        this.logger.log(
          `Solicitações de advertência geradas: ${criadas} falta(s) não justificada(s).`,
        );
      }
    } catch (erro) {
      this.logger.warn(
        `Falha ao gerar solicitações de advertência: ${String(erro)}`,
      );
    }
  }

  /**
   * Cria as solicitações de advertência para as faltas PENDENTES de
   * justificativa anteriores a `hoje` (dentro da janela retroativa), pulando as
   * que já têm solicitação (idempotência). Notifica os gestores se criar
   * alguma. Retorna quantas foram criadas.
   */
  async gerarSolicitacoes(hoje: Date): Promise<number> {
    const inicioHoje = inicioDoDia(hoje);
    const limiteInicio = new Date(
      inicioHoje.getTime() - JANELA_DIAS * 24 * 60 * 60 * 1000,
    );

    // Faltas ainda pendentes de ontem ou antes (dentro da janela).
    const faltas = await this.prisma.ausencia.findMany({
      where: {
        statusJustificativa: 'PENDENTE',
        data: { gte: limiteInicio, lt: inicioHoje },
      },
      select: { id: true, pessoaId: true, data: true },
    });
    if (faltas.length === 0) return 0;

    // Já existe solicitação (qualquer status) para essas faltas? Não duplicar.
    const jaExistem = await this.prisma.solicitacaoAdvertencia.findMany({
      where: { ausenciaId: { in: faltas.map((f) => f.id) } },
      select: { ausenciaId: true },
    });
    const jaSet = new Set(jaExistem.map((s) => s.ausenciaId));

    // Só faltas de colaboradores existentes (evita solicitações órfãs).
    const pessoaIds = [...new Set(faltas.map((f) => f.pessoaId))];
    const colaboradores = await this.prisma.colaborador.findMany({
      where: { id: { in: pessoaIds } },
      select: { id: true, nome: true },
    });
    const nomePorId = new Map(colaboradores.map((c) => [c.id, c.nome]));

    let criadas = 0;
    const linhas: string[] = [];
    for (const f of faltas) {
      if (jaSet.has(f.id)) continue;
      const nome = nomePorId.get(f.pessoaId);
      if (!nome) continue; // falta de alguém que não é colaborador atual
      try {
        await this.prisma.solicitacaoAdvertencia.create({
          data: {
            colaboradorId: f.pessoaId,
            ausenciaId: f.id,
            dataFalta: inicioDoDia(f.data),
            motivo: MOTIVO_DESIDIA,
          },
        });
        criadas += 1;
        linhas.push(
          `• ${nome} (falta em ${f.data.toISOString().slice(0, 10)})`,
        );
      } catch {
        // corrida com o unique de ausenciaId: já existe, ignora.
      }
    }

    if (criadas > 0) {
      const gestores = await this.notificacoes.gestores();
      if (gestores.length > 0) {
        await this.notificacoes.enviar(gestores, {
          titulo: '⚠️ Solicitação de advertência (falta não justificada)',
          mensagem: `Há ${criadas} falta(s) sem justificar que geraram solicitação de advertência por desídia:\n${linhas.join(
            '\n',
          )}\n\nVeja em Sanções: aprove para lançar a advertência ou cancele se a falta já foi justificada.`,
        });
      }
    }
    return criadas;
  }

  /**
   * Lista as solicitações PENDENTES para o gerente decidir. Faz a limpeza
   * "inteligente": se a falta associada foi justificada (ou removida) desde a
   * criação, cancela a solicitação automaticamente e a omite da lista — cobre o
   * caso do funcionário que justificou e o gerente esqueceu de marcar.
   */
  async listarPendentes(): Promise<SolicitacaoAdvertenciaResumo[]> {
    const pendentes = await this.prisma.solicitacaoAdvertencia.findMany({
      where: { status: 'PENDENTE' },
      orderBy: { dataFalta: 'asc' },
    });
    if (pendentes.length === 0) return [];

    const ausencias = await this.prisma.ausencia.findMany({
      where: { id: { in: pendentes.map((p) => p.ausenciaId) } },
      select: { id: true, statusJustificativa: true },
    });
    const statusPorAusencia = new Map(
      ausencias.map((a) => [a.id, a.statusJustificativa]),
    );

    const validas: SolicitacaoAdvertencia[] = [];
    for (const p of pendentes) {
      const status = statusPorAusencia.get(p.ausenciaId);
      if (status === undefined || status !== 'PENDENTE') {
        // Falta removida ou já justificada → cancela automaticamente.
        await this.prisma.solicitacaoAdvertencia.update({
          where: { id: p.id },
          data: {
            status: 'CANCELADA',
            motivoDecisao:
              status === undefined ? 'Falta removida' : 'Falta justificada',
            decididaEm: new Date(),
          },
        });
        continue;
      }
      validas.push(p);
    }
    if (validas.length === 0) return [];

    const colaboradores = await this.prisma.colaborador.findMany({
      where: { id: { in: [...new Set(validas.map((p) => p.colaboradorId))] } },
      select: { id: true, nome: true },
    });
    const nomePorId = new Map(colaboradores.map((c) => [c.id, c.nome]));
    return validas.map((p) =>
      this.mapResumo(p, nomePorId.get(p.colaboradorId) ?? p.colaboradorId),
    );
  }

  /** Quantidade de solicitações pendentes (para o badge). */
  async contarPendentes(): Promise<number> {
    return this.prisma.solicitacaoAdvertencia.count({
      where: { status: 'PENDENTE' },
    });
  }

  /**
   * Aprova a solicitação: cria a advertência em Sanções (IncidenciaEscala tipo
   * ADVERTENCIA, motivo desídia, vinculada à falta) e marca a solicitação como
   * APROVADA. Se a falta já tiver sido justificada, cancela a solicitação e
   * recusa a aprovação (o gerente é avisado).
   */
  async aprovar(
    id: string,
    autor: AutorIncidencia,
  ): Promise<SolicitacaoAdvertenciaResumo> {
    const s = await this.prisma.solicitacaoAdvertencia.findUnique({
      where: { id },
    });
    if (!s) throw new NotFoundException('Solicitação não encontrada.');
    if (s.status !== 'PENDENTE') {
      throw new BadRequestException('A solicitação já foi decidida.');
    }

    // Re-checa a falta: não lançar advertência se já foi justificada/removida.
    const ausencia = await this.prisma.ausencia.findUnique({
      where: { id: s.ausenciaId },
      select: { statusJustificativa: true },
    });
    if (!ausencia || ausencia.statusJustificativa !== 'PENDENTE') {
      await this.prisma.solicitacaoAdvertencia.update({
        where: { id },
        data: {
          status: 'CANCELADA',
          motivoDecisao: !ausencia ? 'Falta removida' : 'Falta justificada',
          decididaPorId: autor.id,
          decididaPorNome: autor.nome,
          decididaEm: new Date(),
        },
      });
      throw new BadRequestException(
        'A falta já foi justificada/removida; a solicitação foi cancelada.',
      );
    }

    const dataFaltaISO = s.dataFalta.toISOString().slice(0, 10);
    let incidenciaId: string;
    try {
      const inc = await this.incidencias.registrar(
        {
          colaboradorId: s.colaboradorId,
          tipo: 'ADVERTENCIA',
          data: dataFaltaISO,
          motivo: s.motivo,
          causaTipo: 'FALTA',
          causaData: dataFaltaISO,
        },
        autor,
      );
      incidenciaId = inc.id;
    } catch (e) {
      if (e instanceof IncidenciaDuplicadaError) {
        throw new BadRequestException(
          'Já existe uma advertência para esse colaborador nessa data.',
        );
      }
      throw e;
    }

    const atualizada = await this.prisma.solicitacaoAdvertencia.update({
      where: { id },
      data: {
        status: 'APROVADA',
        incidenciaId,
        decididaPorId: autor.id,
        decididaPorNome: autor.nome,
        decididaEm: new Date(),
      },
    });
    const nome = await this.nomeColaborador(atualizada.colaboradorId);
    return this.mapResumo(atualizada, nome);
  }

  /** Cancela a solicitação (ex.: falta já justificada) — não lança advertência. */
  async cancelar(
    id: string,
    motivo: string | undefined,
    autor: AutorIncidencia,
  ): Promise<SolicitacaoAdvertenciaResumo> {
    const s = await this.prisma.solicitacaoAdvertencia.findUnique({
      where: { id },
    });
    if (!s) throw new NotFoundException('Solicitação não encontrada.');
    if (s.status !== 'PENDENTE') {
      throw new BadRequestException('A solicitação já foi decidida.');
    }
    const atualizada = await this.prisma.solicitacaoAdvertencia.update({
      where: { id },
      data: {
        status: 'CANCELADA',
        motivoDecisao: motivo?.trim() || 'Cancelada pelo gestor',
        decididaPorId: autor.id,
        decididaPorNome: autor.nome,
        decididaEm: new Date(),
      },
    });
    const nome = await this.nomeColaborador(atualizada.colaboradorId);
    return this.mapResumo(atualizada, nome);
  }

  private async nomeColaborador(colaboradorId: string): Promise<string> {
    const c = await this.prisma.colaborador.findUnique({
      where: { id: colaboradorId },
      select: { nome: true },
    });
    return c?.nome ?? colaboradorId;
  }
}
