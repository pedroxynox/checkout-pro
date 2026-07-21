import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Ausencia, FuncaoColaborador } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FeriadosService } from '../feriados/feriados.service';
import {
  AncoraDomingo,
  EscalaDomingoService,
} from '../escala-domingo/escala-domingo.service';
import {
  FichaEscala,
  entradaEsperadaNoDia,
  minutosDeAtraso,
} from '../escala-domingo/escala-domingo.domain';
import {
  INTERVALO_MINIMO_ENTRE_BATIDAS_MS,
  REGRAS_PADRAO,
  RegrasContrato,
  calcularJornadaDia,
  StatusJornadaPonto,
} from '../ponto/ponto.domain';
import { CicloFolhaService } from '../ciclo-folha/ciclo-folha.service';
import { TiposContratoService } from '../tipos-contrato/tipos-contrato.service';
import { mapearFiscalColaborador } from '../fiscais/colaborador-vinculo';
import {
  agoraNaBrasilia,
  inicioDoDia,
  inicioDoProximoDia,
  periodoFolhaDeslocado,
  rotuloPeriodoFolha,
} from '../common/datas';

/** Funções que batem ponto e entram na Central (contrato 6x1-2x1). */
const FUNCOES_PONTO: FuncaoColaborador[] = ['OPERADOR', 'SUPERVISOR', 'FISCAL'];

/** Uma batida mínima para o cálculo da jornada do dia. */
interface BatidaMin {
  id: string;
  hora: Date;
  data: Date;
  pessoaId: string;
  colaboradorId: string | null;
}

/** Resumo do ciclo por pessoa. */
export interface CentralPessoaResumo {
  colaboradorId: string;
  nome: string;
  primeiroNome: string;
  funcao: FuncaoColaborador;
  cargaTrabalhadaMs: number;
  extras50Ms: number;
  /**
   * Horas 50% REAIS disponíveis AGORA = extras 50% acumuladas − o que a pessoa
   * deve (piso 0). O débito/déficit consome apenas as 50% (mesma regra do saldo
   * do time), então este é o "50% que a pessoa tem neste momento" — e não o
   * bruto acumulado no mês ignorando o que deve. É o valor exibido na tela.
   */
  extras50AtualMs: number;
  extras100Ms: number;
  horasDevidasMs: number;
  /**
   * O que a pessoa deve DE VERDADE agora = horas devidas − extras 50%
   * acumuladas (piso 0). As 50% abatem o que ela deve; se sobrarem 50%
   * positivas (ver `extras50AtualMs`), ela NÃO deve horas. É complementar a
   * `extras50AtualMs` (no máximo um dos dois é > 0) e é o valor exibido no
   * chip "Deve" — antes mostrava o bruto, mesmo com saldo 50% positivo.
   */
  horasDevidasAtualMs: number;
  horasAtestadoMs: number;
  faltas: number;
  diasTac: number;
  /** Dias com conflito: bateu ponto E tem uma ausência marcada no mesmo dia. */
  conflitos: number;
  /** Dias em que a entrada foi além da tolerância do turno (atraso). */
  atrasos: number;
  /** Saldo (banco de horas) = extras (50+100) − horas que deve. 1h = 1h. */
  saldoMs: number;
}

/** Detalhe de um dia do ciclo (drill-down por pessoa). */
export interface CentralDiaDetalhe {
  data: string;
  diaSemana: number;
  ehFeriado: boolean;
  feriadoNome?: string;
  /** Tipo do dia: TRABALHO | INCOMPLETO | FALTA | FALTA_DEBITO | ATESTADO | SEM_REGISTRO. */
  tipo:
    | 'TRABALHO'
    | 'INCOMPLETO'
    | 'FALTA'
    | 'FALTA_DEBITO'
    | 'ATESTADO'
    | 'SEM_REGISTRO';
  /** Estado canônico calculado para dias com batidas. */
  status: StatusJornadaPonto;
  faltando: string[];
  trabalhadoMs: number;
  baseMs: number;
  extras50Ms: number;
  extras100Ms: number;
  devidasMs: number;
  tac: boolean;
  motivosTac: string[];
  /** id da ausência (nos dias de FALTA/FALTA_DEBITO/ATESTADO), para marcar débito. */
  ausenciaId?: string;
  /** true se a falta está marcada como débito de horas. */
  debito?: boolean;
  /**
   * Conflito: neste dia a pessoa BATEU PONTO e também tem uma ausência marcada
   * (falta/atestado/permesso). As horas vêm das batidas (a ausência é ignorada
   * no cálculo), mas o conflito fica sinalizado para o gestor resolver — apagar
   * a batida indevida ou a falta indevida.
   */
  conflitoAusencia?: {
    ausenciaId: string;
    motivoJustificativa: string | null;
    statusJustificativa: string;
    debito: boolean;
  };
  /** Horário de entrada esperado pela escala ("HH:mm"), quando há turno. */
  entradaPrevista?: string | null;
  /** Minutos de atraso na entrada além da tolerância (só quando houve atraso). */
  atrasoMinutos?: number;
}

export interface CentralPeriodo {
  inicio: string;
  fim: string;
  rotulo: string;
  deslocamento: number;
}

