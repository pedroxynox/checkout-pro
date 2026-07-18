import { Injectable, Optional } from '@nestjs/common';
import { Ausencia } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { ValidacaoDataService } from '../data-inicial/validacao-data.service';
import { CicloFolhaService } from '../ciclo-folha/ciclo-folha.service';
import { inicioDoDia } from '../common/datas';
import {
  AusenciaRegistro,
  ContagemTurno,
  IntervaloDatas,
  ItemRelatorioAusencia,
  OperadorEscalaDia,
  Turno,
  ausenciaDuplicada,
  classificarTurnoOperador,
  contagemPorTurno,
  relatorioAusencias,
} from './operadores.domain';
import {
  MotivoJustificativa,
  StatusJustificativa,
  motivoObrigatorio,
} from '../common/justificativas';
import {
  AusenciaAPrazoProtegidaError,
  AusenciaDuplicadaError,
  AusenciaNaoEncontradaError,
  JustificativaInvalidaError,
  PeriodoAusenciaInvalidoError,
} from './operadores.errors';

/** Autor de uma ação (usuário autenticado). */
export interface AutorAcao {
  id?: string;
  nome?: string;
}

/** Dados para justificar (ou reabrir) uma ocorrência. */
export interface JustificarInput {
  status: StatusJustificativa;
  motivo?: MotivoJustificativa | null;
  observacao?: string | null;
}

/** Ausência enriquecida (nome + justificativa) para o painel de faltas. */
export interface AusenciaDetalhada {
  id: string;
  pessoaId: string;
  nome: string;
  matricula: string | null;
  data: string;
  registradaPorNome: string | null;
  statusJustificativa: StatusJustificativa;
  motivoJustificativa: MotivoJustificativa | null;
  observacaoJustificativa: string | null;
  justificadaPorNome: string | null;
  justificadaEm: string | null;
}

/**
 * Monta os campos de justificativa a gravar a partir do input + autor. Valida
 * que JUSTIFICADA tem motivo (senão `JustificativaInvalidaError`). Ao reabrir
 * (PENDENTE) ou injustificar, o motivo é limpo. Determinística salvo `justificadaEm`.
 */
function dadosJustificativa(
  input: JustificarInput,
  autor: AutorAcao,
): {
  statusJustificativa: StatusJustificativa;
  motivoJustificativa: MotivoJustificativa | null;
  observacaoJustificativa: string | null;
  justificadaPorId: string | null;
  justificadaPorNome: string | null;
  justificadaEm: Date | null;
} {
  if (motivoObrigatorio(input.status) && !input.motivo) {
    throw new JustificativaInvalidaError();
  }
  // PENDENTE = reabrir: limpa toda a justificativa e a auditoria.
  if (input.status === 'PENDENTE') {
    return {
      statusJustificativa: 'PENDENTE',
      motivoJustificativa: null,
      observacaoJustificativa: null,
      justificadaPorId: null,
      justificadaPorNome: null,
      justificadaEm: null,
    };
  }
  return {
    statusJustificativa: input.status,
    // Motivo só se aplica a JUSTIFICADA; INJUSTIFICADA não tem motivo.
    motivoJustificativa:
      input.status === 'JUSTIFICADA' ? (input.motivo ?? null) : null,
    observacaoJustificativa: input.observacao ?? null,
    justificadaPorId: autor.id ?? null,
    justificadaPorNome: autor.nome ?? null,
    justificadaEm: new Date(),
  };
}

/** A partir de quantas faltas no mês os gestores são avisados (RH). */
const LIMITE_FALTAS_MES = 3;

/** Máximo de dias que uma "ausência a prazo" pode cobrir (defensivo). */
const MAX_DIAS_AUSENCIA_PRAZO = 186; // ~6 meses

/** Um dia em milissegundos (passo entre meias-noites UTC — sem DST em Brasília). */
const UM_DIA_MS = 24 * 60 * 60 * 1000;

/** Resultado de registrar uma ausência a prazo (por período). */
export interface ResultadoAusenciaPeriodo {
  /** Faltas justificadas efetivamente marcadas (criadas + atualizadas). */
  dias: number;
  /** Faltas novas criadas no período. */
  criadas: number;
  /** Dias que já tinham falta e foram convertidos em justificada. */
  atualizadas: number;
}

