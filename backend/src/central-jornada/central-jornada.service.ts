import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
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
  diaPagaAdicional100,
  StatusJornadaPonto,
} from '../ponto/ponto.domain';
import {
  ConfiancaAnalise,
  MarcacaoCanonica,
  SEQUENCIA_MARCACOES,
  analisarMarcacoesDoDia,
  descreverFaltantes,
  horaMarcacaoHHmm,
} from '../ponto/marcacoes-invalidas.domain';
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
  /**
   * Dias de ausência que **não** são atestado (falta simples ou com débito).
   * Atestado médico é ausência abonada e tem o seu próprio contador
   * (`atestados`): antes os dois somavam aqui, e o número de faltas da Central
   * acabava acusando quem havia apresentado atestado.
   */
  faltas: number;
  /** Dias de atestado médico (abonados). As horas correspondentes vão em `horasAtestadoMs`. */
  atestados: number;
  diasTac: number;
  /** Dias com conflito: bateu ponto E tem uma ausência marcada no mesmo dia. */
  conflitos: number;
  /** Dias em que a entrada foi além da tolerância do turno (atraso). */
  atrasos: number;
  /** Saldo (banco de horas) = extras (50+100) − horas que deve. 1h = 1h. */
  saldoMs: number;
  /**
   * Saldo das horas 50% = extras 50% acumuladas − o que a pessoa deve. **Pode
   * ficar negativo** (deve mais do que tem de 50%).
   *
   * É o número exibido como "saldo" na card da pessoa. As 100% ficam FORA de
   * propósito: elas nunca são debitadas (regra 6) e já têm o seu próprio chip
   * `+100%`, então somá-las ao saldo misturava duas moedas diferentes — uma
   * que o débito consome e outra que não — e escondia quem estava devendo.
   *
   * É o mesmo valor que `extras50AtualMs − horasDevidasAtualMs`, só que sem o
   * piso 0 dos dois: aqui o sinal importa, porque é ele que pinta o saldo de
   * verde ou vermelho na tela.
   */
  saldo50Ms: number;
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
    /** Dias de ausência que não são atestado. */
    faltas: number;
    /** Dias de atestado médico (abonados). */
    atestados: number;
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

/**
 * Um dia com MARCAÇÕES INVÁLIDAS (relatório de ajuste do ponto): quantas
 * marcações faltam naquele dia daquela pessoa e **quais**, com as horas que
 * foram registradas para o gestor conferir o comprovante antes de ajustar.
 *
 * Diferente do `InconsistenciaItem` (que só diz "jornada incompleta"), aqui os
 * tipos faltantes vêm estruturados e a entrada esquecida é identificada como
 * tal — ver `analisarMarcacoesDoDia` em
 * [`ponto/marcacoes-invalidas.domain`](../ponto/marcacoes-invalidas.domain.ts).
 */
export interface MarcacaoInvalidaItem {
  colaboradorId: string;
  nome: string;
  primeiroNome: string;
  funcao: FuncaoColaborador;
  /** Dia (ISO) da ocorrência. */
  data: string;
  diaSemana: number;
  ehFeriado: boolean;
  /** Horário de entrada esperado pela escala ("HH:mm"), quando há turno. */
  entradaPrevista: string | null;
  /** Horas das marcações registradas no dia ("HH:mm"), em ordem cronológica. */
  horasRegistradas: string[];
  /** Marcações que o dia deveria ter (4). */
  esperadas: number;
  /** Marcações efetivamente registradas. */
  registradas: number;
  /** Quantas faltam. */
  quantidadeFaltante: number;
  /** QUAIS faltam, na ordem do dia. */
  tiposFaltantes: MarcacaoCanonica[];
  /** Como as registradas foram interpretadas, na ordem do dia. */
  tiposPresentes: MarcacaoCanonica[];
  /** `BAIXA` quando o resultado é a hipótese mais provável e pede conferência. */
  confianca: ConfiancaAnalise;
  /** Por que precisa de conferência (só quando `confianca` é `BAIXA`). */
  observacao: string | null;
  /** Frase pronta do que falta ("Falta registrar: entrada"). */
  detalhe: string;
  /**
   * Horas lançadas como DEVIDAS neste dia. Um registro incompleto derruba o
   * trabalhado do dia, e o déficit contra a carga-base vira hora devida — por
   * isso o número aparece aqui: é o custo de deixar a marcação sem ajustar.
   * O cálculo em si não muda (segue a regra do módulo); o relatório apenas o
   * torna visível.
   */
  devidasMs: number;
}

