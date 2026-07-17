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
  calcularJornadaDia,
  StatusJornadaPonto,
} from '../ponto/ponto.domain';
import { CicloFolhaService } from '../ciclo-folha/ciclo-folha.service';
import { jornadaEsperadaMs } from '../fiscais/fiscais.domain';
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
  extras100Ms: number;
  horasDevidasMs: number;
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
  /** Relatório em CSV (separador ";") pronto para compartilhar/planilha. */
  csv: string;
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

const DIAS_SEMANA_BR = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Duração em "H:MM" (ex.: 27000000 → "7:30"). */
function msParaHm(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** Data ISO → "dd/mm/aaaa" (usa a data de parede, sem fuso). */
function dataBr(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(
    d.getUTCMonth() + 1,
  ).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

function rotuloFuncaoExport(f: FuncaoColaborador): string {
  if (f === 'FISCAL') return 'Fiscal';
  if (f === 'SUPERVISOR') return 'Supervisor';
  if (f === 'OPERADOR') return 'Operador';
  return 'Gestor';
}

function rotuloTipoLinha(tipo: CentralDiaDetalhe['tipo']): string {
  switch (tipo) {
    case 'FALTA':
      return 'Falta';
    case 'FALTA_DEBITO':
      return 'Falta (débito)';
    case 'ATESTADO':
      return 'Atestado';
    case 'INCOMPLETO':
      return 'Incompleta';
    default:
      return 'Trabalho';
  }
}

/** Escapa um campo para CSV (separador ";"): aspas quando há ; " ou quebra. */
function csvCampo(valor: string): string {
  return /[;"\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
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
  ) {}

  private baseDoDia(dia: Date, ehFeriado: boolean): number {
    return ehFeriado
      ? jornadaEsperadaMs(0)
      : jornadaEsperadaMs(dia.getUTCDay());
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
            tipoContrato: 'SEIS_X_UM_DOIS_X_UM',
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
      const baseMs = this.baseDoDia(dia, ehFeriado);
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
      } else {
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
    return {
      resumo: {
        cargaTrabalhadaMs,
        extras50Ms,
        extras100Ms,
        horasDevidasMs,
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

    const pessoas: CentralPessoaResumo[] = dados.pessoas.map((c) => {
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
      );
      return {
        colaboradorId: c.id,
        nome: c.nome,
        primeiroNome: primeiroNome(c.nome),
        funcao: c.funcao,
        ...resumo,
      };
    });
    // Sem filtro de "movimento": a Central lista TODAS as fichas não-gerentes
    // (operador/supervisor/fiscal), mesmo zeradas, já em ordem alfabética
    // (a query carrega os colaboradores com orderBy nome asc).

    const totais = pessoas.reduce(
      (acc, p) => ({
        extras50Ms: acc.extras50Ms + p.extras50Ms,
        extras100Ms: acc.extras100Ms + p.extras100Ms,
        horasDevidasMs: acc.horasDevidasMs + p.horasDevidasMs,
        horasAtestadoMs: acc.horasAtestadoMs + p.horasAtestadoMs,
        faltas: acc.faltas + p.faltas,
        diasTac: acc.diasTac + p.diasTac,
        conflitos: acc.conflitos + p.conflitos,
        atrasos: acc.atrasos + p.atrasos,
        saldoMs: acc.saldoMs + p.saldoMs,
      }),
      {
        extras50Ms: 0,
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
    const dados = await this.carregarCiclo(deslocamento);
    const ficha = dados.pessoas.find((p) => p.id === colaboradorId);
    const { dias } = this.calcularPessoa(
      this.idsDaPessoa(colaboradorId, dados.fiscalIdsPorColaborador),
      dados.batidas as BatidaMin[],
      dados.ausencias,
      dados.feriadoMap,
      dados.inicio,
      dados.fimExclusivo,
      dados.limite,
      ficha ?? FICHA_ESCALA_VAZIA,
      dados.ancora,
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

  /** Monta o CSV (separador ";") a partir das linhas do relatório. */
  private montarCsv(linhas: LinhaExportacaoCiclo[]): string {
    const cabecalho = [
      'Colaborador',
      'Função',
      'Data',
      'Dia',
      'Tipo',
      'Trabalhado',
      'Base',
      'Extras 50%',
      'Extras 100%',
      'Devidas',
      'Atestado',
      'TAC',
      'Motivos TAC',
      'Problemas',
    ];
    const corpo = linhas.map((l) =>
      [
        l.nome,
        rotuloFuncaoExport(l.funcao),
        dataBr(l.data),
        DIAS_SEMANA_BR[l.diaSemana] ?? '',
        rotuloTipoLinha(l.tipo),
        msParaHm(l.trabalhadoMs),
        msParaHm(l.baseMs),
        msParaHm(l.extras50Ms),
        msParaHm(l.extras100Ms),
        msParaHm(l.devidasMs),
        l.atestado ? 'Sim' : '',
        l.tac ? 'Sim' : '',
        l.motivosTac.join(' | '),
        l.problemas.join(' | '),
      ]
        .map(csvCampo)
        .join(';'),
    );
    return [cabecalho.join(';'), ...corpo].join('\n');
  }

  /**
   * Exportação do ciclo (26→25) para revisão antes do fechamento: uma linha por
   * dia relevante de cada colaborador (trabalho, incompleta, falta, atestado),
   * com trabalhado/base, extras 50/100, horas devidas, atestado, TAC e as
   * inconsistências do dia — mais os totais do time e um CSV pronto para
   * planilha/compartilhamento.
   */
  async exportarCiclo(deslocamento = 0): Promise<CentralExportacao> {
    const dados = await this.carregarCiclo(deslocamento);
    const batidas = dados.batidas as BatidaMin[];
    const pessoas: CentralPessoaResumo[] = [];
    const linhas: LinhaExportacaoCiclo[] = [];
    let inconsistencias = 0;

    for (const c of dados.pessoas) {
      const ids = this.idsDaPessoa(c.id, dados.fiscalIdsPorColaborador);
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
        extras100Ms: acc.extras100Ms + p.extras100Ms,
        horasDevidasMs: acc.horasDevidasMs + p.horasDevidasMs,
        horasAtestadoMs: acc.horasAtestadoMs + p.horasAtestadoMs,
        faltas: acc.faltas + p.faltas,
        diasTac: acc.diasTac + p.diasTac,
        conflitos: acc.conflitos + p.conflitos,
        atrasos: acc.atrasos + p.atrasos,
        saldoMs: acc.saldoMs + p.saldoMs,
      }),
      {
        extras50Ms: 0,
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
      csv: this.montarCsv(linhas),
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
