import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UM_DIA_MS, inicioDoDia, inicioDoProximoDia } from '../common/datas';
import { EscalaDomingoService } from '../escala-domingo/escala-domingo.service';
import {
  GrupoDomingo,
  ehGrupoValido,
} from '../escala-domingo/escala-domingo.domain';
import {
  RodizioFolgas,
  folgasDoGrupoNaSemana,
  gruposDeFolgaNoDia,
  rodizioDaLinha,
  rodizioNoDia,
} from '../escala-domingo/rodizio-folgas.domain';
import { carregarMapaDeFeriados } from '../feriados/feriados.consulta';
import { RegrasContrato } from '../ponto/ponto.domain';
import { TiposContratoService } from '../tipos-contrato/tipos-contrato.service';
import {
  FichaLegada,
  HorarioDoDia,
  JornadaDaPessoa,
  JornadaPrevista,
  VigenciaJornada,
  folgasFixasEfetivas,
  previstoNoDia,
  vigenciaNoDia,
} from './jornada-vigencia.domain';

/** Responde sobre a jornada prevista nos dias que foram carregados. */
export interface ConsultorJornada {
  /**
   * Jornada prevista da pessoa no dia, ou null quando nenhum dos `ids` é uma
   * ficha conhecida.
   *
   * `ids` aceita a pessoa em **todas** as suas identidades (`Fiscal.id`,
   * `Colaborador.id`), como o `FolgaService`: vale a primeira que for uma ficha,
   * e a escala semanal legada é procurada por todas.
   *
   * `ehFeriado` omitido usa o calendário carregado; informado, prevalece — para o
   * consumidor que hoje ignora o feriado continuar igual.
   *
   * Lança se o dia não estiver entre os carregados: a âncora de domingo, a
   * escala semanal e os feriados só foram lidos para eles.
   */
  previsto(
    ids: readonly (string | null | undefined)[],
    dia: Date,
    ehFeriado?: boolean,
  ): JornadaPrevista | null;

  /**
   * A pessoa descansa no dia? É `previsto(...).folga`, com um caso a mais
   * herdado do `FolgaService`: quem não tem ficha entre os `ids` (fiscal sem
   * vínculo) ainda folga se a escala semanal legada disser.
   */
  ehFolga(dia: Date, ids: readonly (string | null | undefined)[]): boolean;

  /**
   * Quem, entre os `ids`, está **sem folga nenhuma** na própria jornada. No
   * regime legado: ficha sem `folgaDiaSemana`. Com vigência (a do último dia
   * carregado): sem grupo e sem folgas fixas. Pessoa sem ficha → false.
   */
  semFolgaNaFicha(ids: readonly (string | null | undefined)[]): boolean;

  /**
   * Os grupos que folgam no dia pelo rodízio de folgas vigente (vazio no
   * sábado), ou null quando nenhum rodízio vale no dia — aí o chamador cai no
   * rodízio antigo de domingo. Não depende de quem tem vigência.
   */
  gruposDeFolga(dia: Date): GrupoDomingo[] | null;
}

/** Colunas da ficha que formam o regime legado (6x1). */
const SELECT_FICHA_LEGADA = {
  id: true,
  tipoContratoJornadaId: true,
  folgaDiaSemana: true,
  grupoDomingo: true,
  entradaSemana: true,
  saidaSemana: true,
  entradaFds: true,
  saidaFds: true,
  entradaDom: true,
  saidaDom: true,
} as const;

interface LinhaVigencia {
  id: string;
  colaboradorId: string;
  vigenteDesde: Date;
  tipoContratoJornadaId: string;
  grupo: string | null;
  folgasFixas: number[];
  disponibilidade: { diaSemana: number; entrada: string; saida: string }[];
}

/** Linha do banco → vigência do domínio (grupo inválido vira "sem grupo"). */
export function vigenciaDaLinha(linha: LinhaVigencia): VigenciaJornada {
  return {
    id: linha.id,
    vigenteDesde: linha.vigenteDesde,
    tipoContratoJornadaId: linha.tipoContratoJornadaId,
    grupo: ehGrupoValido(linha.grupo) ? linha.grupo : null,
    folgasFixas: linha.folgasFixas ?? [],
    disponibilidade: new Map<number, HorarioDoDia>(
      linha.disponibilidade.map((d) => [
        d.diaSemana,
        { entrada: d.entrada, saida: d.saida },
      ]),
    ),
  };
}

/**
 * Jornada prevista do dia (spec `jornada-5x2`, ADR 0027): a fonte única para
 * "esta pessoa folga hoje? a que horas entra? com que contrato?".
 *
 * Os dias anteriores à primeira vigência de cada pessoa são respondidos pela
 * ficha legada com as mesmas funções de sempre, então, enquanto ninguém tiver
 * vigência, o resultado é o de antes deste serviço existir.
 */