/**
 * Um dia de ausência de uma pessoa no ciclo (detalhe do ranking de faltas).
 *
 * `tipo` distingue a falta simples da marcada como **débito de horas**. Atestado
 * não entra aqui: é ausência abonada, tem contador próprio e detalhe próprio
 * (`DiaAtestadoRanking`).
 */
export interface DiaFaltaRanking {
  data: string;
  diaSemana: number;
  ehFeriado: boolean;
  tipo: 'FALTA' | 'FALTA_DEBITO';
  /** true quando a falta está marcada como débito de horas (efetivo). */
  debito: boolean;
  /** Horas lançadas como devidas por esta falta. */
  devidasMs: number;
}

/**
 * Um dia de atestado médico (detalhe do ranking de atestados). É ausência
 * **abonada**: não gera hora devida e as horas do dia são pagas — por isso
 * `horasAbonadasMs` (a carga-base daquele dia) em vez de horas devidas.
 */
export interface DiaAtestadoRanking {
  data: string;
  diaSemana: number;
  ehFeriado: boolean;
  /** Carga-base do dia, abonada pelo atestado. */
  horasAbonadasMs: number;
}

/** Um dia com atraso na entrada (detalhe do ranking de atrasos). */
export interface DiaAtrasoRanking {
  data: string;
  diaSemana: number;
  /** Minutos totais de atraso além da tolerância do turno. */
  minutos: number;
  /** Horário de entrada esperado pela escala ("HH:mm"), quando há turno. */
  entradaPrevista: string | null;
}

/** Um dia em TAC e o(s) motivo(s) (detalhe do ranking de TAC). */
export interface DiaTacRanking {
  data: string;
  diaSemana: number;
  ehFeriado: boolean;
  /** Por que o dia é TAC (excesso de extras, intervalo fora da faixa...). */
  motivos: string[];
}

/** Um dia com conflito ponto↔ausência (detalhe do ranking de conflitos). */
export interface DiaConflitoRanking {
  data: string;
  diaSemana: number;
  /** Motivo da ausência lançada no mesmo dia em que houve batida. */
  motivoJustificativa: string | null;
  statusJustificativa: string;
  debito: boolean;
}

/**
 * Uma pessoa no ranking do time: o **mesmo resumo** exibido na Central
 * (`CentralPessoaResumo`, calculado pela mesma função) mais o **detalhe dia a
 * dia** dos seus problemas no ciclo.
 *
 * Herdar o resumo inteiro é deliberado: garante que os números do ranking sejam,
 * por construção, os mesmos das cards da Central (não há segundo cálculo que
 * possa divergir) e permite abrir o detalhe diário da pessoa direto do ranking,
 * que já recebe `CentralPessoaResumo`.
 *
 * As horas extras não têm detalhe por dia: ali o número **é** a informação.
 */
export interface RankingPessoa extends CentralPessoaResumo {
  faltasDetalhe: DiaFaltaRanking[];
  atestadosDetalhe: DiaAtestadoRanking[];
  atrasosDetalhe: DiaAtrasoRanking[];
  tacDetalhe: DiaTacRanking[];
  conflitosDetalhe: DiaConflitoRanking[];
}

/**
 * Base dos rankings do time no ciclo. **Uma única resposta** serve às seis
 * métricas do "Resumo do time" (extras 50%, extras 100%, faltas, atrasos, TAC e
 * conflitos): a ordenação é apresentação e fica na tela; aqui vão os números e
 * o detalhe, sem contrato diferente por métrica.
 */
export interface CentralRankings {
  periodo: CentralPeriodo;
  pessoas: RankingPessoa[];
}