/** Formata uma data (UTC) como "dd/mm" para textos de aviso. */
function formatarDiaMes(data: Date): string {
  const dd = String(data.getUTCDate()).padStart(2, '0');
  const mm = String(data.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

/**
 * Serviço do Modulo_Operadores: cadastro de operadores com unicidade de nome
 * (Req 6.1), registro/remoção de ausências com unicidade por pessoa/dia
 * (Req 6.2), relatório de ausências por período (Req 6.3) e classificação/
 * contagem de operadores por turno (Req 6.6).
 *
 * A lógica de decisão é delegada a funções puras (`operadores.domain`); este
 * serviço cuida apenas dos efeitos colaterais (consultas e escritas via
 * Prisma).
 */
@Injectable()
export class OperadoresService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificacoes?: NotificacoesService,
    @Optional() private readonly validacaoData?: ValidacaoDataService,
    // Fechamento do ciclo: bloqueia mexer em faltas de um ciclo já fechado.
    // Opcional para não quebrar testes unitários de ausências.
    @Optional() private readonly cicloFolha?: CicloFolhaService,
  ) {}

  // O cadastro/edição/listagem de operadores pelo model simples `Operador` foi
  // removido: operadores agora são pessoas do Cadastro Unificado de
  // Colaboradores (funcao OPERADOR). Este serviço cuida apenas de ausências e
  // da classificação/contagem por turno.

  /**
   * Registra uma ausência de um operador ou fiscal para um dia (Req 6.2.1,
   * 6.2.2). Rejeita uma segunda ausência para a mesma pessoa na mesma data,
   * lançando `AusenciaDuplicadaError` (Req 6.2.3).
   */
  async registrarAusencia(
    pessoaId: string,
    data: Date,
    autor: AutorAcao = {},
  ): Promise<Ausencia> {
    // Rejeita datas anteriores à Data_Inicial_Sistema (Req 6.1–6.3).
    await this.validacaoData?.exigirDataPermitida(data);
    // Bloqueia lançar falta num ciclo de folha já fechado.
    await this.cicloFolha?.exigirCicloAberto(data);
    const existentes = await this.prisma.ausencia.findMany({
      where: { pessoaId },
      select: { pessoaId: true, data: true },
    });
    if (ausenciaDuplicada(existentes, pessoaId, data)) {
      throw new AusenciaDuplicadaError();
    }
    const ausencia = await this.prisma.ausencia.create({
      // Registra quem marcou a falta (auditoria); nasce PENDENTE de análise.
      data: {
        pessoaId,
        data,
        registradaPorId: autor.id ?? null,
        registradaPorNome: autor.nome ?? null,
      },
    });
    // Aviso imediato a TODOS: alguém foi marcado como ausente (Req: alerta de
    // falta para todos). Defensivo: nunca bloqueia o registro da falta.
    await this.avisarAusenciaRegistrada(pessoaId, data);
    // Aviso inteligente: se o operador cruzou o limite de faltas no mês, avisa
    // os gestores (uma única vez, ao atingir o limite). Defensivo: nunca
    // bloqueia o registro da falta.
    await this.verificarLimiteFaltasMes(pessoaId, data);
    return ausencia;
  }

  /**
   * Avisa TODOS os perfis operacionais assim que uma falta é registrada
   * ("Hoje está ausente Fulano."). Para faltas programadas (data futura), o
   * texto informa a data. Best-effort: qualquer falha é engolida.
   */
  private async avisarAusenciaRegistrada(
    pessoaId: string,
    data: Date,
  ): Promise<void> {
    if (!this.notificacoes) return;
    try {
      const p = await this.prisma.colaborador.findUnique({
        where: { id: pessoaId },
        select: { nome: true },
      });
      if (!p) return; // não é um colaborador (registro antigo) — sem nome, sem aviso
      const ehHoje =
        inicioDoDia(data).getTime() === inicioDoDia(new Date()).getTime();
      const mensagem = ehHoje
        ? `Hoje está ausente ${p.nome}.`
        : `Falta registrada para ${p.nome} em ${formatarDiaMes(data)}.`;
      await this.notificacoes.notificarTodos({
        titulo: '🔴 Falta registrada',
        mensagem,
      });
    } catch {
      // best-effort: o aviso nunca deve impedir o registro da falta.
    }
  }

  /**
   * Avisa os gestores quando um operador atinge `LIMITE_FALTAS_MES` faltas no
   * mês da data informada. Dispara só ao cruzar o limite (contagem === limite)
   * para não repetir. Só vale para operadores do quadro (OperadorTurno).
   */
  private async verificarLimiteFaltasMes(
    pessoaId: string,
    data: Date,
  ): Promise<void> {
    if (!this.notificacoes) return;
    try {
      const op = await this.prisma.colaborador.findUnique({
        where: { id: pessoaId },
        select: { nome: true },
      });
      if (!op) return; // não é um colaborador (ex.: fiscal/registro antigo)
      const ini = new Date(
        Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), 1),
      );
      const fim = new Date(
        Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + 1, 1),
      );
      const qtd = await this.prisma.ausencia.count({
        where: { pessoaId, data: { gte: ini, lt: fim } },
      });
      if (qtd !== LIMITE_FALTAS_MES) return;
      const gestores = await this.notificacoes.destinatariosComPermissao(
        'OPERADORES_AUSENCIAS',
      );
      if (gestores.length === 0) return;
      await this.notificacoes.enviar(gestores, {
        titulo: '🔴 Operador com muitas faltas',
        mensagem: `${op.nome} já tem ${qtd} faltas neste mês. Vale uma conversa de acompanhamento.`,
      });
    } catch {
      // defensivo: o aviso nunca deve impedir o registro da falta.
    }
  }

  /**
   * Ausência a prazo (por período): marca o colaborador como **falta
   * justificada** em CADA dia corrido do intervalo [inicio, fim], inclusive —
   * os dias de folga TAMBÉM contam (uma ausência de 6 dias a partir do dia 14
   * cobre 14–19, com ou sem folga no meio). Dias que já tinham falta são
   * convertidos em justificada (não duplica). Envia um único aviso (não um por
   * dia). O motivo é obrigatório (é uma falta JUSTIFICADA).
   */
  async registrarAusenciaPeriodo(
    pessoaId: string,
    inicio: Date,
    fim: Date,
    input: { motivo: MotivoJustificativa; observacao?: string | null },
    autor: AutorAcao = {},
  ): Promise<ResultadoAusenciaPeriodo> {
    if (!input.motivo) throw new JustificativaInvalidaError();
    const d0 = inicioDoDia(inicio);
    const d1 = inicioDoDia(fim);
    if (d1.getTime() < d0.getTime()) {
      throw new PeriodoAusenciaInvalidoError(
        'A data final deve ser igual ou posterior à inicial.',
      );
    }
    const totalDias = Math.round((d1.getTime() - d0.getTime()) / UM_DIA_MS) + 1;
    if (totalDias > MAX_DIAS_AUSENCIA_PRAZO) {
      throw new PeriodoAusenciaInvalidoError(
        `O período é muito longo (máx. ${MAX_DIAS_AUSENCIA_PRAZO} dias).`,
      );
    }
    // Rejeita datas anteriores à Data_Inicial_Sistema (valida a mais antiga).
    await this.validacaoData?.exigirDataPermitida(d0);
    // Bloqueia lançar faltas num ciclo de folha já fechado (âncora no início).
    await this.cicloFolha?.exigirCicloAberto(d0);

    const colaborador = await this.prisma.colaborador.findUnique({
      where: { id: pessoaId },
      select: { nome: true },
    });

    // Faltas já existentes no período (para justificar em vez de duplicar).
    const existentes = await this.prisma.ausencia.findMany({
      where: { pessoaId, data: { gte: d0, lte: d1 } },
      select: { id: true, data: true },
    });
    const idPorDia = new Map<number, string>();
    for (const a of existentes) {
      idPorDia.set(inicioDoDia(a.data).getTime(), a.id);
    }

    const justificativa = {
      statusJustificativa: 'JUSTIFICADA' as StatusJustificativa,
      motivoJustificativa: input.motivo,
      observacaoJustificativa: input.observacao ?? null,
      justificadaPorId: autor.id ?? null,
      justificadaPorNome: autor.nome ?? null,
      justificadaEm: new Date(),
      // Marca o dia como parte da ausência a prazo: um fiscal não pode
      // desmarcá-lo na escala (só gerente/supervisor/administrador).
      aPrazo: true,
    };

    // Grava os dias do período de forma ATÔMICA (tudo-ou-nada): se algo falhar
    // no meio (ex.: erro de banco), nenhum dia fica gravado pela metade — a
    // ausência a prazo é um único ato do supervisor. Conta TODOS os dias
    // corridos do intervalo (inclusive folga): a folga também faz parte.
    const { criadas, atualizadas } = await this.prisma.$transaction(
      async (tx) => {
        let criadas = 0;
        let atualizadas = 0;
        for (let t = d0.getTime(); t <= d1.getTime(); t += UM_DIA_MS) {
          const dia = new Date(t);
          const existId = idPorDia.get(t);
          if (existId) {
            await tx.ausencia.update({
              where: { id: existId },
              data: justificativa,
            });
            atualizadas += 1;
          } else {
            await tx.ausencia.create({
              data: {
                pessoaId,
                data: dia,
                registradaPorId: autor.id ?? null,
                registradaPorNome: autor.nome ?? null,
                ...justificativa,
              },
            });
            criadas += 1;
          }
        }
        return { criadas, atualizadas };
      },
    );

    const dias = criadas + atualizadas;
    // Um único aviso a todos (evita spamar um por dia).
    await this.avisarAusenciaPeriodo(colaborador?.nome ?? null, d0, d1, dias);

    return { dias, criadas, atualizadas };
  }

  /** Aviso único (a todos) de uma ausência a prazo. Best-effort. */
  private async avisarAusenciaPeriodo(
    nome: string | null,
    inicio: Date,
    fim: Date,
    dias: number,
  ): Promise<void> {
    if (!this.notificacoes || dias <= 0 || !nome) return;
    try {
      await this.notificacoes.notificarTodos({
        titulo: '🔴 Ausência a prazo',
        mensagem: `${nome} ausente (justificado) de ${formatarDiaMes(inicio)} a ${formatarDiaMes(fim)} — ${dias} dia(s).`,
      });
    } catch {
      // best-effort: o aviso nunca deve impedir o registro.
    }
  }

  /**
   * Remove uma ausência registrada (Req 6.2.4). Um FISCAL NÃO pode remover uma
   * falta que faz parte de uma ausência a prazo (período do gestor) — só
   * gerente/supervisor/administrador.
   */
  async removerAusencia(ausenciaId: string, perfil?: string): Promise<void> {
    const a = await this.prisma.ausencia.findUnique({
      where: { id: ausenciaId },
      select: { data: true, aPrazo: true },
    });
    if (a) {
      // Ausência a prazo: fiscal não desmarca (é decisão do gestor).
      if (a.aPrazo && perfil === 'FISCAL') {
        throw new AusenciaAPrazoProtegidaError();
      }
      // Bloqueia remover uma falta de um ciclo de folha já fechado.
      if (this.cicloFolha) await this.cicloFolha.exigirCicloAberto(a.data);
    }
    await this.prisma.ausencia.delete({ where: { id: ausenciaId } });
  }

  /**
   * Justifica (abona), reabre (PENDENTE) ou marca como INJUSTIFICADA uma falta,
   * DEPOIS de ela ter sido registrada. Grava quem justificou e quando
   * (auditoria — antes só o gestor "sabia de cabeça" quem tinha justificado).
   * JUSTIFICADA exige motivo; ao reabrir/injustificar, o motivo é limpo.
   * 404 se a ausência não existir.
   */
  async justificarAusencia(
    ausenciaId: string,
    input: JustificarInput,
    autor: AutorAcao = {},
  ): Promise<Ausencia> {
    const existente = await this.prisma.ausencia.findUnique({
      where: { id: ausenciaId },
    });
    if (!existente) throw new AusenciaNaoEncontradaError();
    // Bloqueia justificar/reabrir uma falta de um ciclo de folha já fechado.
    await this.cicloFolha?.exigirCicloAberto(existente.data);
    return this.prisma.ausencia.update({
      where: { id: ausenciaId },
      data: dadosJustificativa(input, autor),
    });
  }

  /**
   * Lista as ausências de um período com o nome do colaborador e os dados da
   * justificativa (estado, motivo, quem justificou). Alimenta o painel
   * "Justificativas de faltas" — visível a toda a equipe, resolvendo a falta de
   * transparência de "só eu sei quem justificou". Mais recentes primeiro;
   * pendentes no topo.
   */
  async listarAusencias(
    periodo: IntervaloDatas,
    apenasPendentes = false,
  ): Promise<AusenciaDetalhada[]> {
    const ausencias = await this.prisma.ausencia.findMany({
      where: {
        data: { gte: periodo.inicio, lte: periodo.fim },
        ...(apenasPendentes ? { statusJustificativa: 'PENDENTE' } : {}),
      },
      orderBy: { data: 'desc' },
    });
    const ids = [...new Set(ausencias.map((a) => a.pessoaId))];
    const colaboradores = await this.prisma.colaborador.findMany({
      where: { id: { in: ids } },
      select: { id: true, nome: true, matricula: true },
    });
    const nome = new Map(colaboradores.map((c) => [c.id, c]));
    const linhas: AusenciaDetalhada[] = ausencias.map((a) => ({
      id: a.id,
      pessoaId: a.pessoaId,
      nome: nome.get(a.pessoaId)?.nome ?? a.pessoaId,
      matricula: nome.get(a.pessoaId)?.matricula ?? null,
      data: a.data.toISOString().slice(0, 10),
      registradaPorNome: a.registradaPorNome,
      statusJustificativa: a.statusJustificativa as StatusJustificativa,
      motivoJustificativa: a.motivoJustificativa as MotivoJustificativa | null,
      observacaoJustificativa: a.observacaoJustificativa,
      justificadaPorNome: a.justificadaPorNome,
      justificadaEm: a.justificadaEm ? a.justificadaEm.toISOString() : null,
    }));
    // Pendentes no topo; dentro de cada grupo, mais recentes primeiro (já ordenado).
    const ordem: Record<StatusJustificativa, number> = {
      PENDENTE: 0,
      INJUSTIFICADA: 1,
      JUSTIFICADA: 2,
    };
    return linhas.sort(
      (a, b) => ordem[a.statusJustificativa] - ordem[b.statusJustificativa],
    );
  }

  /**
   * Gera o relatório de ausências por pessoa dentro de um período, filtrado e
   * ordenado de forma decrescente pela quantidade (Req 6.3.1–6.3.3). A
   * filtragem/contagem/ordenação é delegada à função pura `relatorioAusencias`.
   */
  async relatorioAusencias(
    periodo: IntervaloDatas,
  ): Promise<ItemRelatorioAusencia[]> {
    const ausencias = await this.prisma.ausencia.findMany({
      where: { data: { gte: periodo.inicio, lte: periodo.fim } },
      select: { pessoaId: true, data: true },
    });
    const registros: AusenciaRegistro[] = ausencias.map((a) => ({
      pessoaId: a.pessoaId,
      data: a.data,
    }));
    return relatorioAusencias(registros, periodo);
  }

  /**
   * Classifica o turno de um operador a partir do horário de entrada da escala
   * (Req 6.6.1–6.6.4). Delega à função pura `classificarTurnoOperador`.
   */
  classificarTurnoOperador(entrada: string): Turno {
    return classificarTurnoOperador(entrada);
  }

  /**
   * Conta os operadores por turno em um dia/escala, considerando apenas os que
   * estão trabalhando (Req 6.6.5–6.6.7). Delega à função pura
   * `contagemPorTurno`.
   */
  contagemPorTurno(operadores: readonly OperadorEscalaDia[]): ContagemTurno {
    return contagemPorTurno(operadores);
  }
}
