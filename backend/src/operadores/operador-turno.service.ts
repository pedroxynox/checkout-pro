import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Colaborador, OperadorTurno, TurnoColaborador } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import {
  analisarFaltas,
  type AnaliticaFaltasDetalhe,
  type FaltasOperadorDetalhe,
} from './operadores.domain';
import { StatusJustificativa } from '../common/justificativas';
import { EscalaDomingoService } from '../escala-domingo/escala-domingo.service';
import { FolgaService } from '../escala-domingo/folga.service';
import { FeriasService } from '../ferias/ferias.service';
import { FeriadosService } from '../feriados/feriados.service';
import {
  GrupoDomingo,
  grupoFolgaNoDomingo,
} from '../escala-domingo/escala-domingo.domain';
import {
  FichaColaboradorEscala,
  LinhaEscala,
  montarLinhaEscala,
} from '../escala-exportacao/escala-publicada.domain';

/**
 * Estado de uma célula da grade semanal. `FERIAS` existe porque a grade é um
 * calendário por pessoa: as férias podem cobrir só parte da semana, então a
 * linha não pode simplesmente desaparecer — o dia é marcado. No roster de UM
 * dia a pessoa sai da lista (paridade com a escala de fiscais).
 */
export type StatusCelula =
  'TRABALHA' | 'FOLGA' | 'FALTA' | 'ATESTADO' | 'FERIAS';

export interface GradeCelula {
  diaSemana: number;
  data: string;
  status: StatusCelula;
  entrada: string | null;
  saida: string | null;
  /** Id da ausência (quando FALTA), para permitir remover. */
  ausenciaId: string | null;
}

export interface GradeOperador {
  id: string;
  nome: string;
  folgaDiaSemana: number;
  celulas: GradeCelula[];
}

export interface GradeCobertura {
  diaSemana: number;
  data: string;
  trabalhando: number;
  folgas: number;
  faltas: number;
}

export interface GradeSemana {
  inicio: string;
  hojeISO: string;
  dias: { diaSemana: number; data: string }[];
  operadores: GradeOperador[];
  cobertura: GradeCobertura[];
}

/** Operador presente/ausente na franja atual. */
export interface OperadorAgora {
  nome: string;
  entrada: string;
  saida: string;
}

/** Tablero "ao vivo": quem deveria estar no caixa agora. */
export interface AoVivoOperadores {
  horaLocal: string;
  dataISO: string;
  diaSemana: number;
  /** Quantos deveriam estar agora e estão no caixa (não faltaram nem estão sem retorno). */
  disponiveis: number;
  /** Quantos deveriam estar agora mas faltaram. */
  faltas: number;
  /** Quantos saíram para o intervalo e não retornaram (também não estão no caixa). */
  semRetorno: number;
  /** Total escalado para esta franja (disponíveis + faltas + sem retorno). */
  esperados: number;
  listaDisponiveis: OperadorAgora[];
  listaFaltantes: OperadorAgora[];
  listaSemRetorno: OperadorAgora[];
}

export interface FaltasPorDiaSemana {
  diaSemana: number;
  nome: string;
  quantidade: number;
}

// A analítica de faltas agora é inteligente (taxa %, padrões, tendência e
// risco). A forma vem do domínio puro `analisarFaltas`.
export type FaltasPorOperador = FaltasOperadorDetalhe;
export type AnaliticaFaltas = AnaliticaFaltasDetalhe;

/** Um colaborador no roster de um dia. */
export interface ColaboradorDia {
  id: string;
  nome: string;
  genero: string | null;
  /**
   * Turno fixo do colaborador, conforme o Cadastro (ABERTURA/INTERMEDIARIO/
   * FECHAMENTO/APOIO). É a fonte oficial para agrupar a escala por turno.
   * `null` quando o colaborador ainda não tem turno definido no cadastro.
   */
  turno: TurnoColaborador | null;
  status: StatusCelula;
  entrada: string | null;
  saida: string | null;
  ausenciaId: string | null;
  /** CID do atestado (quando status = ATESTADO e há CID); senão null. */
  cid: string | null;
  /**
   * Período do atestado (primeiro e último dia, ISO yyyy-mm-dd) quando a falta
   * está vinculada a um atestado; senão null. Deriva do `Atestado` ligado por
   * `atestadoId` — para a escala mostrar "de … até …" ao lado do nome/CID.
   */
  atestadoInicio: string | null;
  atestadoFim: string | null;
  /** Estado da justificativa da falta (só quando status = FALTA/ATESTADO). */
  statusJustificativa: StatusJustificativa | null;
  /** Quem justificou a falta (auditoria), quando aplicável. */
  justificadaPorNome: string | null;
  /**
   * true quando a falta faz parte de uma AUSÊNCIA A PRAZO (período do gestor):
   * um fiscal não pode desmarcá-la na escala.
   */
  aPrazo: boolean;
}