@Injectable()
export class JornadaVigenciaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tiposContrato: TiposContratoService,
    // Âncora do rodízio ANTIGO de domingo (regime legado). Opcional como nos
    // demais serviços: sem ela, o domingo de quem tem grupo não é afirmado.
    @Optional() private readonly escalaDomingo?: EscalaDomingoService,
  ) {}

  /**
   * Carrega de uma vez tudo o que decide a jornada nos `dias` e devolve o
   * consultor. Uma consulta por fonte, não por pessoa: quem chama isto são as
   * varreduras do dia e a apuração do ciclo.
   */
  async consultor(dias: readonly Date[]): Promise<ConsultorJornada> {
    const diasCivis = [...new Set(dias.map((d) => inicioDoDia(d).getTime()))]
      .sort((a, b) => a - b)
      .map((t) => new Date(t));
    if (diasCivis.length === 0) {
      const semDias = (): never => {
        throw new Error('Consultor da jornada sem dias carregados.');
      };
      return {
        previsto: semDias,
        ehFolga: semDias,
        semFolgaNaFicha: semDias,
        gruposDeFolga: semDias,
      };
    }
    const primeiro = diasCivis[0];
    const ultimo = diasCivis[diasCivis.length - 1];
    const carregados = new Set(diasCivis.map((d) => d.getTime()));
    const diasSemana = [...new Set(diasCivis.map((d) => d.getUTCDay()))];
    const temDomingo = diasSemana.includes(0);

    const [
      fichas,
      linhasVigencia,
      entradasDeFolga,
      ancora,
      feriados,
      linhasRodizio,
    ] = await Promise.all([
      this.prisma.colaborador.findMany({ select: SELECT_FICHA_LEGADA }),
      // Só as que já começaram até o último dia: as posteriores não decidem
      // nenhum dia carregado.
      this.prisma.jornadaVigencia.findMany({
        where: { vigenteDesde: { lte: ultimo } },
        include: {
          disponibilidade: {
            select: { diaSemana: true, entrada: true, saida: true },
          },
        },
      }),
      this.prisma.escalaEntry.findMany({
        where: { diaSemana: { in: diasSemana } },
        select: {
          funcionarioId: true,
          colaboradorId: true,
          diaSemana: true,
          folga: true,
        },
      }),
      temDomingo && this.escalaDomingo
        ? this.escalaDomingo.obterAncora()
        : Promise.resolve(null),
      carregarMapaDeFeriados(this.prisma, primeiro, inicioDoProximoDia(ultimo)),
      // Rodízio de folgas (Fase 3): as vigências que já começaram até o
      // último dia. Só decide quem tem grupo numa vigência da jornada.
      this.prisma.rodizioFolgasVigencia.findMany({
        where: { vigenteDesde: { lte: ultimo } },
      }),
    ]);
    const rodizios = linhasRodizio
      .map(rodizioDaLinha)
      .filter((r): r is RodizioFolgas => r !== null);
    const folgasDoGrupo = (grupo: GrupoDomingo, dia: Date) => {
      const r = rodizioNoDia(rodizios, dia);
      return r ? folgasDoGrupoNaSemana(r, grupo, dia) : null;
    };

    // Regras de cada contrato envolvido (fichas e vigências), resolvidas uma vez.
    const idsContrato = new Set<string>();
    for (const f of fichas) idsContrato.add(f.tipoContratoJornadaId);
    for (const v of linhasVigencia) idsContrato.add(v.tipoContratoJornadaId);
    const regrasPorContrato = new Map<string, RegrasContrato>();
    await Promise.all(
      [...idsContrato].map(async (id) => {
        regrasPorContrato.set(
          id,
          await this.tiposContrato.regrasDoContrato(id),
        );
      }),
    );
    const regrasPadrao = await this.tiposContrato.regrasDoContrato(null);
    const regras = (id: string): RegrasContrato =>
      regrasPorContrato.get(id) ?? regrasPadrao;

    const vigenciasPorPessoa = new Map<string, VigenciaJornada[]>();
    for (const linha of linhasVigencia) {
      const lista = vigenciasPorPessoa.get(linha.colaboradorId) ?? [];
      lista.push(vigenciaDaLinha(linha));
      vigenciasPorPessoa.set(linha.colaboradorId, lista);
    }
    const pessoas = new Map<string, JornadaDaPessoa>();
    for (const f of fichas) {
      const legado: FichaLegada = {
        tipoContratoJornadaId: f.tipoContratoJornadaId,
        folgaDiaSemana: f.folgaDiaSemana ?? null,
        grupoDomingo: f.grupoDomingo ?? null,
        entradaSemana: f.entradaSemana ?? null,
        saidaSemana: f.saidaSemana ?? null,
        entradaFds: f.entradaFds ?? null,
        saidaFds: f.saidaFds ?? null,
        entradaDom: f.entradaDom ?? null,
        saidaDom: f.saidaDom ?? null,
      };
      pessoas.set(f.id, {
        colaboradorId: f.id,
        legado,
        vigencias: vigenciasPorPessoa.get(f.id) ?? [],
      });
    }

    // Folga GERAL da escala semanal (`EscalaEntry`), pelas duas identidades — a
    // mesma leitura do `FolgaService`. Só pesa no regime legado.
    const folgaNaEscala = new Set<string>();
    for (const e of entradasDeFolga) {
      if (!e.folga) continue;
      for (const id of [e.funcionarioId, e.colaboradorId]) {
        if (id) folgaNaEscala.add(`${e.diaSemana}|${id}`);
      }
    }

    const ancoraDomingo: { data: Date; ordem: readonly GrupoDomingo[] } | null =
      ancora ? { data: ancora.data, ordem: ancora.ordem } : null;

    const exigirCarregado = (dia: Date): number => {
      const chave = inicioDoDia(dia).getTime();
      if (!carregados.has(chave)) {
        throw new Error(
          `Dia ${inicioDoDia(dia).toISOString().slice(0, 10)} fora dos dias carregados no consultor da jornada.`,
        );
      }
      return chave;
    };
    const pessoaDe = (
      conhecidos: readonly string[],
    ): JornadaDaPessoa | undefined => {
      for (const id of conhecidos) {
        const pessoa = pessoas.get(id);
        if (pessoa) return pessoa;
      }
      return undefined;
    };
    const conhecidosDe = (ids: readonly (string | null | undefined)[]) =>
      ids.filter((id): id is string => !!id);
    const naEscalaSemanal = (conhecidos: readonly string[], dow: number) =>
      conhecidos.some((id) => folgaNaEscala.has(`${dow}|${id}`));

    const previsto: ConsultorJornada['previsto'] = (ids, dia, ehFeriado) => {
      const chave = exigirCarregado(dia);
      const conhecidos = conhecidosDe(ids);
      const pessoa = pessoaDe(conhecidos);
      if (!pessoa) return null;
      const dow = dia.getUTCDay();
      return previstoNoDia(pessoa, dia, {
        regras,
        ehFeriado: ehFeriado ?? feriados.has(chave),
        // O rodízio antigo só existe no domingo; nos outros dias a âncora não
        // muda nada e nem é carregada.
        ancoraDomingo: dow === 0 ? ancoraDomingo : null,
        folgaNaEscalaSemanal: naEscalaSemanal(conhecidos, dow),
        // Regime semanal com grupo: os dias do grupo na semana do dia. Sem
        // rodízio vigente no dia, o grupo não afirma folga nem turno.
        folgasDoGrupo,
      });
    };

    return {
      previsto,
      ehFolga: (dia, ids) => {
        const p = previsto(ids, dia);
        if (p) return p.folga;
        return naEscalaSemanal(conhecidosDe(ids), dia.getUTCDay());
      },
      semFolgaNaFicha: (ids) => {
        const pessoa = pessoaDe(conhecidosDe(ids));
        if (!pessoa) return false;
        const vigente = vigenciaNoDia(pessoa.vigencias, ultimo);
        if (!vigente) return pessoa.legado.folgaDiaSemana == null;
        if (vigente.grupo) return false;
        return (
          folgasFixasEfetivas(
            vigente,
            regras(vigente.tipoContratoJornadaId).folgasFixasPadrao,
          ).length === 0
        );
      },
      gruposDeFolga: (dia) => {
        exigirCarregado(dia);
        const r = rodizioNoDia(rodizios, dia);
        return r ? [...gruposDeFolgaNoDia(r, dia)] : null;
      },
    };
  }

  /**
   * "Esta pessoa folga neste dia?" para um PERÍODO, para quem tem vigência que
   * já começou até `fim`. Quem não tem fica fora do mapa e o chamador segue a
   * conta antiga (dia da semana ≠ folga fixa), que é a resposta de sempre para
   * o regime legado — sem mudar nenhum número de quem ainda está no 6x1.
   *
   * Serve às analíticas (dias escalados, falta "emendada" à folga), que antes
   * supunham uma folga fixa por semana.
   */
  async folgasNoPeriodo(
    colaboradorIds: readonly string[],
    inicio: Date,
    fim: Date,
  ): Promise<Map<string, (dia: Date) => boolean>> {
    const out = new Map<string, (dia: Date) => boolean>();
    if (colaboradorIds.length === 0) return out;
    const comVigencia = await this.prisma.jornadaVigencia.findMany({
      where: {
        colaboradorId: { in: [...colaboradorIds] },
        vigenteDesde: { lte: inicioDoDia(fim) },
      },
      select: { colaboradorId: true },
      distinct: ['colaboradorId'],
    });
    if (comVigencia.length === 0) return out;
    // Um dia antes e um depois: a "emenda" olha a véspera e o dia seguinte.
    const dias: Date[] = [];
    const ultimo = inicioDoProximoDia(inicioDoDia(fim));
    for (
      let t = inicioDoDia(inicio).getTime() - UM_DIA_MS;
      t <= ultimo.getTime();
      t += UM_DIA_MS
    ) {
      dias.push(new Date(t));
    }
    const consultor = await this.consultor(dias);
    for (const { colaboradorId } of comVigencia) {
      out.set(colaboradorId, (dia) => consultor.ehFolga(dia, [colaboradorId]));
    }
    return out;
  }
}
