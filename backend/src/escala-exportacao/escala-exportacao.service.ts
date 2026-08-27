/**
 * Escala para PUBLICAR (dia e semana), com todo o time.
 *
 * Junta num só lugar o que estava espalhado: a ficha de cada colaborador (turno,
 * folga fixa, grupo do rodízio), a âncora do rodízio de domingo, os feriados, as
 * férias, as ausências do dia e as exceções de horário. O resultado é a escala
 * pronta para virar PDF/imagem e ser enviada à equipe.
 *
 * Por que um módulo novo e não uma extensão do Quadro de Operadores: o quadro é
 * uma tela de **gestão** (só operadores, sem regra de feriado, com ações de
 * falta/justificativa). A escala publicada é um **documento** — cobre todas as
 * funções, aplica feriado, mostra férias e não edita nada. Misturar os dois
 * faria um deles mentir.
 */
import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EscalaDomingoService } from '../escala-domingo/escala-domingo.service';
import { GrupoDomingo, grupoFolgaNoDomingo } from '../escala-domingo/escala-domingo.domain';
import { feriadosNacionais } from '../feriados/feriados.domain';
import { FeriasService } from '../ferias/ferias.service';
import {
  FichaColaboradorEscala,
  FuncaoEscala,
  HorarioEspecialDia,
  LinhaEscala,
  ORDEM_FUNCOES,
  SecaoEscala,
  StatusEscala,
  TotaisEscala,
  agruparPorFuncao,
  diaUTC,
  isoDoDia,
  montarLinhaEscala,
  semanaDe,
  totaisEscala,
} from './escala-publicada.domain';

/** Funções escaladas (a gerência não entra na escala publicada). */
const FUNCOES_ESCALA: FuncaoEscala[] = ['OPERADOR', 'FISCAL', 'SUPERVISOR'];

/** Escala publicada de um dia. */
export interface EscalaDiaPublicada {
  dataISO: string;
  diaSemana: number;
  ehFeriado: boolean;
  /** Nome do feriado, quando a data é feriado; senão null. */
  nomeFeriado: string | null;
  /** Só no domingo: grupo que folga pelo rodízio (ou null sem âncora). */
  grupoFolgaDomingo: GrupoDomingo | null;
  totais: TotaisEscala;
  /** Pessoas agrupadas por função, na ordem fixa de leitura. */
  secoes: SecaoEscala[];
}

/** Um dia no cabeçalho da escala semanal. */
export interface DiaSemanaEscala {
  dataISO: string;
  diaSemana: number;
  ehFeriado: boolean;
  nomeFeriado: string | null;
}

/** Uma pessoa na grade semanal: uma célula por dia (segunda a domingo). */
export interface PessoaSemanaEscala {
  colaboradorId: string;
  nome: string;
  funcao: FuncaoEscala;
  turno: string | null;
  celulas: {
    status: StatusEscala;
    entrada: string | null;
    saida: string | null;
  }[];
}

/** Escala publicada de uma semana (segunda a domingo). */
export interface EscalaSemanaPublicada {
  inicioISO: string;
  fimISO: string;
  dias: DiaSemanaEscala[];
  /** Pessoas agrupadas por função, cada uma com as 7 células da semana. */
  secoes: { funcao: FuncaoEscala; pessoas: PessoaSemanaEscala[] }[];
}

@Injectable()
export class EscalaExportacaoService {
  constructor(
    private readonly prisma: PrismaService,
    // Opcionais para permitir testes unitários sem montar o grafo inteiro —
    // mesmo padrão já usado por EscalaService e OperadorTurnoService.
    @Optional() private readonly escalaDomingo?: EscalaDomingoService,
    @Optional() private readonly ferias?: FeriasService,
  ) {}

  /** Fichas ativas das funções escaladas, já no formato do domínio. */
  private async fichas(): Promise<FichaColaboradorEscala[]> {
    const cols = await this.prisma.colaborador.findMany({
      where: { funcao: { in: FUNCOES_ESCALA }, ativo: true },
      select: {
        id: true,
        nome: true,
        funcao: true,
        turno: true,
        folgaDiaSemana: true,
        grupoDomingo: true,
        entradaSemana: true,
        saidaSemana: true,
        entradaFds: true,
        saidaFds: true,
        entradaDom: true,
        saidaDom: true,
      },
      orderBy: { nome: 'asc' },
    });
    return cols.map((c) => ({
      colaboradorId: c.id,
      nome: c.nome,
      funcao: c.funcao as FuncaoEscala,
      turno: c.turno ?? null,
      folgaDiaSemana: c.folgaDiaSemana ?? null,
      grupoDomingo: c.grupoDomingo ?? null,
      entradaSemana: c.entradaSemana ?? null,
      saidaSemana: c.saidaSemana ?? null,
      entradaFds: c.entradaFds ?? null,
      saidaFds: c.saidaFds ?? null,
      entradaDom: c.entradaDom ?? null,
      saidaDom: c.saidaDom ?? null,
    }));
  }