/** Relatório de marcações inválidas do ciclo (26→25). */
export interface CentralMarcacoesInvalidas {
  periodo: CentralPeriodo;
  totais: {
    /** Dias com marcação faltante no ciclo. */
    dias: number;
    /** Quantas pessoas distintas têm pelo menos um dia a ajustar. */
    pessoas: number;
    /** Total de marcações faltantes (soma de `quantidadeFaltante`). */
    marcacoesFaltantes: number;
    /** Dias em que falta exatamente uma marcação. */
    faltaUma: number;
    /** Dias em que faltam exatamente duas. */
    faltamDuas: number;
    /** Dias em que faltam três ou mais. */
    faltamTresOuMais: number;
    /** Dias com `confianca: 'BAIXA'` (precisam de conferência humana). */
    aConferir: number;
    /** Quantos dias têm cada tipo de marcação faltando. */
    porTipo: Record<MarcacaoCanonica, number>;
    /** Horas devidas acumuladas nos dias com marcação faltante. */
    devidasMs: number;
    /**
     * Dias deixados FORA da lista por já terem um **não retorno do intervalo**
     * registrado. Não é marcação esquecida: a pessoa saiu e não voltou (ver
     * regra 12). Aparece como contagem para o gestor saber que existem e onde
     * tratá-los, em vez de sumirem em silêncio.
     */
    naoRetornosExcluidos: number;
  };
  itens: MarcacaoInvalidaItem[];
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
    /** Dias de ausência que não são atestado. */
    faltas: number;
    /** Dias de atestado médico (abonados). */
    atestados: number;
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
    let atestados = 0;
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
      // Domingo e feriado pagam a carga cumprida e NUNCA geram hora devida —
      // nem por déficit (trabalhou abaixo da base), nem por falta lançada como
      // débito. Vale para os dois casos tratados abaixo.
      const diaGeraDebito = !diaPagaAdicional100(diaSemana, ehFeriado, regras);

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
        // Déficit: só em dias já COMPLETOS (não conta o dia em andamento) e
        // apenas em dias que geram débito (ver `diaGeraDebito` acima). Sem essa
        // guarda, um domingo de 6h contra a base de 7h20 lançava 1h20 de débito
        // que depois consumia as extras de 50% dos outros dias (via
        // `extras50AtualMs` e `saldoMs`).
        let devidasDia = 0;
        if (diaGeraDebito && diaCompleto && j.trabalhadoMs < baseMs) {
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
        let tipo: CentralDiaDetalhe['tipo'] = 'FALTA';
        let devidasDia = 0;
        // Faltar num domingo/feriado (mesmo escalado, fora da folga do rodízio)
        // fica apenas como AUSENTE: são dias que não geram hora devida, então o
        // débito não se aplica. `marcarDebito` já recusa a marcação; esta guarda
        // também neutraliza registros marcados antes desta regra.
        const debitoValido = ausencia.debitoHoras && diaGeraDebito;
        if (ausencia.motivoJustificativa === 'ATESTADO_MEDICO') {
          // Atestado é ausência ABONADA e tem contador próprio: NÃO entra em
          // `faltas` (regra 11). Antes somava nos dois, e o número de faltas da
          // Central acusava quem havia apresentado atestado.
          atestados += 1;
          horasAtestadoMs += baseMs;
          tipo = 'ATESTADO';
        } else {
          faltas += 1;
          if (debitoValido) {
            horasDevidasMs += baseMs;
            devidasDia = baseMs;
            tipo = 'FALTA_DEBITO';
          }
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
            // Débito EFETIVO (não o cru do banco): num domingo/feriado o dia
            // não deve aparecer como debitado na tela.
            debito: debitoValido,
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
    // Saldo só das 50% (com sinal): é o "saldo" da card. As 100% não entram —
    // nunca são debitadas e têm chip próprio.
    const saldo50Ms = extras50Ms - horasDevidasMs;
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
        atestados,
        diasTac,
        conflitos,
        atrasos,
        saldoMs,
        saldo50Ms,
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
        atestados: acc.atestados + p.atestados,
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
        atestados: 0,
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
   * Base dos RANKINGS do time no ciclo — o que abre ao tocar numa card do
   * "Resumo do time" da Central (extras 50%, extras 100%, faltas, atrasos, TAC
   * ou conflitos).
   *
   * Devolve **uma única resposta para as seis métricas**: por pessoa, o mesmo
   * `CentralPessoaResumo` das cards mais o detalhe dia a dia dos seus problemas.
   * Duas razões para ser assim, e não um endpoint por métrica:
   *
   * - **os números não podem divergir.** O resumo vem de `calcularPessoa`, a
   *   mesma função que alimenta a Central; não há segundo cálculo capaz de
   *   discordar da card que o usuário acabou de tocar;
   * - **uma passada só pelo ciclo** serve as seis telas, e o contrato fica
   *   estável (sem união de formatos por métrica).
   *
   * A **ordenação é apresentação** e fica na tela: cada métrica ordena do maior
   * para o menor pelo seu próprio campo. Aqui as pessoas saem em ordem
   * alfabética (como `carregarCiclo` as traz).
   *
   * As horas extras não têm detalhe por dia — ali o número é a informação.
   */
  async rankingsCiclo(deslocamento = 0): Promise<CentralRankings> {
    const dados = await this.carregarCiclo(deslocamento);
    const batidas = dados.batidas as BatidaMin[];

    const pessoas: RankingPessoa[] = await Promise.all(
      dados.pessoas.map(async (c) => {
        const regras = await this.regrasDe(c.tipoContratoJornadaId);
        const { resumo, dias } = this.calcularPessoa(
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
        );

        // Cada detalhe abaixo é a lista dos dias que geraram o contador
        // correspondente do resumo — por isso o tamanho de cada array é igual ao
        // número exibido na card (garantido por teste).
        const faltasDetalhe: DiaFaltaRanking[] = dias
          .filter((d) => d.tipo === 'FALTA' || d.tipo === 'FALTA_DEBITO')
          .map((d) => ({
            data: d.data,
            diaSemana: d.diaSemana,
            ehFeriado: d.ehFeriado,
            tipo: d.tipo as DiaFaltaRanking['tipo'],
            debito: d.debito ?? false,
            devidasMs: d.devidasMs,
          }));

        const atestadosDetalhe: DiaAtestadoRanking[] = dias
          .filter((d) => d.tipo === 'ATESTADO')
          .map((d) => ({
            data: d.data,
            diaSemana: d.diaSemana,
            ehFeriado: d.ehFeriado,
            // O atestado abona a carga-base do dia (não gera hora devida).
            horasAbonadasMs: d.baseMs,
          }));

        const atrasosDetalhe: DiaAtrasoRanking[] = dias
          .filter((d) => d.atrasoMinutos != null)
          .map((d) => ({
            data: d.data,
            diaSemana: d.diaSemana,
            minutos: d.atrasoMinutos as number,
            entradaPrevista: d.entradaPrevista ?? null,
          }));

        const tacDetalhe: DiaTacRanking[] = dias
          .filter((d) => d.tac)
          .map((d) => ({
            data: d.data,
            diaSemana: d.diaSemana,
            ehFeriado: d.ehFeriado,
            motivos: d.motivosTac,
          }));

        const conflitosDetalhe: DiaConflitoRanking[] = dias
          .filter((d) => d.conflitoAusencia)
          .map((d) => ({
            data: d.data,
            diaSemana: d.diaSemana,
            motivoJustificativa: d.conflitoAusencia!.motivoJustificativa,
            statusJustificativa: d.conflitoAusencia!.statusJustificativa,
            debito: d.conflitoAusencia!.debito,
          }));

        return {
          colaboradorId: c.id,
          nome: c.nome,
          primeiroNome: primeiroNome(c.nome),
          funcao: c.funcao,
          ...resumo,
          faltasDetalhe,
          atestadosDetalhe,
          atrasosDetalhe,
          tacDetalhe,
          conflitosDetalhe,
        };
      }),
    );

    return {
      periodo: this.montarPeriodo(dados.periodo, deslocamento),
      pessoas,
    };
  }

  /**
   * Relatório de MARCAÇÕES INVÁLIDAS do ciclo — a lista de trabalho de quem vai
   * **ajustar o ponto**. Para cada dia já encerrado em que o registro ficou
   * incompleto, diz quantas marcações faltam e **quais** (entrada, saída para o
   * intervalo, retorno ou encerramento), com as horas registradas ao lado.
   *
   * Por que é um relatório separado do painel de inconsistências:
   * - o painel mistura cinco naturezas de problema (incompleta, duplicada,
   *   conflito, atraso, TAC) e, para as incompletas, só devolve a frase
   *   posicional de `calcularJornadaDia` — que nunca acusa a **entrada**
   *   esquecida, porque a classificação por ordem a encobre;
   * - aqui cada dia passa por `analisarMarcacoesDoDia`, que confronta a 1ª
   *   batida com o turno da escala para saber se ela pode mesmo ser a entrada, e
   *   devolve os tipos faltantes estruturados + o grau de confiança.
   *
   * Só entram dias `INCOMPLETO`: dias sem nenhuma batida são falta/folga (outro
   * fluxo) e a jornada curta válida de duas batidas (até 4h50 em contrato sem
   * intervalo obrigatório) é um dia **completo** — incluí-la encheria o
   * relatório de falso positivo.
   *
   * **Dias com não retorno do intervalo também ficam fora** (regra 12): ali a
   * pessoa saiu e não voltou, o que é uma **incidência de conduta**, não uma
   * marcação esquecida — não há batida a "ajustar". Eles são contados em
   * `totais.naoRetornosExcluidos` para não desaparecerem em silêncio.
   *
   * Os filtros por pessoa/tipo ficam na tela (a lista do ciclo é leve).
   */
  async marcacoesInvalidasCiclo(
    deslocamento = 0,
  ): Promise<CentralMarcacoesInvalidas> {
    const dados = await this.carregarCiclo(deslocamento);
    const batidas = dados.batidas as BatidaMin[];
    const naoRetornos = await this.carregarNaoRetornos(
      dados.inicio,
      dados.fimExclusivo,
    );
    const itens: MarcacaoInvalidaItem[] = [];
    let naoRetornosExcluidos = 0;

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

      // Horas das batidas da pessoa por dia — o relatório mostra as marcações
      // que existem, não só as que faltam (é o que permite conferir e ajustar).
      const horasPorDia = new Map<string, Date[]>();
      for (const b of batidas) {
        if (!this.daPessoa(b, ids)) continue;
        const k = inicioDoDia(b.data).toISOString();
        const arr = horasPorDia.get(k) ?? [];
        arr.push(b.hora);
        horasPorDia.set(k, arr);
      }

      // Dias em que ESTA pessoa tem não retorno do intervalo registrado.
      const diasComNaoRetorno = new Set(
        naoRetornos
          .filter(
            (i) =>
              ids.has(i.colaboradorId) ||
              (i.funcionarioId !== null && ids.has(i.funcionarioId)),
          )
          .map((i) => inicioDoDia(i.data).toISOString()),
      );

      for (const d of dias) {
        if (d.tipo !== 'INCOMPLETO') continue;
        // A pessoa saiu para o intervalo e não voltou: é incidência de conduta,
        // não marcação esquecida — não há batida a ajustar (regra 12).
        if (diasComNaoRetorno.has(d.data)) {
          naoRetornosExcluidos += 1;
          continue;
        }
        const horas = [...(horasPorDia.get(d.data) ?? [])].sort(
          (a, b) => a.getTime() - b.getTime(),
        );
        const analise = analisarMarcacoesDoDia(
          horas,
          d.entradaPrevista ?? null,
          regras,
        );
        // Guarda: um dia INCOMPLETO tem sempre de 1 a 3 marcações, mas se a
        // análise não encontrar nada faltando, não há o que ajustar.
        if (analise.quantidadeFaltante === 0) continue;
        itens.push({
          colaboradorId: c.id,
          nome: c.nome,
          primeiroNome: primeiroNome(c.nome),
          funcao: c.funcao,
          data: d.data,
          diaSemana: d.diaSemana,
          ehFeriado: d.ehFeriado,
          entradaPrevista: d.entradaPrevista ?? null,
          horasRegistradas: horas.map(horaMarcacaoHHmm),
          esperadas: analise.esperadas,
          registradas: analise.registradas,
          quantidadeFaltante: analise.quantidadeFaltante,
          tiposFaltantes: analise.tiposFaltantes,
          tiposPresentes: analise.tiposPresentes,
          confianca: analise.confianca,
          observacao: analise.observacao,
          detalhe: descreverFaltantes(analise.tiposFaltantes),
          devidasMs: d.devidasMs,
        });
      }
    }

    // Mais recentes primeiro; empate por nome.
    itens.sort((a, b) =>
      a.data === b.data
        ? a.nome.localeCompare(b.nome)
        : b.data.localeCompare(a.data),
    );

    const porTipo = SEQUENCIA_MARCACOES.reduce(
      (acc, tipo) => {
        acc[tipo] = itens.filter((i) => i.tiposFaltantes.includes(tipo)).length;
        return acc;
      },
      {} as Record<MarcacaoCanonica, number>,
    );

    return {
      periodo: this.montarPeriodo(dados.periodo, deslocamento),
      totais: {
        dias: itens.length,
        pessoas: new Set(itens.map((i) => i.colaboradorId)).size,
        marcacoesFaltantes: itens.reduce((s, i) => s + i.quantidadeFaltante, 0),
        faltaUma: itens.filter((i) => i.quantidadeFaltante === 1).length,
        faltamDuas: itens.filter((i) => i.quantidadeFaltante === 2).length,
        faltamTresOuMais: itens.filter((i) => i.quantidadeFaltante >= 3).length,
        aConferir: itens.filter((i) => i.confianca === 'BAIXA').length,
        porTipo,
        devidasMs: itens.reduce((s, i) => s + i.devidasMs, 0),
        naoRetornosExcluidos,
      },
      itens,
    };
  }

  /**
   * Não-retornos do intervalo registrados no período (automáticos ou lançados à
   * mão pelo gestor). Consulta própria — e não um campo de `carregarCiclo` —
   * para não cobrar esta leitura das outras quatro varreduras do ciclo, que não
   * precisam dela. Coberta pelo índice `[tipo, data]` de `incidencias_escala`.
   */
  private async carregarNaoRetornos(
    inicio: Date,
    fimExclusivo: Date,
  ): Promise<
    { colaboradorId: string; funcionarioId: string | null; data: Date }[]
  > {
    return this.prisma.incidenciaEscala.findMany({
      where: {
        tipo: 'NAO_RETORNO_INTERVALO',
        data: { gte: inicio, lt: fimExclusivo },
      },
      select: { colaboradorId: true, funcionarioId: true, data: true },
    });
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
        atestados: acc.atestados + p.atestados,
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
        atestados: 0,
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
   *
   * Domingo e feriado NÃO aceitam débito: são dias pagos pela carga cumprida,
   * que não geram hora devida (regra 4 do módulo). Faltar num domingo escalado
   * (fora da folga do rodízio) fica apenas como AUSENTE. A marcação é recusada
   * com erro — e não aceita-e-ignorada — para o gestor saber que não se aplica.
   * Desmarcar (`debito = false`) é sempre permitido, inclusive para limpar
   * registros marcados antes desta regra.
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
    if (debito) {
      const ehFeriado = await this.feriados.ehFeriado(ausencia.data);
      const colaborador = ausencia.colaboradorId
        ? await this.prisma.colaborador.findUnique({
            where: { id: ausencia.colaboradorId },
            select: { tipoContratoJornadaId: true },
          })
        : null;
      const regras = await this.regrasDe(colaborador?.tipoContratoJornadaId);
      if (diaPagaAdicional100(ausencia.data.getUTCDay(), ehFeriado, regras)) {
        throw new BadRequestException(
          ehFeriado
            ? 'Feriado não gera hora devida: a falta fica apenas como ausência.'
            : 'Domingo não gera hora devida: a falta fica apenas como ausência.',
        );
      }
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