export interface CentralResumo {
  periodo: CentralPeriodo;
  totais: {
    extras50Ms: number;
    /** Horas 50% reais do time AGORA (soma do 50% líquido de cada pessoa). */
    extras50AtualMs: number;
    extras100Ms: number;
    horasDevidasMs: number;
    horasAtestadoMs: number;
    faltas: number;
    diasTac: number;
    conflitos: number;
    atrasos: number;
    saldoMs: number;
  };
  pessoas: CentralPessoaResumo[];
}

/** Um problema detectado num dia de um colaborador (painel de inconsistências). */
export interface InconsistenciaItem {
  colaboradorId: string;
  nome: string;
  primeiroNome: string;
  funcao: FuncaoColaborador;
  /** Dia (ISO) da ocorrência. */
  data: string;
  diaSemana: number;
  ehFeriado: boolean;
  /**
   * Tipo do problema:
   * - INCOMPLETA: jornada de um dia passado sem fechamento;
   * - DUPLICADA: batidas muito próximas no mesmo dia (possível duplicidade);
   * - CONFLITO_AUSENCIA: bateu ponto E tem falta/atestado no mesmo dia;
   * - ATRASO: entrada além da tolerância do turno (fora da escala);
   * - TAC: dia irregular (excesso de extras ou intervalo fora da faixa).
   */
  tipo: 'INCOMPLETA' | 'DUPLICADA' | 'CONFLITO_AUSENCIA' | 'ATRASO' | 'TAC';
  detalhe: string;
}

export interface CentralInconsistencias {
  periodo: CentralPeriodo;
  totais: {
    incompletas: number;
    duplicadas: number;
    conflitos: number;
    atrasos: number;
    tac: number;
    total: number;
  };
  itens: InconsistenciaItem[];
}

/** Uma linha do relatório de exportação (um dia relevante de um colaborador). */
export interface LinhaExportacaoCiclo {
  colaboradorId: string;
  nome: string;
  funcao: FuncaoColaborador;
  data: string;
  diaSemana: number;
  tipo: CentralDiaDetalhe['tipo'];
  trabalhadoMs: number;
  baseMs: number;
  extras50Ms: number;
  extras100Ms: number;
  devidasMs: number;
  atestado: boolean;
  tac: boolean;
  motivosTac: string[];
  /** Inconsistências do dia (incompleta, conflito, atraso, duplicada, TAC). */
  problemas: string[];
}

