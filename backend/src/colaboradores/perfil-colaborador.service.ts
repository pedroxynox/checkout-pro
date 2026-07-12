import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FiscaisService } from '../fiscais/fiscais.service';
import { StatusFiscal } from '../fiscais/fiscais.domain';
import {
  fimDoMes,
  inicioDoDia,
  inicioDoMes,
  inicioDoProximoDia,
} from '../common/datas';
import { arredondar } from '../common/numeros';
import { CONFIG_ARRECADACAO } from '../arrecadacao/arrecadacao.domain';
import { analisarFaltas } from '../operadores/operadores.domain';
import { IncidenciasService } from '../incidencias/incidencias.service';
import {
  TIPOS_INCIDENCIA,
  rotuloTipoIncidencia,
} from '../incidencias/incidencias.domain';
import {
  ContratosService,
  ResumoContratoColaborador,
} from '../contratos/contratos.service';
import { MetasService } from '../metas/metas.service';
import { anoMesDe } from '../metas/metas.domain';
import { ColaboradorNaoEncontradoError } from './colaboradores.errors';
import {
  calcularScore,
  contarDiasEscalados,
  gerarInsignias,
  gerarResumo,
  metaIndividualDerivada,
  rankingPorValor,
  resolverColaboradorId,
  rotuloMes,
  type FormatoIndicador,
  type IndicadorPerfil,
  type Insignia,
  type PontoSerie,
  type ScoreSaude,
  type SentidoIndicador,
} from './perfil-colaborador.domain';

/** Indicadores "maior é melhor" cuja meta global mensal alimenta o score. */
type TipoMetaGlobal = 'TROCO_SOLIDARIO' | 'RECARGAS_CELULAR';

/** Tipos de arrecadação lidos dos arquivos .txt (mesmos do indicador). */
const TIPOS_ARRECADACAO = [
  'TROCO_SOLIDARIO',
  'RECARGAS_CELULAR',
  'CANCELAMENTO_ITENS',
  'CANCELAMENTO_CUPOM',
  'DEVOLUCOES',
] as const;

/** Agregado de valor + quantidade por colaborador. */
interface Agg {
  valor: number;
  qtd: number;
}

/** Registro mínimo de arrecadação lido do banco. */
interface RegistroBruto {
  tipo: string;
  matricula: string | null;
  nome: string;
  valor: unknown;
  quantidade: number | null;
  autorizadoPor: string | null;
  motivo: string | null;
  data: Date;
}

/** Resposta completa do perfil inteligente. */
export interface PerfilColaboradorResposta {
  colaborador: {
    id: string;
    nome: string;
    matricula: string;
    login: string | null;
    funcao: string;
    genero: string | null;
    ativo: boolean;
    turno: string | null;
    entradaSemana: string | null;
    saidaSemana: string | null;
    entradaFds: string | null;
    saidaFds: string | null;
    folgaDiaSemana: number | null;
  };
  /**
   * Vínculo com a conta de acesso do app (quando o colaborador tem `usuarioId`).
   * Traz o login, o status online/offline e a jornada de hoje do fiscal —
   * unindo a ficha do colaborador à seção de Fiscais.
   */
  vinculoApp: {
    usuarioId: string;
    login: string | null;
    /** Há um registro de Fiscal para essa conta (status/jornada disponíveis). */
    ehFiscal: boolean;
    online: boolean;
    status: StatusFiscal | null;
    /** Instante (ISO) do último ponto; null se ainda não bateu hoje. */
    desde: string | null;
    jornada: {
      tempoTrabalhandoMs: number;
      tempoIntervaloMs: number;
      cargaHorariaMs: number;
    } | null;
  } | null;
  periodo: { inicio: string; fim: string };
  score: ScoreSaude;
  resumo: string[];
  indicadores: IndicadorPerfil[];
  faltas: {
    total: number;
    taxa: number;
    /** Absenteísmo EFETIVO (justificadas pesam menos): alimenta o score. */
    taxaPonderada: number;
    /** Quantas faltas do período estão justificadas (abonadas). */
    justificadas: number;
    risco: string;
    tendencia: number;
    porMes: PontoSerie[];
    porDiaSemana: PontoSerie[];
  };
  motivosCancelamento: PontoSerie[];
  insignias: Insignia[];
  /**
   * Incidências de escala (Fase 1 — "não retornou do intervalo"): resumo
   * analítico do colaborador (últimos ~6 meses) + linha do tempo unificada
   * (incidências + faltas). Alimentado por `IncidenciasService`.
   */
  incidencias: {
    /** Total de incidências de TODOS os tipos no período (~6 meses). */
    total: number;
    /** Desglose por tipo (rótulo + total), só os tipos com ocorrências. */
    porTipo: { tipo: string; rotulo: string; total: number }[];
    /** Retrocompatível: total só de "não retorno do intervalo". */
    totalNaoRetorno: number;
    ultimoNaoRetorno: string | null;
    diasConsecutivosSemIncidencia: number;
    risco: string;
    tendencia: string;
    porDiaSemana: PontoSerie[];
    frequenciaMensal: number;
    percentualSobreEscalados: number;
    timeline: { data: string; kind: string }[];
  };
  /**
   * Contrato de experiência / **tempo de casa** (dias de casa, admissão, estado
   * e marcos de 45/90). Puramente **informativo**: NÃO afeta o score. Vazio
   * (`temAdmissao=false`) quando o colaborador ainda não tem admissão definida.
   */
  contrato: ResumoContratoColaborador;
}