  /**
   * Feriados de um intervalo (`yyyy-mm-dd` → nome), juntando os nacionais
   * automáticos com os manuais cadastrados. Feito num só passo para a semana não
   * disparar sete consultas.
   */
  private async feriadosDoPeriodo(
    inicio: Date,
    fimExclusivo: Date,
  ): Promise<Map<string, string>> {
    const mapa = new Map<string, string>();
    // Nacionais: cobre a virada de ano olhando os dois anos do intervalo.
    const anos = new Set([
      inicio.getUTCFullYear(),
      new Date(fimExclusivo.getTime() - 1).getUTCFullYear(),
    ]);
    for (const ano of anos) {
      for (const f of feriadosNacionais(ano)) {
        const iso = isoDoDia(f.data);
        if (f.data >= inicio && f.data < fimExclusivo) mapa.set(iso, f.nome);
      }
    }
    const manuais = await this.prisma.feriado.findMany({
      where: { data: { gte: inicio, lt: fimExclusivo } },
      select: { data: true, nome: true },
    });
    // O manual descreve melhor a data local (estadual/municipal) — prevalece.
    for (const m of manuais) mapa.set(isoDoDia(m.data), m.nome);
    return mapa;
  }

  /**
   * Exceções de horário por pessoa e dia da semana (`colaboradorId|diaSemana`).
   *
   * Só as marcadas como `especial`: são as que existem justamente para
   * prevalecer sobre o turno do cadastro. Entradas sem `colaboradorId` (escalas
   * antigas, sem vínculo com a ficha) são ignoradas — sem a ficha não há como
   * saber com segurança de quem é a exceção, e aplicar no palpite seria pior.
   */
  private async especiais(): Promise<Map<string, HorarioEspecialDia>> {
    const entries = await this.prisma.escalaEntry.findMany({
      where: { especial: true, colaboradorId: { not: null } },
      select: {
        colaboradorId: true,
        diaSemana: true,
        entrada: true,
        saida: true,
        folga: true,
      },
    });
    const mapa = new Map<string, HorarioEspecialDia>();
    for (const e of entries) {
      mapa.set(`${e.colaboradorId}|${e.diaSemana}`, {
        entrada: e.entrada ?? null,
        saida: e.saida ?? null,
        folga: e.folga,
      });
    }
    return mapa;
  }

  /** Ausências do intervalo por `colaboradorId|yyyy-mm-dd`. */
  private async ocorrencias(
    ids: string[],
    inicio: Date,
    fimExclusivo: Date,
  ): Promise<Map<string, { ehAtestado: boolean }>> {
    if (ids.length === 0) return new Map();
    const ausencias = await this.prisma.ausencia.findMany({
      where: {
        pessoaId: { in: ids },
        data: { gte: inicio, lt: fimExclusivo },
      },
      select: {
        pessoaId: true,
        data: true,
        atestadoId: true,
        motivoJustificativa: true,
      },
    });
    const mapa = new Map<string, { ehAtestado: boolean }>();
    for (const a of ausencias) {
      mapa.set(`${a.pessoaId}|${isoDoDia(a.data)}`, {
        // Mesma regra do Quadro de Operadores: atestado é a falta ligada a um
        // atestado (ou lançada com esse motivo).
        ehAtestado:
          a.atestadoId != null || a.motivoJustificativa === 'ATESTADO_MEDICO',
      });
    }
    return mapa;
  }

  /** Âncora do rodízio de domingo, quando configurada. */
  private async ancora(): Promise<{
    data: Date;
    ordem: readonly GrupoDomingo[];
  } | null> {
    if (!this.escalaDomingo) return null;
    return this.escalaDomingo.obterAncora();
  }