/** Exportação completa do ciclo para revisão/folha (antes do fechamento). */
export interface CentralExportacao {
  periodo: CentralPeriodo;
  geradoEm: string;
  totais: {
    extras50Ms: number;
    /** Horas 50% reais do time AGORA (soma do 50% líquido de cada pessoa). */
    extras50AtualMs: number;
    extras100Ms: number;
    horasDevidasMs: number;
    horasAtestadoMs: number;
    faltas: number;
    diasTac: number;
    conflitos: number;
    atrasos: number;
    saldoMs: number;
    inconsistencias: number;
  };
  pessoas: CentralPessoaResumo[];
  linhas: LinhaExportacaoCiclo[];
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

/** Ficha de escala vazia (sem turno) — usada quando a ficha não é encontrada. */
const FICHA_ESCALA_VAZIA: FichaEscala = {
  folgaDiaSemana: null,
  grupoDomingo: null,
  entradaSemana: null,
  entradaFds: null,
  entradaDom: null,
};

/**
 * Central de Jornada — o "portal" de controle da jornada de cada colaborador no
 * ciclo de folha (26→25). Reaproveita `calcularJornadaDia` (consciente de
 * feriado = domingo/100%) sobre as batidas do Relógio Ponto (`batidaPonto`, que
 * já é a fonte única de fiscais + operadores). Só considera o contrato
 * "6x1 - 2x1"; futuros contratos terão o próprio comportamento.
 */
/**
 * Contribuição de uma pessoa ao SALDO DO TIME (o "saldo atual" da tela):
 *  - horas 50%: entram só quando POSITIVAS após o débito (o débito de horas
 *    consome APENAS as 50%); se ficarem negativas, a pessoa aporta 0 — o saldo
 *    negativo é individual (aparece na card) e não puxa o total do time;
 *  - horas 100%: entram SEMPRE — nunca são debitadas de ninguém.
 *
 * Obs.: o saldo INDIVIDUAL (card) segue sendo 50% + 100% − devidas (pode ficar
 * negativo). Só o total do time usa esta regra de "positivas".
 */
export function contribuicaoSaldoTime(p: {
  extras50Ms: number;
  extras100Ms: number;
  horasDevidasMs: number;
}): number {
  return Math.max(0, p.extras50Ms - p.horasDevidasMs) + p.extras100Ms;
}

@Injectable()
export class CentralJornadaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feriados: FeriadosService,
    // Rodízio de domingo, para resolver o turno esperado aos domingos.
    // Opcional: sem ele, o atraso de domingo simplesmente não é calculado.
    @Optional() private readonly escalaDomingo?: EscalaDomingoService,
    // Fechamento do ciclo. Opcional: sem ele, não há bloqueio por ciclo fechado
    // (os testes unitários de cálculo não precisam dele).
    @Optional() private readonly cicloFolha?: CicloFolhaService,
    // Regras por tipo de contrato (data-driven). Opcional: sem ele, o cálculo
    // usa o contrato padrão (6x1), preservando o comportamento vigente.
    @Optional() private readonly tiposContrato?: TiposContratoService,
  ) {}

  /** Regras do contrato (data-driven) ou o padrão quando não há serviço/id. */
  private async regrasDe(
    tipoContratoJornadaId?: string | null,
  ): Promise<RegrasContrato> {
    return this.tiposContrato
      ? this.tiposContrato.regrasDoContrato(tipoContratoJornadaId ?? null)
      : REGRAS_PADRAO;
  }

  private baseDoDia(
    dia: Date,
    ehFeriado: boolean,
    regras: RegrasContrato,
  ): number {
    return ehFeriado
      ? regras.cargaBaseMs(0)
      : regras.cargaBaseMs(dia.getUTCDay());
  }

  /** Carrega os dados brutos do ciclo (pessoas, batidas, ausências, feriados). */
  private async carregarCiclo(deslocamento: number) {
    const periodo = periodoFolhaDeslocado(agoraNaBrasilia(), deslocamento);
    const { inicio, fimExclusivo } = periodo;
    const agora = agoraNaBrasilia();
    const limite = agora < fimExclusivo ? agora : fimExclusivo;

    const [pessoas, batidas, ausencias, feriadoMap, fiscais, usuarios, ancora] =
      await Promise.all([
        this.prisma.colaborador.findMany({
          where: {
            ativo: true,
            funcao: { in: FUNCOES_PONTO },
            // Inclui TODOS os tipos de contrato; as regras de cada pessoa são
            // resolvidas por `regrasDe(tipoContratoJornadaId)` (Fase 2 do spec).
          },
          orderBy: { nome: 'asc' },
          select: {
            id: true,
            nome: true,
            funcao: true,
            matricula: true,
            usuarioId: true,
            // Escala (turno) para comparar a marcação com o horário esperado.
            folgaDiaSemana: true,
            grupoDomingo: true,
            entradaSemana: true,
            entradaFds: true,
            entradaDom: true,
            // Contrato de jornada (data-driven) para resolver as regras da pessoa.
            tipoContratoJornadaId: true,
          },
        }),
        this.prisma.batidaPonto.findMany({
          where: { data: { gte: inicio, lt: fimExclusivo } },
          orderBy: { hora: 'asc' },
          select: {
            id: true,
            hora: true,
            data: true,
            pessoaId: true,
            colaboradorId: true,
          },
        }),
        this.prisma.ausencia.findMany({
          where: { data: { gte: inicio, lt: fimExclusivo } },
        }),
        this.feriados.mapaNoPeriodo(inicio, fimExclusivo),
        this.prisma.fiscal.findMany({
          select: { id: true, nome: true, usuarioId: true },
        }),
        this.prisma.usuario.findMany({ select: { id: true, login: true } }),
        this.escalaDomingo ? this.escalaDomingo.obterAncora() : null,
      ]);

    // Um fiscal bate ponto pela sua identidade de Fiscal (batida.pessoaId =
    // Fiscal.id), que é DIFERENTE do id da sua ficha de Colaborador. Sem este
    // vínculo, a jornada dos fiscais não seria atribuída à ficha e eles
    // sumiriam da Central. Aqui mapeamos, para cada ficha, os ids de fiscal que
    // lhe pertencem (por conta de acesso ou matrícula).
    const fiscalParaColaborador = mapearFiscalColaborador(
      fiscais,
      usuarios,
      pessoas,
    );
    const fiscalIdsPorColaborador = new Map<string, string[]>();
    for (const [fiscalId, vinculo] of fiscalParaColaborador) {
      const atuais = fiscalIdsPorColaborador.get(vinculo.colaboradorId) ?? [];
      atuais.push(fiscalId);
      fiscalIdsPorColaborador.set(vinculo.colaboradorId, atuais);
    }

    return {
      periodo,
      inicio,
      fimExclusivo,
      limite,
      pessoas,
      batidas,
      ausencias,
      feriadoMap,
      fiscalIdsPorColaborador,
      ancora,
    };
  }

  /**
   * Carrega os dados do ciclo de UMA pessoa só (drill-down). Diferente de
   * `carregarCiclo`, NÃO traz as batidas/ausências de todo o time — apenas as
   * do colaborador (a própria ficha + os ids de fiscal vinculados). É o que faz
   * o detalhe abrir rápido: antes, tocar numa pessoa recarregava o ciclo
   * inteiro só para calcular uma.
   */
  private async carregarCicloDaPessoa(
    deslocamento: number,
    colaboradorId: string,
  ) {
    const periodo = periodoFolhaDeslocado(agoraNaBrasilia(), deslocamento);
    const { inicio, fimExclusivo } = periodo;
    const agora = agoraNaBrasilia();
    const limite = agora < fimExclusivo ? agora : fimExclusivo;

    const encontrados = await this.prisma.colaborador.findMany({
      where: {
        id: colaboradorId,
        ativo: true,
        funcao: { in: FUNCOES_PONTO },
        // Qualquer tipo de contrato; regras resolvidas por pessoa (Fase 2).
      },
      select: {
        id: true,
        nome: true,
        funcao: true,
        matricula: true,
        usuarioId: true,
        folgaDiaSemana: true,
        grupoDomingo: true,
        entradaSemana: true,
        entradaFds: true,
        entradaDom: true,
        tipoContratoJornadaId: true,
      },
    });
    const pessoa = encontrados.find((c) => c.id === colaboradorId) ?? null;
    if (!pessoa) {
      return {
        periodo,
        inicio,
        fimExclusivo,
        limite,
        pessoa: null,
        ids: new Set<string>([colaboradorId]),
        batidas: [] as BatidaMin[],
        ausencias: [] as Ausencia[],
        feriadoMap: new Map<number, string>(),
        ancora: null as AncoraDomingo | null,
      };
    }

    // Resolve os ids de fiscal desta ficha (batida de fiscal usa Fiscal.id).
    const [fiscais, usuarios] = await Promise.all([
      this.prisma.fiscal.findMany({
        select: { id: true, nome: true, usuarioId: true },
      }),
      this.prisma.usuario.findMany({ select: { id: true, login: true } }),
    ]);
    const fiscalParaColaborador = mapearFiscalColaborador(fiscais, usuarios, [
      pessoa,
    ]);
    const fiscalIds: string[] = [];
    for (const [fiscalId, vinculo] of fiscalParaColaborador) {
      if (vinculo.colaboradorId === colaboradorId) fiscalIds.push(fiscalId);
    }
    const ids = new Set<string>([colaboradorId, ...fiscalIds]);
    const idList = [...ids];

    // Só as batidas/ausências DESTA pessoa no ciclo (por ficha ou por fiscalId).
    const [batidas, ausencias, feriadoMap, ancora] = await Promise.all([
      this.prisma.batidaPonto.findMany({
        where: {
          data: { gte: inicio, lt: fimExclusivo },
          OR: [{ colaboradorId }, { pessoaId: { in: idList } }],
        },
        orderBy: { hora: 'asc' },
        select: {
          id: true,
          hora: true,
          data: true,
          pessoaId: true,
          colaboradorId: true,
        },
      }),
      this.prisma.ausencia.findMany({
        where: {
          data: { gte: inicio, lt: fimExclusivo },
          OR: [{ colaboradorId }, { pessoaId: { in: idList } }],
        },
      }),
      this.feriados.mapaNoPeriodo(inicio, fimExclusivo),
      this.escalaDomingo ? this.escalaDomingo.obterAncora() : null,
    ]);

    return {
      periodo,
      inicio,
      fimExclusivo,
      limite,
      pessoa,
      ids,
      batidas: batidas as BatidaMin[],
      ausencias,
      feriadoMap,
      ancora,
    };
  }

  /** Todos os ids que representam um colaborador: a própria ficha + seus fiscais. */
  private idsDaPessoa(
    colaboradorId: string,
    fiscalIdsPorColaborador: Map<string, string[]>,
  ): Set<string> {
    return new Set<string>([
      colaboradorId,
      ...(fiscalIdsPorColaborador.get(colaboradorId) ?? []),
    ]);
  }

  /** true se a batida/ausência pertence ao colaborador (por vínculo ou pessoaId). */
  private daPessoa(
    reg: { pessoaId: string; colaboradorId: string | null },
    ids: Set<string>,
  ): boolean {
    return (
      (reg.colaboradorId !== null && ids.has(reg.colaboradorId)) ||
      ids.has(reg.pessoaId)
    );
  }

  /** Calcula os totais e o detalhe diário de um colaborador no ciclo. */
  private calcularPessoa(
    ids: Set<string>,
    batidas: BatidaMin[],
    ausencias: Ausencia[],
    feriadoMap: Map<number, string>,
    inicio: Date,
    fimExclusivo: Date,
    limite: Date,
    ficha: FichaEscala,
    ancora: AncoraDomingo | null,
    regras: RegrasContrato,
    // Quando false, calcula só os TOTAIS (não monta o array `dias`). O resumo
    // do ciclo usa isso para não construir o detalhe diário de todo mundo —
    // que só é necessário no drill-down por pessoa (detalhePessoa).
    coletarDias = true,
  ): {
    resumo: Omit<
      CentralPessoaResumo,
      'colaboradorId' | 'nome' | 'primeiroNome' | 'funcao'
    >;
    dias: CentralDiaDetalhe[];
  } {
    // Batidas e ausências da pessoa, agrupadas por dia (ISO do dia).
    const batidasPorDia = new Map<string, BatidaMin[]>();
    for (const b of batidas) {
      if (!this.daPessoa(b, ids)) continue;
      const k = inicioDoDia(b.data).toISOString();
      if (!batidasPorDia.has(k)) batidasPorDia.set(k, []);
      batidasPorDia.get(k)!.push(b);
    }
    const ausenciaPorDia = new Map<string, Ausencia>();
    for (const a of ausencias) {
      if (!this.daPessoa(a, ids)) continue;
      ausenciaPorDia.set(inicioDoDia(a.data).toISOString(), a);
    }

    let cargaTrabalhadaMs = 0;
    let extras50Ms = 0;
    let extras100Ms = 0;
    let horasDevidasMs = 0;
    let horasAtestadoMs = 0;
    let faltas = 0;
    let diasTac = 0;
    let conflitos = 0;
    let atrasos = 0;
    const dias: CentralDiaDetalhe[] = [];

    for (
      let t = inicio.getTime();
      t < fimExclusivo.getTime();
      t += 24 * 60 * 60 * 1000
    ) {
      const dia = new Date(t);
      const k = dia.toISOString();
      const diaSemana = dia.getUTCDay();
      const ehFeriado = feriadoMap.has(dia.getTime());
      const feriadoNome = feriadoMap.get(dia.getTime());
      const baseMs = this.baseDoDia(dia, ehFeriado, regras);
      const regs = batidasPorDia.get(k);
      const ausencia = ausenciaPorDia.get(k);
      const diaCompleto = inicioDoProximoDia(dia).getTime() <= limite.getTime();

      if (regs && regs.length > 0) {
        const fimDia = inicioDoProximoDia(dia);
        const limiteDia = limite < fimDia ? limite : fimDia;
        const j = calcularJornadaDia(
          regs.map((b) => ({ id: b.id, hora: b.hora })),
          limiteDia,
          diaSemana,
          ehFeriado,
          diaCompleto,
          regras,
        );
        cargaTrabalhadaMs += j.trabalhadoMs;
        extras50Ms += j.horasExtras50Ms;
        extras100Ms += j.horasExtras100Ms;
        if (j.tac) diasTac += 1;
        // Déficit: só em dias já COMPLETOS (não conta o dia em andamento).
        let devidasDia = 0;
        if (diaCompleto && j.trabalhadoMs < baseMs) {
          devidasDia = baseMs - j.trabalhadoMs;
          horasDevidasMs += devidasDia;
        }
        // Conflito: bateu ponto E tem ausência marcada no mesmo dia. As horas
        // vêm das batidas (a ausência é ignorada no cálculo), mas sinalizamos
        // para o gestor decidir qual está errada.
        const conflito = ausencia
          ? {
              ausenciaId: ausencia.id,
              motivoJustificativa: ausencia.motivoJustificativa,
              statusJustificativa: ausencia.statusJustificativa,
              debito: ausencia.debitoHoras,
            }
          : undefined;
        if (conflito) conflitos += 1;
        // Atraso: compara a 1ª batida (entrada) com o turno esperado da escala.
        // Em feriado o turno é ambíguo (não há horário de feriado no cadastro),
        // então não apontamos atraso.
        const entradaReal = regs.reduce(
          (min, b) => (b.hora < min ? b.hora : min),
          regs[0].hora,
        );
        const entradaPrevista = ehFeriado
          ? null
          : entradaEsperadaNoDia(ficha, dia, ancora);
        const atrasoMinutos =
          minutosDeAtraso(entradaPrevista, entradaReal) ?? undefined;
        if (atrasoMinutos != null) atrasos += 1;
        if (coletarDias)
          dias.push({
            data: k,
            diaSemana,
            ehFeriado,
            feriadoNome,
            tipo: j.status === 'INCOMPLETO' ? 'INCOMPLETO' : 'TRABALHO',
            status: j.status,
            faltando: j.faltando,
            trabalhadoMs: j.trabalhadoMs,
            baseMs,
            extras50Ms: j.horasExtras50Ms,
            extras100Ms: j.horasExtras100Ms,
            devidasMs: devidasDia,
            tac: j.tac,
            motivosTac: j.motivosTac,
            conflitoAusencia: conflito,
            entradaPrevista,
            atrasoMinutos,
          });
      } else if (ausencia) {
        faltas += 1;
        let tipo: CentralDiaDetalhe['tipo'] = 'FALTA';
        let devidasDia = 0;
        if (ausencia.motivoJustificativa === 'ATESTADO_MEDICO') {
          horasAtestadoMs += baseMs;
          tipo = 'ATESTADO';
        } else if (ausencia.debitoHoras) {
          horasDevidasMs += baseMs;
          devidasDia = baseMs;
          tipo = 'FALTA_DEBITO';
        }
        if (coletarDias)
          dias.push({
            data: k,
            diaSemana,
            ehFeriado,
            feriadoNome,
            tipo,
            status: 'SEM_REGISTRO',
            faltando: [],
            trabalhadoMs: 0,
            baseMs,
            extras50Ms: 0,
            extras100Ms: 0,
            devidasMs: devidasDia,
            tac: false,
            motivosTac: [],
            ausenciaId: ausencia.id,
            debito: ausencia.debitoHoras,
          });
      } else if (coletarDias) {
        dias.push({
          data: k,
          diaSemana,
          ehFeriado,
          feriadoNome,
          tipo: 'SEM_REGISTRO',
          status: 'SEM_REGISTRO',
          faltando: [],
          trabalhadoMs: 0,
          baseMs,
          extras50Ms: 0,
          extras100Ms: 0,
          devidasMs: 0,
          tac: false,
          motivosTac: [],
        });
      }
    }

    const saldoMs = extras50Ms + extras100Ms - horasDevidasMs;
    // 50% REAIS disponíveis agora: o que deve consome só as 50% (piso 0),
    // igual ao saldo do time. É o número que a tela mostra (não o bruto do mês).
    const extras50AtualMs = Math.max(0, extras50Ms - horasDevidasMs);
    // O que deve DE VERDADE agora: as 50% abatem o débito. Se sobram 50%
    // positivas, não deve nada (complementar a extras50AtualMs).
    const horasDevidasAtualMs = Math.max(0, horasDevidasMs - extras50Ms);
    return {
      resumo: {
        cargaTrabalhadaMs,
        extras50Ms,
        extras50AtualMs,
        extras100Ms,
        horasDevidasMs,
        horasDevidasAtualMs,
        horasAtestadoMs,
        faltas,
        diasTac,
        conflitos,
        atrasos,
        saldoMs,
      },
      dias,
    };
  }

  /** Resumo do ciclo (por pessoa + totais do time). `deslocamento` 0 = atual. */
  async resumoCiclo(deslocamento = 0): Promise<CentralResumo> {
    const dados = await this.carregarCiclo(deslocamento);
    const batidas = dados.batidas as BatidaMin[];

    const pessoas: CentralPessoaResumo[] = await Promise.all(
      dados.pessoas.map(async (c) => {
        const regras = await this.regrasDe(c.tipoContratoJornadaId);
        const { resumo } = this.calcularPessoa(
          this.idsDaPessoa(c.id, dados.fiscalIdsPorColaborador),
          batidas,
          dados.ausencias,
          dados.feriadoMap,
          dados.inicio,
          dados.fimExclusivo,
          dados.limite,
          c,
          dados.ancora,
          regras,
          // Só totais: o resumo não precisa do detalhe diário de cada pessoa.
          false,
        );
        return {
          colaboradorId: c.id,
          nome: c.nome,
          primeiroNome: primeiroNome(c.nome),
          funcao: c.funcao,
          ...resumo,
        };
      }),
    );
    // Sem filtro de "movimento": a Central lista TODAS as fichas não-gerentes
    // (operador/supervisor/fiscal), mesmo zeradas, já em ordem alfabética
    // (a query carrega os colaboradores com orderBy nome asc).

    const totais = pessoas.reduce(
      (acc, p) => ({
        extras50Ms: acc.extras50Ms + p.extras50Ms,
        extras50AtualMs: acc.extras50AtualMs + p.extras50AtualMs,
        extras100Ms: acc.extras100Ms + p.extras100Ms,
        horasDevidasMs: acc.horasDevidasMs + p.horasDevidasMs,
        horasAtestadoMs: acc.horasAtestadoMs + p.horasAtestadoMs,
        faltas: acc.faltas + p.faltas,
        diasTac: acc.diasTac + p.diasTac,
        conflitos: acc.conflitos + p.conflitos,
        atrasos: acc.atrasos + p.atrasos,
        // Saldo do time: só as 50% positivas de cada um + todas as 100%.
        saldoMs: acc.saldoMs + contribuicaoSaldoTime(p),
      }),
      {
        extras50Ms: 0,
        extras50AtualMs: 0,
        extras100Ms: 0,
        horasDevidasMs: 0,
        horasAtestadoMs: 0,
        faltas: 0,
        diasTac: 0,
        conflitos: 0,
        atrasos: 0,
        saldoMs: 0,
      },
    );

    return {
      periodo: this.montarPeriodo(dados.periodo, deslocamento),
      totais,
      pessoas,
    };
  }

  /** Detalhe diário de um colaborador no ciclo (drill-down). */
  async detalhePessoa(
    colaboradorId: string,
    deslocamento = 0,
  ): Promise<{ periodo: CentralPeriodo; dias: CentralDiaDetalhe[] }> {
    // Carrega SÓ os dados desta pessoa (não o ciclo inteiro) — o detalhe abre
    // rápido mesmo com muitos colaboradores.
    const dados = await this.carregarCicloDaPessoa(deslocamento, colaboradorId);
    const regras = await this.regrasDe(dados.pessoa?.tipoContratoJornadaId);
    const { dias } = this.calcularPessoa(
      dados.ids,
      dados.batidas,
      dados.ausencias,
      dados.feriadoMap,
      dados.inicio,
      dados.fimExclusivo,
      dados.limite,
      dados.pessoa ?? FICHA_ESCALA_VAZIA,
      dados.ancora,
      regras,
    );
    return { periodo: this.montarPeriodo(dados.periodo, deslocamento), dias };
  }

  /** true se há duas batidas no mesmo dia próximas demais (possível duplicidade). */
  private temBatidasProximas(horasMs: number[]): boolean {
    const ord = [...horasMs].sort((a, b) => a - b);
    for (let i = 1; i < ord.length; i++) {
      if (ord[i] - ord[i - 1] < INTERVALO_MINIMO_ENTRE_BATIDAS_MS) return true;
    }
    return false;
  }

  /**
   * Painel de inconsistências do ciclo: varre o dia a dia de cada colaborador e
   * devolve uma lista achatada dos problemas — jornadas incompletas, batidas
   * duplicadas, conflito ponto↔ausência, atraso (fora da escala) e TAC. Os
   * filtros por pessoa/função/tipo são aplicados na tela (a lista completa do
   * ciclo é leve).
   */
  async inconsistenciasCiclo(
    deslocamento = 0,
  ): Promise<CentralInconsistencias> {
    const dados = await this.carregarCiclo(deslocamento);
    const batidas = dados.batidas as BatidaMin[];
    const itens: InconsistenciaItem[] = [];

    for (const c of dados.pessoas) {
      const ids = this.idsDaPessoa(c.id, dados.fiscalIdsPorColaborador);
      const regras = await this.regrasDe(c.tipoContratoJornadaId);
      const { dias } = this.calcularPessoa(
        ids,
        batidas,
        dados.ausencias,
        dados.feriadoMap,
        dados.inicio,
        dados.fimExclusivo,
        dados.limite,
        c,
        dados.ancora,
        regras,
      );

      // Horas das batidas da pessoa por dia (para detectar duplicidade).
      const horasPorDia = new Map<string, number[]>();
      for (const b of batidas) {
        if (!this.daPessoa(b, ids)) continue;
        const k = inicioDoDia(b.data).toISOString();
        const arr = horasPorDia.get(k) ?? [];
        arr.push(b.hora.getTime());
        horasPorDia.set(k, arr);
      }

      const base = (d: CentralDiaDetalhe) => ({
        colaboradorId: c.id,
        nome: c.nome,
        primeiroNome: primeiroNome(c.nome),
        funcao: c.funcao,
        data: d.data,
        diaSemana: d.diaSemana,
        ehFeriado: d.ehFeriado,
      });

      for (const d of dias) {
        if (d.tipo === 'INCOMPLETO') {
          itens.push({
            ...base(d),
            tipo: 'INCOMPLETA',
            detalhe: d.faltando.length
              ? `Falta registrar: ${d.faltando.join(', ')}`
              : 'Jornada incompleta',
          });
        }
        if (d.conflitoAusencia) {
          itens.push({
            ...base(d),
            tipo: 'CONFLITO_AUSENCIA',
            detalhe: 'Bateu ponto e tem falta/atestado marcado no mesmo dia',
          });
        }
        if (d.atrasoMinutos != null) {
          itens.push({
            ...base(d),
            tipo: 'ATRASO',
            detalhe: `Entrada ${d.atrasoMinutos} min além do turno${
              d.entradaPrevista ? ` (previsto ${d.entradaPrevista})` : ''
            }`,
          });
        }
        if (d.tac) {
          itens.push({
            ...base(d),
            tipo: 'TAC',
            detalhe: d.motivosTac.join('; ') || 'Dia em TAC',
          });
        }
        const horas = horasPorDia.get(d.data);
        if (horas && this.temBatidasProximas(horas)) {
          itens.push({
            ...base(d),
            tipo: 'DUPLICADA',
            detalhe:
              'Batidas muito próximas no mesmo dia (possível duplicidade)',
          });
        }
      }
    }

    // Mais recentes primeiro; empate por nome.
    itens.sort((a, b) =>
      a.data === b.data
        ? a.nome.localeCompare(b.nome)
        : b.data.localeCompare(a.data),
    );

    const contar = (t: InconsistenciaItem['tipo']) =>
      itens.filter((i) => i.tipo === t).length;

    return {
      periodo: this.montarPeriodo(dados.periodo, deslocamento),
      totais: {
        incompletas: contar('INCOMPLETA'),
        duplicadas: contar('DUPLICADA'),
        conflitos: contar('CONFLITO_AUSENCIA'),
        atrasos: contar('ATRASO'),
        tac: contar('TAC'),
        total: itens.length,
      },
      itens,
    };
  }

  /**
   * Exportação do ciclo (26→25) para revisão antes do fechamento: uma linha por
   * dia relevante de cada colaborador (trabalho, incompleta, falta, atestado),
   * com trabalhado/base, extras 50/100, horas devidas, atestado, TAC e as
   * inconsistências do dia — mais os totais do time. Serve de base para a
   * revisão do ciclo antes do fechamento.
   */
  async exportarCiclo(deslocamento = 0): Promise<CentralExportacao> {
    const dados = await this.carregarCiclo(deslocamento);
    const batidas = dados.batidas as BatidaMin[];
    const pessoas: CentralPessoaResumo[] = [];
    const linhas: LinhaExportacaoCiclo[] = [];
    let inconsistencias = 0;

    for (const c of dados.pessoas) {
      const ids = this.idsDaPessoa(c.id, dados.fiscalIdsPorColaborador);
      const regras = await this.regrasDe(c.tipoContratoJornadaId);
      const { resumo, dias } = this.calcularPessoa(
        ids,
        batidas,
        dados.ausencias,
        dados.feriadoMap,
        dados.inicio,
        dados.fimExclusivo,
        dados.limite,
        c,
        dados.ancora,
        regras,
      );
      pessoas.push({
        colaboradorId: c.id,
        nome: c.nome,
        primeiroNome: primeiroNome(c.nome),
        funcao: c.funcao,
        ...resumo,
      });

      const horasPorDia = new Map<string, number[]>();
      for (const b of batidas) {
        if (!this.daPessoa(b, ids)) continue;
        const k = inicioDoDia(b.data).toISOString();
        const arr = horasPorDia.get(k) ?? [];
        arr.push(b.hora.getTime());
        horasPorDia.set(k, arr);
      }

      for (const d of dias) {
        // Só dias relevantes entram no relatório (ignora "sem registro").
        if (d.tipo === 'SEM_REGISTRO') continue;
        const problemas: string[] = [];
        if (d.tipo === 'INCOMPLETO') problemas.push('Incompleta');
        if (d.conflitoAusencia) problemas.push('Conflito ponto/ausência');
        if (d.atrasoMinutos != null) {
          problemas.push(`Atraso ${d.atrasoMinutos}min`);
        }
        if (d.tac) problemas.push('TAC');
        const horas = horasPorDia.get(d.data);
        if (horas && this.temBatidasProximas(horas)) {
          problemas.push('Duplicada');
        }
        inconsistencias += problemas.length;
        linhas.push({
          colaboradorId: c.id,
          nome: c.nome,
          funcao: c.funcao,
          data: d.data,
          diaSemana: d.diaSemana,
          tipo: d.tipo,
          trabalhadoMs: d.trabalhadoMs,
          baseMs: d.baseMs,
          extras50Ms: d.extras50Ms,
          extras100Ms: d.extras100Ms,
          devidasMs: d.devidasMs,
          atestado: d.tipo === 'ATESTADO',
          tac: d.tac,
          motivosTac: d.motivosTac,
          problemas,
        });
      }
    }

    // Ordena por colaborador (nome) e, dentro dele, por data crescente.
    linhas.sort((a, b) =>
      a.nome === b.nome
        ? a.data.localeCompare(b.data)
        : a.nome.localeCompare(b.nome),
    );

    const totais = pessoas.reduce(
      (acc, p) => ({
        extras50Ms: acc.extras50Ms + p.extras50Ms,
        extras50AtualMs: acc.extras50AtualMs + p.extras50AtualMs,
        extras100Ms: acc.extras100Ms + p.extras100Ms,
        horasDevidasMs: acc.horasDevidasMs + p.horasDevidasMs,
        horasAtestadoMs: acc.horasAtestadoMs + p.horasAtestadoMs,
        faltas: acc.faltas + p.faltas,
        diasTac: acc.diasTac + p.diasTac,
        conflitos: acc.conflitos + p.conflitos,
        atrasos: acc.atrasos + p.atrasos,
        // Saldo do time: só as 50% positivas de cada um + todas as 100%.
        saldoMs: acc.saldoMs + contribuicaoSaldoTime(p),
      }),
      {
        extras50Ms: 0,
        extras50AtualMs: 0,
        extras100Ms: 0,
        horasDevidasMs: 0,
        horasAtestadoMs: 0,
        faltas: 0,
        diasTac: 0,
        conflitos: 0,
        atrasos: 0,
        saldoMs: 0,
      },
    );

    return {
      periodo: this.montarPeriodo(dados.periodo, deslocamento),
      geradoEm: new Date().toISOString(),
      totais: { ...totais, inconsistencias },
      pessoas,
      linhas,
    };
  }

  /** Comparativo dos últimos `qtd` ciclos (totais do time por período). */
  async comparativos(qtd = 6) {
    const n = Math.min(Math.max(qtd, 1), 12);
    const ciclos = [];
    for (let i = 0; i < n; i++) {
      const r = await this.resumoCiclo(-i);
      ciclos.push({ periodo: r.periodo, totais: r.totais });
    }
    return ciclos.reverse();
  }

  /**
   * Marca (ou desmarca) uma falta como DÉBITO de horas: quando marcada, a carga
   * daquele dia entra em "horas que deve" da pessoa. Feito manualmente pelo
   * gestor sobre uma ausência já registrada.
   */
  async marcarDebito(ausenciaId: string, debito: boolean): Promise<Ausencia> {
    const ausencia = await this.prisma.ausencia.findUnique({
      where: { id: ausenciaId },
    });
    if (!ausencia) {
      throw new NotFoundException('Falta não encontrada.');
    }
    // Bloqueia a edição quando o ciclo de folha daquele dia está fechado.
    if (this.cicloFolha) {
      await this.cicloFolha.exigirCicloAberto(ausencia.data);
    }
    return this.prisma.ausencia.update({
      where: { id: ausenciaId },
      data: { debitoHoras: debito },
    });
  }

  private montarPeriodo(
    periodo: { inicio: Date; fimExclusivo: Date },
    deslocamento: number,
  ): CentralPeriodo {
    const fim = new Date(periodo.fimExclusivo);
    fim.setUTCDate(fim.getUTCDate() - 1);
    return {
      inicio: periodo.inicio.toISOString(),
      fim: fim.toISOString(),
      rotulo: rotuloPeriodoFolha(periodo),
      deslocamento,
    };
  }
}