/** Roster de um dia: colaboradores ordenados por entrada (folga ao fim). */
export interface DiaOperadores {
  dataISO: string;
  diaSemana: number;
  trabalhando: number;
  folgas: number;
  faltas: number;
  /** Colaboradores do dia com ATESTADO (falta justificada por atestado médico). */
  atestados: number;
  colaboradores: ColaboradorDia[];
  /**
   * Só no domingo: grupo que FOLGA nesse domingo pelo rodízio (G1/G2/G3), ou
   * null quando não é domingo ou o rodízio ainda não foi configurado.
   */
  grupoFolgaDomingo: GrupoDomingo | null;
}

const NOMES_DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Cobertura mínima desejada por dia (abaixo disso, alerta). */
const COBERTURA_MINIMA = 20;

/** "HH:mm" -> minutos desde a meia-noite; null se inválido. */
function horaMin(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Data/hora atuais no fuso de Brasília (America/Sao_Paulo). */
function agoraBrasilia(): {
  dataISO: string;
  hora: number;
  minuto: number;
  diaSemana: number;
} {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string): string =>
    partes.find((p) => p.type === t)?.value ?? '00';
  const ano = get('year');
  const mes = get('month');
  const dia = get('day');
  let hora = parseInt(get('hour'), 10);
  if (hora === 24) hora = 0;
  const minuto = parseInt(get('minute'), 10);
  const dataISO = `${ano}-${mes}-${dia}`;
  const diaSemana = new Date(`${dataISO}T00:00:00.000Z`).getUTCDay();
  return { dataISO, hora, minuto, diaSemana };
}