/** Rótulos curtos dos dias da semana (0=Dom..6=Sáb) para as séries. */
const DIAS_SEMANA_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Chave de mês (ano*12+mês) para agrupar séries temporais. */
function chaveMes(d: Date): number {
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/**
 * Perfil Inteligente do Colaborador. Reúne, de forma **determinística e sem
 * IA** (custo zero), os indicadores do papel (operador/fiscal) com ranking,
 * tendência e comparação à equipe, o controle de faltas com gráficos, o Score
 * de Saúde, o resumo em linguagem natural e as insígnias.
 *
 * Os movimentos são atribuídos por **identificador** (matrícula/login) em
 * tempo de consulta: como o gestor cadastra login+matrícula, casamos o código
 * bruto guardado em cada `RegistroArrecadacao` com os identificadores do
 * colaborador, sem depender de religar o histórico.
 */
@Injectable()
export class PerfilColaboradorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fiscais: FiscaisService,
    private readonly incidenciasService: IncidenciasService,
    private readonly metas: MetasService,
    private readonly contratosService: ContratosService,
  ) {}

  async perfil(
    id: string,
    inicio: Date,
    fim: Date,
  ): Promise<PerfilColaboradorResposta> {
    const colaborador = await this.prisma.colaborador.findUnique({
      where: { id },
      include: { identificadores: true },
    });
    if (!colaborador) throw new ColaboradorNaoEncontradoError();

    // Vínculo com a conta de acesso do app (online/offline + jornada do fiscal).
    const vinculoApp = await this.resolverVinculoApp(colaborador.usuarioId);

    const ehFiscal = colaborador.funcao === 'FISCAL';
    const login =
      colaborador.identificadores.find((i) => i.tipo === 'LOGIN')?.valor ??
      null;

    // Mapas globais (valor normalizado → colaboradorId) para resolver os donos.
    const identificadores = await this.prisma.colaboradorIdentificador.findMany(
      {
        select: { colaboradorId: true, tipo: true, valor: true },
      },
    );
    const mapaMatricula = new Map<string, string>();
    const mapaLogin = new Map<string, string>();
    for (const i of identificadores) {
      if (i.tipo === 'MATRICULA') mapaMatricula.set(i.valor, i.colaboradorId);
      else mapaLogin.set(i.valor, i.colaboradorId);
    }

    // Janelas de tempo: período selecionado, período anterior (mesma duração)
    // e últimos 6 meses (para as séries de evolução).
    const inicioDia = inicioDoDia(inicio);
    const fimExcl = inicioDoProximoDia(fim);
    const duracao = fimExcl.getTime() - inicioDia.getTime();
    const prevFimExcl = inicioDia;
    const prevInicio = new Date(prevFimExcl.getTime() - duracao);
    const base = inicioDoMes(fim);
    const inicio6m = new Date(
      Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - 5, 1),
    );
    const meses = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(
        Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - (5 - i), 1),
      );
      return { chave: chaveMes(d), rotulo: rotuloMes(d.getUTCMonth()) };
    });

    const tipos = [...TIPOS_ARRECADACAO];
    const [regsAtual, regsAnterior, regs6m] = await Promise.all([
      this.buscarRegistros(tipos, inicioDia, fimExcl),
      this.buscarRegistros(tipos, prevInicio, prevFimExcl),
      this.buscarRegistros(tipos, inicio6m, fimExcl),
    ]);

    const teamAtual = this.agregarPorTipo(regsAtual, mapaMatricula, mapaLogin);
    const teamAnterior = this.agregarPorTipo(
      regsAnterior,
      mapaMatricula,
      mapaLogin,
    );

    // Séries de 6 meses do próprio colaborador, por tipo.
    const serie6m = this.serie6mDoColaborador(
      regs6m,
      id,
      mapaMatricula,
      mapaLogin,
    );

    const construirSerie = (tipo: string): PontoSerie[] => {
      const porMes = serie6m.get(tipo) ?? new Map<number, number>();
      return meses.map((m) => ({
        rotulo: m.rotulo,
        valor: arredondar(porMes.get(m.chave) ?? 0),
      }));
    };

    const montarIndicador = (
      chave: string,
      titulo: string,
      formato: FormatoIndicador,
      sentido: SentidoIndicador,
      comQuantidade: boolean,
      teamA: Map<string, Agg>,
      teamP: Map<string, Agg>,
    ): IndicadorPerfil => {
      const meu = teamA.get(id) ?? { valor: 0, qtd: 0 };
      const valores = new Map(
        [...teamA.entries()].map(([k, v]) => [k, v.valor] as const),
      );
      const { posicao, total, media } = rankingPorValor(valores, id);
      const anterior = teamP.get(id)?.valor ?? 0;
      return {
        chave,
        titulo,
        valor: arredondar(meu.valor),
        formato,
        quantidade: comQuantidade ? meu.qtd : null,
        sentido,
        posicao,
        totalParticipantes: total,
        tendencia: arredondar(meu.valor - anterior),
        mediaEquipe: arredondar(media),
        serie: construirSerie(chave),
      };
    };

    const indicadores: IndicadorPerfil[] = [];
    // O fiscal mantém o seu indicador próprio (devoluções que ele autoriza) e
    // passa a ver, ADEMAIS, os mesmos indicadores do operador — pois também
    // opera caixa (troco, recargas e cancelamentos). O operador vê só os seus.
    if (ehFiscal) {
      indicadores.push(
        montarIndicador(
          'DEVOLUCOES',
          CONFIG_ARRECADACAO.DEVOLUCOES.titulo,
          'MOEDA',
          'MENOR_MELHOR',
          false,
          teamAtual.get('DEVOLUCOES') ?? new Map(),
          teamAnterior.get('DEVOLUCOES') ?? new Map(),
        ),
      );
    }
    indicadores.push(
      montarIndicador(
        'TROCO_SOLIDARIO',
        CONFIG_ARRECADACAO.TROCO_SOLIDARIO.titulo,
        'MOEDA',
        'MAIOR_MELHOR',
        false,
        teamAtual.get('TROCO_SOLIDARIO') ?? new Map(),
        teamAnterior.get('TROCO_SOLIDARIO') ?? new Map(),
      ),
      montarIndicador(
        'RECARGAS_CELULAR',
        CONFIG_ARRECADACAO.RECARGAS_CELULAR.titulo,
        'MOEDA',
        'MAIOR_MELHOR',
        false,
        teamAtual.get('RECARGAS_CELULAR') ?? new Map(),
        teamAnterior.get('RECARGAS_CELULAR') ?? new Map(),
      ),
      montarIndicador(
        'CANCELAMENTO_ITENS',
        CONFIG_ARRECADACAO.CANCELAMENTO_ITENS.titulo,
        'MOEDA',
        'MENOR_MELHOR',
        true,
        teamAtual.get('CANCELAMENTO_ITENS') ?? new Map(),
        teamAnterior.get('CANCELAMENTO_ITENS') ?? new Map(),
      ),
      montarIndicador(
        'CANCELAMENTO_CUPOM',
        CONFIG_ARRECADACAO.CANCELAMENTO_CUPOM.titulo,
        'MOEDA',
        'MENOR_MELHOR',
        true,
        teamAtual.get('CANCELAMENTO_CUPOM') ?? new Map(),
        teamAnterior.get('CANCELAMENTO_CUPOM') ?? new Map(),
      ),
    );

    // Faltas inteligentes (reaproveita a analítica de domínio para 1 pessoa).
    const faltas = await this.faltasDoColaborador(
      id,
      colaborador.folgaDiaSemana ?? -1,
      colaborador.nome,
      inicioDia,
      fim,
      prevInicio,
      prevFimExcl,
      inicio6m,
      meses,
    );

    // Motivos dos cancelamentos de cupom do colaborador (pizza) — operador e,
    // agora, também o fiscal (que opera caixa).
    const motivosCancelamento = this.motivosDeCupom(
      regsAtual,
      id,
      mapaMatricula,
      mapaLogin,
    );

    // Score de Saúde.
    const valorIndicador = (chave: string): number =>
      indicadores.find((i) => i.chave === chave)?.valor ?? 0;
    const mediaIndicador = (chave: string): number =>
      indicadores.find((i) => i.chave === chave)?.mediaEquipe ?? 0;

    const score = ehFiscal
      ? // Fiscal: o app não controla "quem autorizou" (externo) e as devoluções
        // são informativas. A saúde foca na assiduidade (efetiva: faltas
        // justificadas pesam menos).
        calcularScore({ taxaFaltas: faltas.taxaPonderada })
      : await this.scoreDoOperador(
          id,
          colaborador.folgaDiaSemana ?? -1,
          faltas.taxaPonderada,
          inicioDia,
          fim,
          fimExcl,
          valorIndicador,
          mediaIndicador,
        );

    const resumo = gerarResumo({
      nome: colaborador.nome,
      funcao: colaborador.funcao,
      score,
      indicadores,
      faltas: { total: faltas.total, taxa: faltas.taxa, risco: faltas.risco },
    });

    const insignias = gerarInsignias({
      score,
      indicadores,
      faltas: { total: faltas.total, risco: faltas.risco },
    });

    // Incidências de escala (resumo analítico + linha do tempo unificada).
    const incidencias = await this.incidenciasDoColaborador(id, fim);

    // Contrato de experiência / tempo de casa (informativo — não afeta o score).
    const contrato = await this.contratosService.resumoDoColaborador(id, fim);

    return {
      colaborador: {
        id: colaborador.id,
        nome: colaborador.nome,
        matricula: colaborador.matricula,
        login,
        funcao: colaborador.funcao,
        genero: colaborador.genero,
        ativo: colaborador.ativo,
        turno: colaborador.turno,
        entradaSemana: colaborador.entradaSemana,
        saidaSemana: colaborador.saidaSemana,
        entradaFds: colaborador.entradaFds,
        saidaFds: colaborador.saidaFds,
        folgaDiaSemana: colaborador.folgaDiaSemana,
      },
      vinculoApp,
      periodo: {
        inicio: inicioDia.toISOString().slice(0, 10),
        fim: fim.toISOString().slice(0, 10),
      },
      score,
      resumo,
      indicadores,
      faltas,
      motivosCancelamento,
      insignias,
      incidencias,
      contrato,
    };
  }

  /**
   * Monta o Score de Saúde de um **operador** a partir dos insumos reais:
   *  - Contribuição: aporte real (troco + recargas) vs. a **meta individual
   *    derivada** do período — cota mensal equitativa (meta global mensal ÷ nº
   *    de operadores ativos) escalada pela fração de dias escalados do período
   *    sobre os dias do mês (`metaIndividualDerivada`, domínio puro).
   *  - Disciplina: cancelamentos (itens + cupom) vs. a média da equipe, com
   *    penalidade pelos não-retornos do intervalo DENTRO do período.
   *
   * Toda a matemática vive no domínio puro; aqui apenas coletamos os insumos.
   */
  private async scoreDoOperador(
    id: string,
    folga: number,
    taxaFaltas: number,
    inicioDia: Date,
    fim: Date,
    fimExcl: Date,
    valorIndicador: (chave: string) => number,
    mediaIndicador: (chave: string) => number,
  ): Promise<ScoreSaude> {
    const anoMes = anoMesDe(fim);

    // Metas globais mensais dos indicadores "maior é melhor".
    const [metaTroco, metaRecargas] = await Promise.all([
      this.resolverMetaGlobal('TROCO_SOLIDARIO', anoMes),
      this.resolverMetaGlobal('RECARGAS_CELULAR', anoMes),
    ]);
    const metaGlobalMensal = metaTroco + metaRecargas;

    // Insumos de justiça: nº de operadores ativos e dias escalados (período/mês).
    const nOperadoresAtivos = await this.prisma.colaborador.count({
      where: { funcao: 'OPERADOR', ativo: true },
    });
    // Escala até "hoje" (não conta dias futuros do período como escalados).
    const agora = new Date();
    const fimEscala = agora.getTime() < fim.getTime() ? agora : fim;
    const diasEscaladosPeriodo = contarDiasEscalados(
      folga,
      inicioDia,
      fimEscala,
    );
    const diasUteisMes = contarDiasEscalados(
      folga,
      inicioDoMes(fim),
      fimDoMes(fim),
    );

    const metaIndividualPeriodo = metaIndividualDerivada({
      metaGlobalMensal,
      nOperadoresAtivos,
      diasEscaladosPeriodo,
      diasUteisMes,
    });

    // Incidências disciplinares (ponderadas) DENTRO do período [inicio, fim):
    // não-retorno, atraso, saída antecipada, retorno tardio e advertência.
    const incidenciasDisciplinares =
      await this.incidenciasService.contarIncidenciasPonderadas(
        id,
        inicioDia,
        fimExcl,
      );

    return calcularScore({
      taxaFaltas,
      contribuicao: {
        aporteReal:
          valorIndicador('TROCO_SOLIDARIO') +
          valorIndicador('RECARGAS_CELULAR'),
        metaIndividualPeriodo,
      },
      disciplina: {
        cancelamentos:
          valorIndicador('CANCELAMENTO_ITENS') +
          valorIndicador('CANCELAMENTO_CUPOM'),
        linhaBaseCancelamentos:
          mediaIndicador('CANCELAMENTO_ITENS') +
          mediaIndicador('CANCELAMENTO_CUPOM'),
        incidenciasDisciplinares,
      },
    });
  }

  /**
   * Resolve a **meta global mensal** de um indicador "maior é melhor":
   *  - `RECARGAS_CELULAR` é gerido por mês em Centro de Controle ▸ Metas →
   *    `MetasService.resolver` (que já tem fallback ao padrão);
   *  - `TROCO_SOLIDARIO` não é gerido por mês → lê a meta global de
   *    `metaIndicador`, com fallback a `CONFIG_ARRECADACAO[tipo].meta`.
   *
   * Envolto em `try/catch` para tolerar a tabela ainda não migrada (fallback à
   * configuração), espelhando `ArrecadacaoService.metaDe`.
   */
  private async resolverMetaGlobal(
    tipo: TipoMetaGlobal,
    anoMes: string,
  ): Promise<number> {
    if (tipo === 'RECARGAS_CELULAR') {
      try {
        return await this.metas.resolver('RECARGAS_CELULAR', anoMes);
      } catch {
        return CONFIG_ARRECADACAO.RECARGAS_CELULAR.meta;
      }
    }
    // TROCO_SOLIDARIO: meta global (não mensal), com fallback ao CONFIG.
    try {
      const registro = await this.prisma.metaIndicador.findUnique({
        where: { tipo },
      });
      if (registro) return Number(registro.meta);
    } catch {
      // Tabela `metas_indicador` ainda não migrada: usa o padrão.
    }
    return CONFIG_ARRECADACAO[tipo].meta;
  }

  /**
   * Seção de incidências de escala do perfil: reaproveita
   * `IncidenciasService.resumoDoColaborador` (analítica + linha do tempo) e
   * adapta ao formato do perfil (séries por dia da semana e timeline em ISO).
   */
  private async incidenciasDoColaborador(
    id: string,
    fim: Date,
  ): Promise<PerfilColaboradorResposta['incidencias']> {
    const { analise, timeline } =
      await this.incidenciasService.resumoDoColaborador(id, fim);
    const porTipo = TIPOS_INCIDENCIA.map((tipo) => ({
      tipo,
      rotulo: rotuloTipoIncidencia(tipo),
      total: analise.porTipo[tipo] ?? 0,
    })).filter((t) => t.total > 0);
    return {
      total: analise.total,
      porTipo,
      totalNaoRetorno: analise.porTipo.NAO_RETORNO_INTERVALO,
      ultimoNaoRetorno: analise.ultimaPorTipo.NAO_RETORNO_INTERVALO,
      diasConsecutivosSemIncidencia: analise.diasConsecutivosSemIncidencia,
      risco: analise.risco,
      tendencia: analise.tendencia,
      porDiaSemana: analise.porDiaSemana.map((valor, dia) => ({
        rotulo: DIAS_SEMANA_CURTO[dia],
        valor,
      })),
      frequenciaMensal: analise.frequenciaMensal,
      percentualSobreEscalados: analise.percentualSobreEscalados,
      timeline: timeline.map((t) => ({
        data: t.data.toISOString().slice(0, 10),
        kind: t.kind,
      })),
    };
  }

  /**
   * Resolve o vínculo com a conta de acesso do app: login, status online/
   * offline e jornada de hoje. Reaproveita o FiscaisService (mesma conta do
   * Fiscal via usuarioId). Retorna null quando não há login vinculado.
   */
  private async resolverVinculoApp(
    usuarioId: string | null,
  ): Promise<PerfilColaboradorResposta['vinculoApp']> {
    if (!usuarioId) return null;
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { login: true },
    });
    const resumo = await this.fiscais.meuResumo(usuarioId);
    return {
      usuarioId,
      login: usuario?.login ?? null,
      ehFiscal: !!resumo,
      online: resumo ? resumo.status !== 'FORA_EXPEDIENTE' : false,
      status: resumo?.status ?? null,
      desde: resumo?.em ?? null,
      jornada: resumo
        ? {
            tempoTrabalhandoMs: resumo.tempoTrabalhandoMs,
            tempoIntervaloMs: resumo.tempoIntervaloMs,
            cargaHorariaMs: resumo.cargaHorariaMs,
          }
        : null,
    };
  }

  private async buscarRegistros(
    tipos: string[],
    gte: Date,
    lt: Date,
  ): Promise<RegistroBruto[]> {
    return this.prisma.registroArrecadacao.findMany({
      where: { tipo: { in: tipos }, data: { gte, lt } },
      select: {
        tipo: true,
        matricula: true,
        nome: true,
        valor: true,
        quantidade: true,
        autorizadoPor: true,
        motivo: true,
        data: true,
      },
    });
  }

  /** Agrega valor+quantidade por tipo e por colaborador (resolvido por código). */
  private agregarPorTipo(
    registros: RegistroBruto[],
    mapaMatricula: Map<string, string>,
    mapaLogin: Map<string, string>,
  ): Map<string, Map<string, Agg>> {
    const out = new Map<string, Map<string, Agg>>();
    for (const r of registros) {
      const colId = resolverColaboradorId(
        r.tipo,
        r.matricula,
        mapaMatricula,
        mapaLogin,
      );
      if (!colId) continue;
      let porTipo = out.get(r.tipo);
      if (!porTipo) {
        porTipo = new Map<string, Agg>();
        out.set(r.tipo, porTipo);
      }
      const a = porTipo.get(colId) ?? { valor: 0, qtd: 0 };
      a.valor += Number(r.valor);
      a.qtd += r.quantidade ?? 0;
      porTipo.set(colId, a);
    }
    return out;
  }

  /** Séries de 6 meses do colaborador, por tipo (apenas do próprio). */
  private serie6mDoColaborador(
    registros: RegistroBruto[],
    colaboradorId: string,
    mapaMatricula: Map<string, string>,
    mapaLogin: Map<string, string>,
  ): Map<string, Map<number, number>> {
    const out = new Map<string, Map<number, number>>();
    const add = (tipo: string, mes: number, valor: number): void => {
      let porMes = out.get(tipo);
      if (!porMes) {
        porMes = new Map<number, number>();
        out.set(tipo, porMes);
      }
      porMes.set(mes, (porMes.get(mes) ?? 0) + valor);
    };
    for (const r of registros) {
      const mes = chaveMes(r.data);
      const dono = resolverColaboradorId(
        r.tipo,
        r.matricula,
        mapaMatricula,
        mapaLogin,
      );
      if (dono === colaboradorId) add(r.tipo, mes, Number(r.valor));
    }
    return out;
  }

  /** Motivos dos cancelamentos de cupom do colaborador (contagem por motivo). */
  private motivosDeCupom(
    registros: RegistroBruto[],
    colaboradorId: string,
    mapaMatricula: Map<string, string>,
    mapaLogin: Map<string, string>,
  ): PontoSerie[] {
    const contagem = new Map<string, number>();
    for (const r of registros) {
      if (r.tipo !== 'CANCELAMENTO_CUPOM') continue;
      const dono = resolverColaboradorId(
        r.tipo,
        r.matricula,
        mapaMatricula,
        mapaLogin,
      );
      if (dono !== colaboradorId) continue;
      const motivo = (r.motivo ?? '').trim() || 'Sem motivo';
      contagem.set(motivo, (contagem.get(motivo) ?? 0) + 1);
    }
    return [...contagem.entries()]
      .map(([rotulo, valor]) => ({ rotulo, valor }))
      .sort((a, b) => b.valor - a.valor);
  }

  /** Faltas inteligentes do colaborador (analítica + séries por mês/dia). */
  private async faltasDoColaborador(
    id: string,
    folgaDiaSemana: number,
    nome: string,
    inicio: Date,
    fim: Date,
    prevInicio: Date,
    prevFimExcl: Date,
    inicio6m: Date,
    meses: { chave: number; rotulo: string }[],
  ): Promise<PerfilColaboradorResposta['faltas']> {
    const fimExcl = inicioDoProximoDia(fim);
    const [ausencias, ausenciasAnterior, ausencias6m] = await Promise.all([
      this.prisma.ausencia.findMany({
        where: { pessoaId: id, data: { gte: inicio, lt: fimExcl } },
        select: {
          pessoaId: true,
          data: true,
          statusJustificativa: true,
          motivoJustificativa: true,
        },
      }),
      this.prisma.ausencia.findMany({
        where: { pessoaId: id, data: { gte: prevInicio, lt: prevFimExcl } },
        select: { pessoaId: true, data: true },
      }),
      this.prisma.ausencia.findMany({
        where: { pessoaId: id, data: { gte: inicio6m, lt: fimExcl } },
        select: { data: true },
      }),
    ]);

    const agora = new Date();
    const fimEscala = agora.getTime() < fim.getTime() ? agora : fim;
    const analitica = analisarFaltas({
      operadores: [{ id, nome, folgaDiaSemana }],
      ausencias,
      ausenciasAnterior,
      inicio,
      fimEscala,
    });
    const detalhe = analitica.porOperador.find((o) => o.id === id) ?? null;

    const porMesMap = new Map<number, number>();
    for (const a of ausencias6m) {
      const k = chaveMes(a.data);
      porMesMap.set(k, (porMesMap.get(k) ?? 0) + 1);
    }
    const porMes: PontoSerie[] = meses.map((m) => ({
      rotulo: m.rotulo,
      valor: porMesMap.get(m.chave) ?? 0,
    }));

    return {
      total: analitica.total,
      taxa: detalhe?.taxa ?? analitica.taxaGlobal,
      taxaPonderada: detalhe?.taxaPonderada ?? analitica.taxaGlobal,
      justificadas: detalhe?.justificadas ?? 0,
      risco: detalhe?.risco ?? 'BAIXO',
      tendencia:
        detalhe?.tendencia ?? analitica.total - analitica.totalAnterior,
      porMes,
      porDiaSemana: analitica.porDiaSemana.map((d) => ({
        rotulo: d.nome,
        valor: d.quantidade,
      })),
    };
  }
}