  /** Escala publicada de um dia (padrão: hoje em Brasília). */
  async escalaDoDia(dataISO: string): Promise<EscalaDiaPublicada> {
    const dia = diaUTC(dataISO);
    const iso = isoDoDia(dia);
    const fim = new Date(dia);
    fim.setUTCDate(fim.getUTCDate() + 1);

    const [fichas, ancoraDomingo, feriados, especiais] = await Promise.all([
      this.fichas(),
      this.ancora(),
      this.feriadosDoPeriodo(dia, fim),
      this.especiais(),
    ]);
    const ids = fichas.map((f) => f.colaboradorId);
    const [ocorrencias, deFerias] = await Promise.all([
      this.ocorrencias(ids, dia, fim),
      this.ferias
        ? this.ferias.colaboradoresDeFeriasNoDia(dia)
        : Promise.resolve(new Set<string>()),
    ]);

    const nomeFeriado = feriados.get(iso) ?? null;
    const linhas: LinhaEscala[] = fichas.map((ficha) =>
      montarLinhaEscala({
        ficha,
        dia,
        ancoraDomingo,
        ehFeriado: nomeFeriado != null,
        deFerias: deFerias.has(ficha.colaboradorId),
        especial:
          especiais.get(`${ficha.colaboradorId}|${dia.getUTCDay()}`) ?? null,
        ocorrencia: ocorrencias.get(`${ficha.colaboradorId}|${iso}`) ?? null,
      }),
    );

    return {
      dataISO: iso,
      diaSemana: dia.getUTCDay(),
      ehFeriado: nomeFeriado != null,
      nomeFeriado,
      grupoFolgaDomingo:
        dia.getUTCDay() === 0 && ancoraDomingo
          ? grupoFolgaNoDomingo(dia, ancoraDomingo.data, ancoraDomingo.ordem)
          : null,
      totais: totaisEscala(linhas),
      secoes: agruparPorFuncao(linhas),
    };
  }

  /**
   * Escala publicada da semana (segunda a domingo) que contém `dataISO`.
   *
   * Carrega tudo uma vez para o intervalo inteiro: sete dias não podem custar
   * sete vezes o mesmo trabalho de banco.
   */
  async escalaDaSemana(dataISO: string): Promise<EscalaSemanaPublicada> {
    const diasISO = semanaDe(dataISO);
    const inicio = diaUTC(diasISO[0]);
    const fimExclusivo = new Date(diaUTC(diasISO[6]));
    fimExclusivo.setUTCDate(fimExclusivo.getUTCDate() + 1);

    const [fichas, ancoraDomingo, feriados, especiais] = await Promise.all([
      this.fichas(),
      this.ancora(),
      this.feriadosDoPeriodo(inicio, fimExclusivo),
      this.especiais(),
    ]);
    const ids = fichas.map((f) => f.colaboradorId);
    const ocorrencias = await this.ocorrencias(ids, inicio, fimExclusivo);
    // Férias são por dia: um conjunto por dia da semana.
    const feriasPorDia = new Map<string, Set<string>>();
    for (const iso of diasISO) {
      feriasPorDia.set(
        iso,
        this.ferias
          ? await this.ferias.colaboradoresDeFeriasNoDia(diaUTC(iso))
          : new Set<string>(),
      );
    }

    const dias: DiaSemanaEscala[] = diasISO.map((iso) => {
      const nome = feriados.get(iso) ?? null;
      return {
        dataISO: iso,
        diaSemana: diaUTC(iso).getUTCDay(),
        ehFeriado: nome != null,
        nomeFeriado: nome,
      };
    });

    const pessoas: PessoaSemanaEscala[] = fichas.map((ficha) => ({
      colaboradorId: ficha.colaboradorId,
      nome: ficha.nome,
      funcao: ficha.funcao,
      turno: ficha.turno,
      celulas: dias.map((d) => {
        const dia = diaUTC(d.dataISO);
        const linha = montarLinhaEscala({
          ficha,
          dia,
          ancoraDomingo,
          ehFeriado: d.ehFeriado,
          deFerias:
            feriasPorDia.get(d.dataISO)?.has(ficha.colaboradorId) ?? false,
          especial:
            especiais.get(`${ficha.colaboradorId}|${dia.getUTCDay()}`) ?? null,
          ocorrencia:
            ocorrencias.get(`${ficha.colaboradorId}|${d.dataISO}`) ?? null,
        });
        return {
          status: linha.status,
          entrada: linha.entrada,
          saida: linha.saida,
        };
      }),
    }));

    // Na grade semanal a ordem é por NOME dentro de cada função: a pessoa vem
    // procurar a própria linha. Ordenar por hora de entrada (como no dia) não
    // serviria: a hora muda de dia para dia, então a lista não teria ordem
    // estável nenhuma.
    const secoes = ORDEM_FUNCOES.map((funcao) => ({
      funcao,
      pessoas: pessoas
        .filter((p) => p.funcao === funcao)
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    })).filter((s) => s.pessoas.length > 0);

    return {
      inicioISO: diasISO[0],
      fimISO: diasISO[6],
      dias,
      secoes,
    };
  }
}