/** Início da semana (segunda-feira, 00:00 UTC) que contém a data. */
function inicioDaSemana(data: Date): Date {
  const d = new Date(
    Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()),
  );
  const dow = d.getUTCDay(); // 0=Dom..6=Sáb
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function addDias(data: Date, dias: number): Date {
  const d = new Date(data);
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

function iso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/**
 * Adapta um Colaborador (Cadastro Unificado) ao formato OperadorTurno que o
 * quadro/escala consome. A escala passa a vir dos colaboradores cadastrados;
 * o OperadorTurno antigo fica OCULTO (não é mais lido aqui). Horários ausentes
 * viram "" e a folga ausente vira -1 (nunca casa um dia da semana).
 */
type OperadorEscala = OperadorTurno & { turno: TurnoColaborador | null };

/**
 * Ficha do operador como `montarLinhaEscala` a consome, mais o `genero` — que a
 * escala publicada não usa, mas o quadro mostra (tratamento por nome na tela).
 */
type FichaOperador = FichaColaboradorEscala & { genero: string | null };

function comoOperadorTurno(c: Colaborador): OperadorEscala {
  return {
    id: c.id,
    nome: c.nome,
    genero: c.genero,
    turno: c.turno ?? null,
    entradaSemana: c.entradaSemana ?? '',
    saidaSemana: c.saidaSemana ?? '',
    entradaFds: c.entradaFds ?? '',
    saidaFds: c.saidaFds ?? '',
    folgaDiaSemana: c.folgaDiaSemana ?? -1,
    ativo: c.ativo,
    criadoEm: c.criadoEm,
  };
}

/**
 * Quadro de Operadores: a tela de GESTÃO da escala dos operadores — grade
 * semanal, roster de um dia, tablero "ao vivo" e cobertura, com as ações de
 * falta/justificativa que a escala publicada (um documento) não tem.
 *
 * **Quem decide o que a pessoa faz no dia não é este serviço.** Isso é de
 * `montarLinhaEscala`, a mesma função que monta a escala publicada. Este
 * arquivo já teve a sua própria cópia da regra (um `fds ? entradaFds :
 * entradaSemana` local) e o preço apareceu três vezes: as férias não saíam do
 * quadro, a folga marcada só na escala semanal virava falta, e no feriado o
 * horário mostrado era o de dia útil em vez do de domingo. Cada divergência foi
 * um caso em que duas telas do mesmo app respondiam diferente à mesma pergunta.
 *
 * O que continua sendo daqui: recortar só `funcao: 'OPERADOR'`, enriquecer as
 * linhas com o que a gestão precisa (id da ausência, CID, período do atestado,
 * estado da justificativa) e as contagens/avisos. Ver
 * `coerencia-quadro-escala.spec.ts`, que prende as duas vistas juntas.
 */
@Injectable()
export class OperadorTurnoService {
  private readonly logger = new Logger(OperadorTurnoService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificacoes?: NotificacoesService,
    @Optional() private readonly escalaDomingo?: EscalaDomingoService,
    // Regra única de folga (ficha + escala semanal). Sem ela o quadro mantém a
    // regra antiga (só a ficha), que discordava da escala publicada.
    @Optional() private readonly folga?: FolgaService,
    // Férias (inativação não rígida): quem está de férias no dia sai do quadro,
    // como já acontecia na escala de fiscais. Opcional pelo mesmo motivo dos
    // anteriores — sem ele o quadro degrada ao comportamento antigo em vez de
    // quebrar. Fica no FIM da lista para não deslocar os parâmetros posicionais
    // usados pelos specs que constroem o serviço à mão.
    @Optional() private readonly ferias?: FeriasService,
    // Feriados: sem eles o quadro mostrava o horário de dia útil num feriado,
    // enquanto a escala publicada mostrava o de domingo (a regra correta). Como
    // os demais, entra no fim da lista de parâmetros.
    @Optional() private readonly feriados?: FeriadosService,
  ) {}

  /**
   * Fichas de férias no dia (`Set<colaboradorId>`). No quadro de operadores o
   * `id` de cada linha JÁ é o `Colaborador.id`, então a comparação é direta —
   * diferente da escala de fiscais, onde o fiscal bate ponto com outro id.
   *
   * Sem o serviço de férias devolve conjunto vazio (nada é excluído).
   */
  private async fichasDeFerias(dia: Date): Promise<Set<string>> {
    if (!this.ferias) return new Set<string>();
    return this.ferias.colaboradoresDeFeriasNoDia(dia);
  }

  /**
   * Fichas dos operadores ATIVOS no formato que `montarLinhaEscala` consome.
   *
   * É a mesma forma usada pela escala publicada, com uma diferença deliberada:
   * aqui o filtro é `funcao: 'OPERADOR'`. Este quadro é a tela de gestão dos
   * operadores; fiscais e supervisores continuam fora dele.
   */
  private async fichasOperadores(): Promise<FichaOperador[]> {
    const cols = await this.prisma.colaborador.findMany({
      where: { funcao: 'OPERADOR', ativo: true },
      orderBy: [
        { folgaDiaSemana: 'asc' },
        { entradaSemana: 'asc' },
        { nome: 'asc' },
      ],
    });
    return cols.map((c) => ({
      colaboradorId: c.id,
      nome: c.nome,
      funcao: 'OPERADOR' as const,
      turno: c.turno ?? null,
      genero: c.genero ?? null,
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
   * Tudo o que decidir "o que esta pessoa faz neste dia" precisa saber, carregado
   * UMA vez para um intervalo de dias.
   *
   * Existe para que o quadro pare de montar a sua própria resposta. Antes ele
   * decidia horário com um `fds ? entradaFds : entradaSemana` local, que não
   * conhecia feriado nem exceção de horário: o mesmo dia saía 08:00 aqui e
   * 07:00 na escala publicada. Agora as duas telas chamam
   * `montarLinhaEscala` com os mesmos ingredientes.
   */
  private async contextoEscala(dias: Date[]): Promise<{
    linha: (
      ficha: FichaColaboradorEscala,
      dia: Date,
      ehAtestado?: boolean | null,
    ) => LinhaEscala;
    grupoFolgaDomingo: (dia: Date) => GrupoDomingo | null;
  }> {
    const inicio = dias[0];
    const fimExclusivo = addDias(dias[dias.length - 1], 1);
    const [ancoraDomingo, consultorFolga, mapaFeriados] = await Promise.all([
      this.escalaDomingo ? this.escalaDomingo.obterAncora() : null,
      this.folga ? this.folga.consultor(dias) : null,
      this.feriados
        ? this.feriados.mapaNoPeriodo(inicio, fimExclusivo)
        : new Map<number, string>(),
    ]);
    // Férias por dia: um período pode cobrir só parte do intervalo, então a
    // pergunta é feita dia a dia (como já fazia a escala publicada).
    const feriasPorDia = new Map<number, Set<string>>();
    for (const dia of dias) {
      feriasPorDia.set(dia.getTime(), await this.fichasDeFerias(dia));
    }

    return {
      // `ehAtestado`: null/undefined = sem ausência no dia. O chamador carrega a
      // ausência (com justificativa, CID e período do atestado) e passa só o que
      // muda o STATUS; quem decide se a falta se aplica é `montarLinhaEscala` —
      // falta em dia de folga não existe.
      linha: (ficha, dia, ehAtestado) =>
        montarLinhaEscala({
          ficha,
          dia,
          ancoraDomingo,
          ehFeriado: mapaFeriados.has(dia.getTime()),
          deFerias:
            feriasPorDia.get(dia.getTime())?.has(ficha.colaboradorId) ?? false,
          deFolga: consultorFolga?.ehFolga(dia, [ficha.colaboradorId]) ?? false,
          ocorrencia: ehAtestado == null ? null : { ehAtestado },
        }),
      grupoFolgaDomingo: (dia) =>
        dia.getUTCDay() === 0 && ancoraDomingo
          ? grupoFolgaNoDomingo(dia, ancoraDomingo.data, ancoraDomingo.ordem)
          : null,
    };
  }

  // O antigo `operadoresNoDomingo` foi removido: ele resolvia o rodízio de
  // domingo à mão (e só o domingo). `montarLinhaEscala` já o resolve para
  // qualquer dia, via `entradaEsperadaNoDia`, então mantê-lo era manter uma
  // segunda regra que podia divergir da primeira.

  /**
   * Lista os operadores ATIVOS para a escala. Fonte: Cadastro Unificado de
   * Colaboradores (funcao OPERADOR). O OperadorTurno antigo fica oculto.
   */
  async listar(): Promise<OperadorEscala[]> {
    const cols = await this.prisma.colaborador.findMany({
      where: { funcao: 'OPERADOR', ativo: true },
      orderBy: [
        { folgaDiaSemana: 'asc' },
        { entradaSemana: 'asc' },
        { nome: 'asc' },
      ],
    });
    return cols.map((c) => comoOperadorTurno(c));
  }

  // Observação: a criação/edição/remoção de operadores agora é feita pelo
  // Cadastro Unificado de Colaboradores (funcao OPERADOR). Os antigos métodos
  // de escrita em `OperadorTurno` (salvar/importar/remover) foram removidos
  // por escreverem numa tabela que não é mais lida. A escala é 100% derivada
  // do colaborador.

  /**
   * Grade semanal (Seg–Sáb) a partir de uma data de referência. Para cada
   * operador e dia: FOLGA (dia da folga fixa), FALTA (ausência registrada) ou
   * TRABALHA (com o horário do dia — Sex/Sáb usam o horário de fim de semana).
   */
  async grade(dataRef: Date = new Date()): Promise<GradeSemana> {
    const segunda = inicioDaSemana(dataRef);
    const fimExclusivo = addDias(segunda, 6); // domingo (exclusivo)
    // Seg(1) .. Sáb(6) — 6 colunas.
    const dias = Array.from({ length: 6 }, (_, i) => {
      const d = addDias(segunda, i);
      return { diaSemana: d.getUTCDay(), data: iso(d) };
    });

    const fichas = await this.fichasOperadores();
    const ids = fichas.map((f) => f.colaboradorId);
    const ausencias =
      ids.length > 0
        ? await this.prisma.ausencia.findMany({
            where: {
              pessoaId: { in: ids },
              data: { gte: segunda, lt: fimExclusivo },
            },
            select: {
              id: true,
              pessoaId: true,
              data: true,
              atestadoId: true,
              motivoJustificativa: true,
            },
          })
        : [];
    // Guarda o id da ausência e se ela é um ATESTADO (mesma regra do roster
    // diário), para a célula mostrar "Atestado" e não "Falta".
    const mapaAusencia = new Map<string, { id: string; atestado: boolean }>();
    for (const a of ausencias) {
      mapaAusencia.set(`${a.pessoaId}|${iso(a.data)}`, {
        id: a.id,
        atestado:
          a.atestadoId != null || a.motivoJustificativa === 'ATESTADO_MEDICO',
      });
    }

    // Uma única fonte para "o que esta pessoa faz neste dia" — a mesma que a
    // escala publicada usa. Cobre folga (ficha + escala semanal), férias,
    // feriado e exceção de horário, que a lógica local daqui não conhecia.
    const ctx = await this.contextoEscala(
      dias.map((d) => new Date(`${d.data}T00:00:00.000Z`)),
    );

    const gradeOperadores: GradeOperador[] = fichas.map((ficha) => {
      const celulas: GradeCelula[] = dias.map((dia) => {
        const ausencia = mapaAusencia.get(`${ficha.colaboradorId}|${dia.data}`);
        const l = ctx.linha(
          ficha,
          new Date(`${dia.data}T00:00:00.000Z`),
          ausencia ? ausencia.atestado : null,
        );
        // A grade é um CALENDÁRIO: quem falta mantém a célula sem horário, para
        // a leitura da semana não confundir "faltou" com "trabalhou até tarde".
        const ausente = l.status === 'FALTA' || l.status === 'ATESTADO';
        return {
          diaSemana: dia.diaSemana,
          data: dia.data,
          status: l.status,
          entrada: ausente ? null : l.entrada,
          saida: ausente ? null : l.saida,
          ausenciaId: ausente ? (ausencia?.id ?? null) : null,
        };
      });
      return {
        id: ficha.colaboradorId,
        nome: ficha.nome,
        folgaDiaSemana: ficha.folgaDiaSemana ?? -1,
        celulas,
      };
    });

    const cobertura: GradeCobertura[] = dias.map((dia, idx) => {
      let trabalhando = 0;
      let folgas = 0;
      let faltas = 0;
      for (const op of gradeOperadores) {
        const c = op.celulas[idx];
        if (c.status === 'TRABALHA') trabalhando += 1;
        else if (c.status === 'FOLGA') folgas += 1;
        // FERIAS não entra em nenhuma conta: a pessoa não era esperada no dia,
        // então não é cobertura nem ausência. Somá-la a `faltas` (que também
        // conta ATESTADO) inflaria a leitura de problemas do dia.
        else if (c.status !== 'FERIAS') faltas += 1;
      }
      return {
        diaSemana: dia.diaSemana,
        data: dia.data,
        trabalhando,
        folgas,
        faltas,
      };
    });

    return {
      inicio: iso(segunda),
      hojeISO: iso(new Date()),
      dias,
      operadores: gradeOperadores,
      cobertura,
    };
  }

  /**
   * Roster de um único dia: cada colaborador com o horário do dia (Sex/Sáb usam
   * o de fim de semana), o status (trabalha/folga/falta) e a ausência (se
   * houver). Ordenado por hora de ENTRADA (folga ao fim). Padrão: hoje.
   */
  async diaOperadores(dataRef?: Date): Promise<DiaOperadores> {
    const dataISO = dataRef
      ? dataRef.toISOString().slice(0, 10)
      : agoraBrasilia().dataISO;
    const diaInicio = new Date(`${dataISO}T00:00:00.000Z`);
    const diaSemana = diaInicio.getUTCDay();
    const diaFim = addDias(diaInicio, 1);

    const fichas = await this.fichasOperadores();
    const ids = fichas.map((f) => f.colaboradorId);

    const ausencias =
      ids.length > 0
        ? await this.prisma.ausencia.findMany({
            where: {
              pessoaId: { in: ids },
              data: { gte: diaInicio, lt: diaFim },
            },
            select: {
              id: true,
              pessoaId: true,
              statusJustificativa: true,
              justificadaPorNome: true,
              aPrazo: true,
              atestadoId: true,
              motivoJustificativa: true,
              cid: true,
            },
          })
        : [];
    const mapaAus = new Map(ausencias.map((a) => [a.pessoaId, a]));
    // Período dos atestados ligados às faltas do dia — para a escala mostrar
    // "de … até …" ao lado do nome/CID. Uma única consulta pelos ids ligados.
    const atestadoIds = [
      ...new Set(
        ausencias
          .map((a) => a.atestadoId)
          .filter((id): id is string => id != null),
      ),
    ];
    const atestados = atestadoIds.length
      ? await this.prisma.atestado.findMany({
          where: { id: { in: atestadoIds } },
          select: { id: true, inicio: true, fim: true },
        })
      : [];
    const mapaAtestado = new Map(
      atestados.map((a) => [
        a.id,
        {
          inicio: a.inicio.toISOString().slice(0, 10),
          fim: a.fim.toISOString().slice(0, 10),
        },
      ]),
    );
    // Mesma fonte da escala publicada. Ela já resolve folga (ficha + escala
    // semanal), férias, rodízio de domingo, feriado (que segue o horário de
    // domingo) e exceção de horário — tudo o que este método decidia sozinho.
    const ctx = await this.contextoEscala([diaInicio]);

    const colaboradores: ColaboradorDia[] = [];
    for (const ficha of fichas) {
      const aus = mapaAus.get(ficha.colaboradorId) ?? null;
      // Atestado = falta vinculada a um atestado (ou motivo ATESTADO_MEDICO,
      // cobrindo também a ausência a prazo lançada como atestado).
      const ehAtestado =
        !!aus &&
        (aus.atestadoId != null ||
          aus.motivoJustificativa === 'ATESTADO_MEDICO');
      const l = ctx.linha(ficha, diaInicio, aus ? ehAtestado : null);

      // Roster de UM dia: quem está de férias SAI da lista, como já acontecia na
      // escala de fiscais. (Na grade semanal a célula é marcada `FERIAS`, porque
      // lá o formato é calendário e a linha não pode desaparecer.)
      if (l.status === 'FERIAS') continue;

      const ausenteDeVerdade = l.status === 'FALTA' || l.status === 'ATESTADO';
      const atestado = aus?.atestadoId
        ? (mapaAtestado.get(aus.atestadoId) ?? null)
        : null;
      colaboradores.push({
        id: ficha.colaboradorId,
        nome: ficha.nome,
        genero: ficha.genero,
        turno: ficha.turno as TurnoColaborador | null,
        status: l.status,
        entrada: l.entrada,
        saida: l.saida,
        // Os campos de ausência só aparecem quando a falta REALMENTE se aplica:
        // `montarLinhaEscala` descarta falta em dia de folga/férias, e mostrar a
        // justificativa de uma falta que não existe convidaria a agir sobre ela.
        ausenciaId: ausenteDeVerdade ? (aus?.id ?? null) : null,
        cid: ausenteDeVerdade ? (aus?.cid ?? null) : null,
        atestadoInicio: ausenteDeVerdade ? (atestado?.inicio ?? null) : null,
        atestadoFim: ausenteDeVerdade ? (atestado?.fim ?? null) : null,
        statusJustificativa: ausenteDeVerdade
          ? ((aus?.statusJustificativa as StatusJustificativa) ?? null)
          : null,
        justificadaPorNome: ausenteDeVerdade
          ? (aus?.justificadaPorNome ?? null)
          : null,
        aPrazo: ausenteDeVerdade ? (aus?.aPrazo ?? false) : false,
      });
    }

    // Trabalha/falta primeiro, por hora de entrada; folga ao fim (por nome).
    colaboradores.sort((a, b) => {
      const af = a.status === 'FOLGA';
      const bf = b.status === 'FOLGA';
      if (af !== bf) return af ? 1 : -1;
      if (af && bf) return a.nome.localeCompare(b.nome);
      const ea = horaMin(a.entrada ?? '') ?? 0;
      const eb = horaMin(b.entrada ?? '') ?? 0;
      return ea - eb || a.nome.localeCompare(b.nome);
    });

    return {
      dataISO,
      diaSemana,
      trabalhando: colaboradores.filter((c) => c.status === 'TRABALHA').length,
      folgas: colaboradores.filter((c) => c.status === 'FOLGA').length,
      faltas: colaboradores.filter((c) => c.status === 'FALTA').length,
      atestados: colaboradores.filter((c) => c.status === 'ATESTADO').length,
      colaboradores,
      grupoFolgaDomingo: ctx.grupoFolgaDomingo(diaInicio),
    };
  }

  /**
   * Tablero "ao vivo": quem deveria estar no caixa AGORA (turno cobre a hora
   * local, não é folga hoje). Os marcados como falta não contam em
   * `disponiveis` — aparecem em `faltas`.
   */
  async aoVivo(): Promise<AoVivoOperadores> {
    const { dataISO, hora, minuto, diaSemana } = agoraBrasilia();
    const nowMin = hora * 60 + minuto;
    const diaInicio = new Date(`${dataISO}T00:00:00.000Z`);
    const diaFim = addDias(diaInicio, 1);

    // Candidatos do dia, pela MESMA regra da escala publicada: quem tem turno
    // hoje. Isso cobre folga (ficha + escala semanal), férias, rodízio de
    // domingo, feriado e exceção de horário — antes, um feriado punha aqui o
    // horário de dia útil e a franja "agora" ficava errada.
    const ctx = await this.contextoEscala([diaInicio]);
    const candidatos = (await this.fichasOperadores())
      .map((ficha) => ({ ficha, linha: ctx.linha(ficha, diaInicio) }))
      .filter(({ linha }) => linha.status === 'TRABALHA')
      .map(({ ficha, linha }) => ({
        id: ficha.colaboradorId,
        nome: ficha.nome,
        entrada: linha.entrada,
        saida: linha.saida,
      }));
    const ids = candidatos.map((c) => c.id);
    const ausencias =
      ids.length > 0
        ? await this.prisma.ausencia.findMany({
            where: {
              pessoaId: { in: ids },
              data: { gte: diaInicio, lt: diaFim },
            },
            select: { pessoaId: true },
          })
        : [];
    const faltou = new Set(ausencias.map((a) => a.pessoaId));

    // Quem saiu para o intervalo e não retornou hoje também sai do caixa.
    const incidencias =
      ids.length > 0
        ? await this.prisma.incidenciaEscala.findMany({
            where: {
              colaboradorId: { in: ids },
              tipo: 'NAO_RETORNO_INTERVALO',
              data: { gte: diaInicio, lt: diaFim },
            },
            select: { colaboradorId: true },
          })
        : [];
    const naoRetornou = new Set(incidencias.map((i) => i.colaboradorId));

    const listaDisponiveis: OperadorAgora[] = [];
    const listaFaltantes: OperadorAgora[] = [];
    const listaSemRetorno: OperadorAgora[] = [];

    for (const c of candidatos) {
      const ent = horaMin(c.entrada ?? '');
      const sai = horaMin(c.saida ?? '');
      if (ent == null || sai == null) continue;
      if (!(nowMin >= ent && nowMin < sai)) continue;
      const linha: OperadorAgora = {
        nome: c.nome,
        entrada: c.entrada ?? '',
        saida: c.saida ?? '',
      };
      if (faltou.has(c.id)) {
        listaFaltantes.push(linha);
      } else if (naoRetornou.has(c.id)) {
        // Não retornou do intervalo: não conta como disponível no caixa.
        listaSemRetorno.push(linha);
      } else {
        listaDisponiveis.push(linha);
      }
    }

    return {
      horaLocal: `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`,
      dataISO,
      diaSemana,
      disponiveis: listaDisponiveis.length,
      faltas: listaFaltantes.length,
      semRetorno: listaSemRetorno.length,
      esperados:
        listaDisponiveis.length +
        listaFaltantes.length +
        listaSemRetorno.length,
      listaDisponiveis,
      listaFaltantes,
      listaSemRetorno,
    };
  }

  /**
   * Analítica de faltas num período: total, ranking por operador e distribuição
   * por dia da semana (qual dia mais se falta). Resolve nomes dos operadores.
   */
  async analiticaFaltas(inicio: Date, fim: Date): Promise<AnaliticaFaltas> {
    const operadores = (
      await this.prisma.colaborador.findMany({
        where: { funcao: 'OPERADOR' },
        select: { id: true, nome: true, folgaDiaSemana: true },
      })
    ).map((o) => ({
      id: o.id,
      nome: o.nome,
      folgaDiaSemana: o.folgaDiaSemana ?? -1,
    }));
    const ids = operadores.map((o) => o.id);
    if (ids.length === 0) {
      return {
        total: 0,
        totalAnterior: 0,
        tendenciaPct: null,
        taxaGlobal: 0,
        porOperador: [],
        porDiaSemana: NOMES_DIA.map((nome, diaSemana) => ({
          diaSemana,
          nome,
          quantidade: 0,
        })),
      };
    }

    // Janela anterior de igual duração, imediatamente antes (para a tendência).
    const UM_DIA = 24 * 60 * 60 * 1000;
    const prevFim = new Date(inicio.getTime() - UM_DIA);
    const prevInicio = new Date(
      prevFim.getTime() - (fim.getTime() - inicio.getTime()),
    );

    const [ausencias, ausenciasAnterior] = await Promise.all([
      this.prisma.ausencia.findMany({
        where: { pessoaId: { in: ids }, data: { gte: inicio, lte: fim } },
        select: { pessoaId: true, data: true },
      }),
      this.prisma.ausencia.findMany({
        where: {
          pessoaId: { in: ids },
          data: { gte: prevInicio, lte: prevFim },
        },
        select: { pessoaId: true, data: true },
      }),
    ]);

    // Conta dias escalados só até hoje (taxa de absenteísmo justa no mês atual).
    const agora = new Date();
    const fimEscala = agora.getTime() < fim.getTime() ? agora : fim;

    return analisarFaltas({
      operadores,
      ausencias,
      ausenciasAnterior,
      inicio,
      fimEscala,
    });
  }

  /**
   * Analítica de "não retorno do intervalo" num período — mesma inteligência
   * das faltas (ranking, risco/semáforo, dia recorrente e tendência), mas sobre
   * as incidências do tipo NAO_RETORNO_INTERVALO em vez das ausências. Reusa o
   * mesmo motor puro (`analisarFaltas`) e o mesmo formato de resposta.
   */
  async analiticaNaoRetornos(
    inicio: Date,
    fim: Date,
  ): Promise<AnaliticaFaltas> {
    const operadores = (
      await this.prisma.colaborador.findMany({
        where: { funcao: 'OPERADOR' },
        select: { id: true, nome: true, folgaDiaSemana: true },
      })
    ).map((o) => ({
      id: o.id,
      nome: o.nome,
      folgaDiaSemana: o.folgaDiaSemana ?? -1,
    }));
    const ids = operadores.map((o) => o.id);
    if (ids.length === 0) {
      return {
        total: 0,
        totalAnterior: 0,
        tendenciaPct: null,
        taxaGlobal: 0,
        porOperador: [],
        porDiaSemana: NOMES_DIA.map((nome, diaSemana) => ({
          diaSemana,
          nome,
          quantidade: 0,
        })),
      };
    }

    // Janela anterior de igual duração, imediatamente antes (para a tendência).
    const UM_DIA = 24 * 60 * 60 * 1000;
    const prevFim = new Date(inicio.getTime() - UM_DIA);
    const prevInicio = new Date(
      prevFim.getTime() - (fim.getTime() - inicio.getTime()),
    );

    const selecao = {
      colaboradorId: true,
      data: true,
      statusJustificativa: true,
      motivoJustificativa: true,
    };
    const [atuais, anteriores] = await Promise.all([
      this.prisma.incidenciaEscala.findMany({
        where: {
          colaboradorId: { in: ids },
          tipo: 'NAO_RETORNO_INTERVALO',
          data: { gte: inicio, lte: fim },
        },
        select: selecao,
      }),
      this.prisma.incidenciaEscala.findMany({
        where: {
          colaboradorId: { in: ids },
          tipo: 'NAO_RETORNO_INTERVALO',
          data: { gte: prevInicio, lte: prevFim },
        },
        select: selecao,
      }),
    ]);

    // Não-retorno não tem "dia escalado" próprio; usamos a mesma janela das
    // faltas para a taxa (dias escalados até hoje).
    const agora = new Date();
    const fimEscala = agora.getTime() < fim.getTime() ? agora : fim;

    return analisarFaltas({
      operadores,
      ausencias: atuais.map((i) => ({
        pessoaId: i.colaboradorId,
        data: i.data,
        statusJustificativa: i.statusJustificativa,
        motivoJustificativa: i.motivoJustificativa,
      })),
      ausenciasAnterior: anteriores.map((i) => ({
        pessoaId: i.colaboradorId,
        data: i.data,
        statusJustificativa: i.statusJustificativa,
        motivoJustificativa: i.motivoJustificativa,
      })),
      inicio,
      fimEscala,
    });
  }

  /**
   * Alerta semanal de faltas (segunda-feira 08:00 Brasília): envia aos gestores
   * o resumo das faltas dos últimos 7 dias (ranking e dia com mais faltas).
   */
  @Cron('0 8 * * 1', { timeZone: 'America/Sao_Paulo' })
  async alertaFaltasSemanal(): Promise<void> {
    if (!this.notificacoes) return;
    try {
      const fim = new Date();
      const inicio = new Date(fim.getTime() - 7 * 24 * 60 * 60 * 1000);
      const analitica = await this.analiticaFaltas(inicio, fim);
      if (analitica.total === 0) return;
      const gestores = await this.notificacoes.destinatariosComPermissao(
        'OPERADORES_AUSENCIAS',
      );
      if (gestores.length === 0) return;

      const topo = analitica.porOperador
        .slice(0, 3)
        .map((o) => `${o.nome} (${o.quantidade})`)
        .join(', ');
      const diaPior = [...analitica.porDiaSemana].sort(
        (a, b) => b.quantidade - a.quantidade,
      )[0];
      await this.notificacoes.enviar(gestores, {
        titulo: '📋 Faltas da semana',
        mensagem: `${analitica.total} falta(s) nos últimos 7 dias. Mais faltas: ${topo}. Dia com mais faltas: ${diaPior.nome}.`,
      });
    } catch (erro) {
      this.logger.warn(`Falha no alerta semanal de faltas: ${String(erro)}`);
    }
  }

  /**
   * Aviso proativo de cobertura crítica (todo dia 07:00 Brasília): se hoje a
   * cobertura (escalados − faltas) ficar abaixo do mínimo, avisa os gestores.
   */
  @Cron('0 7 * * *', { timeZone: 'America/Sao_Paulo' })
  async avisoCoberturaCritica(): Promise<void> {
    if (!this.notificacoes) return;
    try {
      // Reaproveita o roster do dia em vez de recontar por conta própria. A
      // contagem antiga (`escaladosNoDia` = ficha menos a folga da ficha, menos
      // as faltas) ignorava TRÊS coisas e por isso superestimava a cobertura —
      // o erro que faz este aviso NÃO disparar quando devia:
      //  - as FÉRIAS (a pessoa contava como se estivesse no caixa);
      //  - a regra única de FOLGA (um dia de folga só na escala semanal);
      //  - o RODÍZIO DE DOMINGO (contava quase todos, quando só 2 de 3 grupos
      //    trabalham).
      const dia = await this.diaOperadores();
      const disponiveis = dia.trabalhando;
      const ausentes = dia.faltas + dia.atestados;
      // Ninguém era esperado hoje (loja fechada, todos de folga/férias): não há
      // cobertura a alertar. Mesmo critério do alerta de fiscais, que não grita
      // quando não há operação a cobrir.
      if (disponiveis + ausentes === 0) return;
      if (disponiveis >= COBERTURA_MINIMA) return;

      const gestores = await this.notificacoes.destinatariosComPermissao(
        'OPERADORES_AUSENCIAS',
      );
      if (gestores.length === 0) return;
      await this.notificacoes.enviar(gestores, {
        titulo: '⚠️ Cobertura baixa hoje',
        mensagem: `Hoje (${NOMES_DIA[dia.diaSemana]}) há ${disponiveis} operadores no caixa — abaixo do mínimo de ${COBERTURA_MINIMA}${ausentes > 0 ? ` (${ausentes} ausência(s))` : ''}.`,
      });
    } catch (erro) {
      this.logger.warn(`Falha no aviso de cobertura: ${String(erro)}`);
    }
  }
}
