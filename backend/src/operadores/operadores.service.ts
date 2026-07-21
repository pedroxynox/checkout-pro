import { Injectable, Optional } from '@nestjs/common';
import { Ausencia, Prisma } from '@prisma/client';
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
  classificarTurnoOperador,
  contagemPorTurno,
  relatorioAusencias,
} from './operadores.domain';
import { marcarPeriodoJustificado } from './marcar-periodo-justificado';
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
  /** true quando a falta faz parte de um ATESTADO (entidade `Atestado`). */
  atestado: boolean;
  /** CID informado no atestado (quando houver); senão null. */
  cid: string | null;
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
    opcoes: { automatica?: boolean } = {},
  ): Promise<Ausencia> {
    // A falta é por DIA: normaliza para 00:00 UTC. Assim a unicidade
    // `@@unique([pessoaId, data])` vale no nível de dia e a checagem/backstop
    // de duplicidade é exata.
    const dia = inicioDoDia(data);
    // Rejeita datas anteriores à Data_Inicial_Sistema (Req 6.1–6.3).
    await this.validacaoData?.exigirDataPermitida(dia);
    // Bloqueia lançar falta num ciclo de folha já fechado.
    await this.cicloFolha?.exigirCicloAberto(dia);
    // Duplicidade por (pessoa, dia): consulta PONTUAL pela chave única (antes
    // varria TODAS as ausências da pessoa e filtrava em memória — O(histórico)
    // e sujeito a corrida). Roda a cada 5 min no cron de falta automática.
    const jaExiste = await this.prisma.ausencia.findUnique({
      where: { pessoaId_data: { pessoaId, data: dia } },
      select: { id: true },
    });
    if (jaExiste) throw new AusenciaDuplicadaError();
    let ausencia: Ausencia;
    try {
      ausencia = await this.prisma.ausencia.create({
        // Registra quem marcou a falta (auditoria); nasce PENDENTE de análise.
        // `automatica` distingue a falta lançada pela detecção do Relógio Ponto
        // (removível ao bater ponto) da lançada manualmente pelo gestor.
        // `colaboradorId`: para operador o `pessoaId` já é o id da ficha canônica
        // (Colaborador), então gravamos o vínculo direto (Fase 4 — leitura por ficha).
        data: {
          pessoaId,
          colaboradorId: pessoaId,
          data: dia,
          registradaPorId: autor.id ?? null,
          registradaPorNome: autor.nome ?? null,
          automatica: opcoes.automatica ?? false,
        },
      });
    } catch (erro) {
      // Corrida: outra escrita criou a falta do mesmo dia entre o findUnique e
      // o create. A restrição @@unique([pessoaId, data]) garante a idempotência
      // — tratamos a violação (P2002) como duplicidade (mesmo idiom de `ponto`
      // e `incidencias`).
      if (
        erro instanceof Prisma.PrismaClientKnownRequestError &&
        erro.code === 'P2002'
      ) {
        throw new AusenciaDuplicadaError();
      }
      throw erro;
    }
    // Aviso imediato a TODOS: alguém foi marcado como ausente (Req: alerta de
    // falta para todos). Defensivo: nunca bloqueia o registro da falta.
    await this.avisarAusenciaRegistrada(pessoaId, dia);
    // Aviso inteligente: se o operador cruzou o limite de faltas no mês, avisa
    // os gestores (uma única vez, ao atingir o limite). Defensivo: nunca
    // bloqueia o registro da falta.
    await this.verificarLimiteFaltasMes(pessoaId, dia);
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
      // Vínculo com a ficha canônica (Fase 4 · Opção A): a ausência a prazo é
      // sempre lançada escolhendo um Colaborador, então o `pessoaId` já é a
      // ficha. Gravar `colaboradorId` mantém a paridade com `registrarAusencia`
      // e é o que permite que a busca por ficha encontre estes dias — ex.: a
      // detecção automática de falta de um FISCAL conhece o Colaborador.id e
      // NÃO deve remarcar uma falta automática duplicada por cima da a prazo.
      colaboradorId: pessoaId,
    };

    // Grava os dias do período de forma ATÔMICA (tudo-ou-nada): se algo falhar
    // no meio (ex.: erro de banco), nenhum dia fica gravado pela metade — a
    // ausência a prazo é um único ato do supervisor. Conta TODOS os dias
    // corridos do intervalo (inclusive folga): a folga também faz parte. O laço
    // dia-a-dia é a primitiva compartilhada com o atestado (`marcarPeriodoJustificado`).
    const { criadas, atualizadas } = await this.prisma.$transaction((tx) =>
      marcarPeriodoJustificado(tx, {
        pessoaId,
        inicio: d0,
        fim: d1,
        autor,
        dados: justificativa,
        idPorDia,
      }),
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
   * Anula uma AUSÊNCIA A PRAZO inteira (o período do gestor), removendo de uma
   * só vez todos os dias marcados como `aPrazo` da pessoa dentro do intervalo
   * [inicio, fim]. É a operação inversa de `registrarAusenciaPeriodo` — o botão
   * "desmarcar" da ausência a prazo — e por isso é restrita à gestão (a
   * autorização de perfil é feita no controller, como no registro do período).
   *
   * Só remove os dias `aPrazo` (as faltas comuns/automáticas do intervalo NÃO
   * são tocadas) e casa AS DUAS chaves possíveis (`pessoaId` e `colaboradorId`),
   * cobrindo tanto os registros novos (já com vínculo à ficha) quanto os legados
   * (keyed só por `Colaborador.id`). Envia um único aviso a todos. Retorna
   * quantos dias foram desmarcados.
   */
  async removerAusenciaPeriodo(
    pessoaId: string,
    inicio: Date,
    fim: Date,
  ): Promise<{ removidas: number }> {
    const d0 = inicioDoDia(inicio);
    const d1 = inicioDoDia(fim);
    if (d1.getTime() < d0.getTime()) {
      throw new PeriodoAusenciaInvalidoError(
        'A data final deve ser igual ou posterior à inicial.',
      );
    }
    // Bloqueia mexer em faltas de um ciclo de folha já fechado (âncora no início).
    await this.cicloFolha?.exigirCicloAberto(d0);

    const colaborador = await this.prisma.colaborador.findUnique({
      where: { id: pessoaId },
      select: { nome: true },
    });

    const { count } = await this.prisma.ausencia.deleteMany({
      where: {
        aPrazo: true,
        // NÃO remove dias que pertencem a um ATESTADO (`atestadoId != null`):
        // senão o documento `Atestado` ficaria órfão (seus dias sumiriam da
        // escala/faltas, mas o registro e a contagem por CID do INSS
        // permaneceriam). Para desfazer um atestado, cancele o próprio atestado
        // (que remove os dias vinculados de forma consistente).
        atestadoId: null,
        data: { gte: d0, lte: d1 },
        OR: [{ pessoaId }, { colaboradorId: pessoaId }],
      },
    });

    if (count > 0) {
      await this.avisarAusenciaPeriodoAnulada(
        colaborador?.nome ?? null,
        d0,
        d1,
        count,
      );
    }
    return { removidas: count };
  }

  /** Aviso único (a todos) da anulação de uma ausência a prazo. Best-effort. */
  private async avisarAusenciaPeriodoAnulada(
    nome: string | null,
    inicio: Date,
    fim: Date,
    dias: number,
  ): Promise<void> {
    if (!this.notificacoes || dias <= 0 || !nome) return;
    try {
      await this.notificacoes.notificarTodos({
        titulo: '🟢 Ausência a prazo cancelada',
        mensagem: `A ausência de ${nome} (${formatarDiaMes(inicio)} a ${formatarDiaMes(fim)}) foi cancelada — ${dias} dia(s) desmarcado(s).`,
      });
    } catch {
      // best-effort: o aviso nunca deve impedir a anulação.
    }
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
    // Nome/ficha: preferimos a FICHA CANÔNICA (Colaborador). Para operador o
    // `pessoaId` já é a ficha; para fiscal usamos o vínculo `colaboradorId`
    // gravado na falta (Fase 4 · Opção A · A.3). O modelo legado `Fiscal` fica
    // só como fallback, para faltas antigas ainda sem vínculo.
    const idsColaborador = new Set<string>();
    for (const a of ausencias) {
      idsColaborador.add(a.pessoaId);
      if (a.colaboradorId) idsColaborador.add(a.colaboradorId);
    }
    const colaboradores = await this.prisma.colaborador.findMany({
      where: { id: { in: [...idsColaborador] } },
      select: { id: true, nome: true, matricula: true },
    });
    const colPorId = new Map(colaboradores.map((c) => [c.id, c]));
    const fichaDe = (a: { pessoaId: string; colaboradorId: string | null }) =>
      (a.colaboradorId ? colPorId.get(a.colaboradorId) : undefined) ??
      colPorId.get(a.pessoaId);
    // Fallback legado: apenas as faltas que AINDA não têm ficha canônica.
    const semFicha = [
      ...new Set(ausencias.filter((a) => !fichaDe(a)).map((a) => a.pessoaId)),
    ];
    const fiscais = semFicha.length
      ? await this.prisma.fiscal.findMany({
          where: { id: { in: semFicha } },
          select: { id: true, nome: true },
        })
      : [];
    const fiscalPorId = new Map(fiscais.map((f) => [f.id, f]));
    const linhas: AusenciaDetalhada[] = ausencias.map((a) => ({
      id: a.id,
      pessoaId: a.pessoaId,
      nome: fichaDe(a)?.nome ?? fiscalPorId.get(a.pessoaId)?.nome ?? a.pessoaId,
      matricula: fichaDe(a)?.matricula ?? null,
      data: a.data.toISOString().slice(0, 10),
      registradaPorNome: a.registradaPorNome,
      statusJustificativa: a.statusJustificativa as StatusJustificativa,
      motivoJustificativa: a.motivoJustificativa as MotivoJustificativa | null,
      observacaoJustificativa: a.observacaoJustificativa,
      justificadaPorNome: a.justificadaPorNome,
      justificadaEm: a.justificadaEm ? a.justificadaEm.toISOString() : null,
      atestado: a.atestadoId != null,
      cid: a.cid,
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
