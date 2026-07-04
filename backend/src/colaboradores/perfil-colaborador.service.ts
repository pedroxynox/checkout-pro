import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FiscaisService } from '../fiscais/fiscais.service';
import { StatusFiscal } from '../fiscais/fiscais.domain';
import { inicioDoDia, inicioDoMes, inicioDoProximoDia } from '../common/datas';
import { arredondar } from '../common/numeros';
import { CONFIG_ARRECADACAO } from '../arrecadacao/arrecadacao.domain';
import { analisarFaltas } from '../operadores/operadores.domain';
import { IncidenciasService } from '../incidencias/incidencias.service';
import { ColaboradorNaoEncontradoError } from './colaboradores.errors';
import {
  calcularScore,
  gerarInsignias,
  gerarResumo,
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
    } else {
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
    }

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

    // Motivos dos cancelamentos de cupom do colaborador (pizza) — operador.
    const motivosCancelamento = ehFiscal
      ? []
      : this.motivosDeCupom(regsAtual, id, mapaMatricula, mapaLogin);

    // Score de Saúde.
    const valorIndicador = (chave: string): number =>
      indicadores.find((i) => i.chave === chave)?.valor ?? 0;
    const mediaIndicador = (chave: string): number =>
      indicadores.find((i) => i.chave === chave)?.mediaEquipe ?? 0;

    const score = calcularScore(
      ehFiscal
        ? {
            // Fiscal: o app não controla "quem autorizou" (externo) e as
            // devoluções são informativas. A saúde foca na assiduidade.
            taxaFaltas: faltas.taxa,
          }
        : {
            taxaFaltas: faltas.taxa,
            contribuicao: {
              valor:
                valorIndicador('TROCO_SOLIDARIO') +
                valorIndicador('RECARGAS_CELULAR'),
              meta:
                CONFIG_ARRECADACAO.TROCO_SOLIDARIO.meta +
                CONFIG_ARRECADACAO.RECARGAS_CELULAR.meta,
            },
            cancelamentos: {
              valor:
                valorIndicador('CANCELAMENTO_ITENS') +
                valorIndicador('CANCELAMENTO_CUPOM'),
              media:
                mediaIndicador('CANCELAMENTO_ITENS') +
                mediaIndicador('CANCELAMENTO_CUPOM'),
            },
          },
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
    };
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
    return {
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
        select: { pessoaId: true, data: true },
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
