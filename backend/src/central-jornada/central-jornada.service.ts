import { Injectable, NotFoundException } from '@nestjs/common';
import { Ausencia, FuncaoColaborador } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FeriadosService } from '../feriados/feriados.service';
import { calcularJornadaDia } from '../ponto/ponto.domain';
import { jornadaEsperadaMs } from '../fiscais/fiscais.domain';
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
  /** Saldo (banco de horas) = extras (50+100) − horas que deve. 1h = 1h. */
  saldoMs: number;
}

/** Detalhe de um dia do ciclo (drill-down por pessoa). */
export interface CentralDiaDetalhe {
  data: string;
  diaSemana: number;
  ehFeriado: boolean;
  feriadoNome?: string;
  /** Tipo do dia: TRABALHO | FALTA | FALTA_DEBITO | ATESTADO | SEM_REGISTRO. */
  tipo: 'TRABALHO' | 'FALTA' | 'FALTA_DEBITO' | 'ATESTADO' | 'SEM_REGISTRO';
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
    saldoMs: number;
  };
  pessoas: CentralPessoaResumo[];
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

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

    const [pessoas, batidas, ausencias, feriadoMap] = await Promise.all([
      this.prisma.colaborador.findMany({
        where: {
          ativo: true,
          funcao: { in: FUNCOES_PONTO },
          tipoContrato: 'SEIS_X_UM_DOIS_X_UM',
        },
        orderBy: { nome: 'asc' },
        select: { id: true, nome: true, funcao: true },
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
    ]);

    return {
      periodo,
      inicio,
      fimExclusivo,
      limite,
      pessoas,
      batidas,
      ausencias,
      feriadoMap,
    };
  }

  /** true se a batida/ausência pertence ao colaborador (por vínculo ou pessoaId). */
  private daPessoa(
    reg: { pessoaId: string; colaboradorId: string | null },
    colaboradorId: string,
  ): boolean {
    return (
      reg.colaboradorId === colaboradorId || reg.pessoaId === colaboradorId
    );
  }

  /** Calcula os totais e o detalhe diário de um colaborador no ciclo. */
  private calcularPessoa(
    colaboradorId: string,
    batidas: BatidaMin[],
    ausencias: Ausencia[],
    feriadoMap: Map<number, string>,
    inicio: Date,
    fimExclusivo: Date,
    limite: Date,
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
      if (!this.daPessoa(b, colaboradorId)) continue;
      const k = inicioDoDia(b.data).toISOString();
      if (!batidasPorDia.has(k)) batidasPorDia.set(k, []);
      batidasPorDia.get(k)!.push(b);
    }
    const ausenciaPorDia = new Map<string, Ausencia>();
    for (const a of ausencias) {
      if (!this.daPessoa(a, colaboradorId)) continue;
      ausenciaPorDia.set(inicioDoDia(a.data).toISOString(), a);
    }

    let cargaTrabalhadaMs = 0;
    let extras50Ms = 0;
    let extras100Ms = 0;
    let horasDevidasMs = 0;
    let horasAtestadoMs = 0;
    let faltas = 0;
    let diasTac = 0;
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
        dias.push({
          data: k,
          diaSemana,
          ehFeriado,
          feriadoNome,
          tipo: 'TRABALHO',
          trabalhadoMs: j.trabalhadoMs,
          baseMs,
          extras50Ms: j.horasExtras50Ms,
          extras100Ms: j.horasExtras100Ms,
          devidasMs: devidasDia,
          tac: j.tac,
          motivosTac: j.motivosTac,
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
        saldoMs,
      },
      dias,
    };
  }

  /** Resumo do ciclo (por pessoa + totais do time). `deslocamento` 0 = atual. */
  async resumoCiclo(deslocamento = 0): Promise<CentralResumo> {
    const dados = await this.carregarCiclo(deslocamento);
    const batidas = dados.batidas as BatidaMin[];

    const pessoas: CentralPessoaResumo[] = dados.pessoas
      .map((c) => {
        const { resumo } = this.calcularPessoa(
          c.id,
          batidas,
          dados.ausencias,
          dados.feriadoMap,
          dados.inicio,
          dados.fimExclusivo,
          dados.limite,
        );
        return {
          colaboradorId: c.id,
          nome: c.nome,
          primeiroNome: primeiroNome(c.nome),
          funcao: c.funcao,
          ...resumo,
        };
      })
      // Só aparece quem teve movimento no ciclo (bateu ponto ou teve falta).
      .filter(
        (p) =>
          p.cargaTrabalhadaMs > 0 ||
          p.faltas > 0 ||
          p.horasAtestadoMs > 0 ||
          p.horasDevidasMs > 0,
      );

    const totais = pessoas.reduce(
      (acc, p) => ({
        extras50Ms: acc.extras50Ms + p.extras50Ms,
        extras100Ms: acc.extras100Ms + p.extras100Ms,
        horasDevidasMs: acc.horasDevidasMs + p.horasDevidasMs,
        horasAtestadoMs: acc.horasAtestadoMs + p.horasAtestadoMs,
        faltas: acc.faltas + p.faltas,
        diasTac: acc.diasTac + p.diasTac,
        saldoMs: acc.saldoMs + p.saldoMs,
      }),
      {
        extras50Ms: 0,
        extras100Ms: 0,
        horasDevidasMs: 0,
        horasAtestadoMs: 0,
        faltas: 0,
        diasTac: 0,
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
    const { dias } = this.calcularPessoa(
      colaboradorId,
      dados.batidas as BatidaMin[],
      dados.ausencias,
      dados.feriadoMap,
      dados.inicio,
      dados.fimExclusivo,
      dados.limite,
    );
    return { periodo: this.montarPeriodo(dados.periodo, deslocamento), dias };
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
