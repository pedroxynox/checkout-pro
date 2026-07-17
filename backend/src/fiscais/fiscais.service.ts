import { Injectable, Optional } from '@nestjs/common';
import { Fiscal, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { ValidacaoDataService } from '../data-inicial/validacao-data.service';
import { CicloFolhaService } from '../ciclo-folha/ciclo-folha.service';
import {
  Jornada,
  RegistroPonto,
  StatusFiscal,
  calcularJornada,
  inicioDoDia,
  inicioDoProximoDia,
  isDomingo,
  jornadaEsperadaMs,
  mensagemTransicao,
  primeiroNome,
  statusAtual,
} from './fiscais.domain';
import {
  FiscalNaoEncontradoError,
  FaltaRegistradaError,
  JaIniciouJornadaError,
  FiscalDeFolgaError,
} from './fiscais.errors';
import { FiscalStatusEventos } from './fiscais.eventos';
import {
  ColaboradorDoFiscal,
  mapearFiscalColaborador,
} from './colaborador-vinculo';
import {
  calcularJornadaDia,
  classificarBatidas,
  RegrasContrato,
  StatusJornadaPonto,
  statusFiscalDeJornada,
  TipoBatida,
} from '../ponto/ponto.domain';
import { FUNCOES_PONTO_NAO_FISCAL } from '../ponto/pessoas-ponto';
import { TiposContratoService } from '../tipos-contrato/tipos-contrato.service';
import { FeriadosService } from '../feriados/feriados.service';
import {
  agoraNaBrasilia,
  diaEncerradoEmBrasilia,
  fimDoDiaBrasiliaEmUtc,
} from '../common/datas';

/** Item do painel em tempo real: um fiscal e seu status atual. */
export interface ItemPainel {
  fiscalId: string;
  /** Ficha única correspondente (ou null se ainda não houver). */
  colaboradorId: string | null;
  primeiroNome: string;
  status: StatusFiscal;
  /** Instante (ISO) do último registro; null se ainda não bateu ponto hoje. */
  desde: string | null;
}

/** Uma marcação (batida) do dia: tipo canônico + hora (ISO). */
export interface MarcacaoDia {
  tipo: TipoBatida;
  hora: string;
}

/**
 * Converte batidas classificadas (tipo + hora) para marcações do dia (hora ISO)
 * — usado na card informativa "Marcações do dia".
 */
function marcacoesDe(
  batidas: readonly { tipo: TipoBatida; hora: Date }[],
): MarcacaoDia[] {
  return batidas.map((b) => ({ tipo: b.tipo, hora: b.hora.toISOString() }));
}

/** Item do log de jornada do dia (tempos por pessoa: fiscal ou colaborador). */
export interface ItemJornada extends Jornada {
  /** Id da pessoa: Fiscal.id (fiscais) ou Colaborador.id (demais). */
  fiscalId: string;
  pessoaId: string;
  tipoPessoa: 'FISCAL' | 'OPERADOR';
  /** Função (FISCAL/OPERADOR/SUPERVISOR) para exibir o papel. */
  funcao: string;
  colaboradorId: string | null;
  primeiroNome: string;
  status: StatusFiscal;
  /** Estado canônico da jornada, inclusive INCOMPLETO em dias históricos. */
  jornadaStatus: StatusJornadaPonto;
  faltando: string[];
  /** Marcações (batidas) do dia, em ordem: entrada, saída, volta, encerramento. */
  marcacoes: MarcacaoDia[];
}

/** Resumo do status atual de um fiscal (retornado após definir status). */
export interface ResumoStatus {
  fiscalId: string;
  primeiroNome: string;
  status: StatusFiscal;
  em: string;
}

/** Acumulado de horas extras do mês por pessoa (fiscal ou colaborador). */
export interface ItemHorasExtras {
  fiscalId: string;
  pessoaId: string;
  tipoPessoa: 'FISCAL' | 'OPERADOR';
  primeiroNome: string;
  /** Total de horas extras do mês (50% + 100%), em ms. */
  horasExtrasMs: number;
  /** Extras com adicional de 50% (segunda a sábado), em ms. */
  horasExtras50Ms: number;
  /** Extras com adicional de 100% (domingos), em ms. */
  horasExtras100Ms: number;
}

/** Fiscal de folga hoje. */
export interface ItemFolga {
  fiscalId: string;
  primeiroNome: string;
}

/**
 * Serviço do Modulo_Fiscais (controle de jornada).
 *
 * O fiscal define seu próprio status (auto-identificado pelo login); cada
 * transição é registrada no ponto, propagada em tempo real (WebSocket) e, nas
 * mudanças relevantes, notifica os gestores. Calcula a jornada do dia (tempo
 * trabalhando, intervalo e carga horária) a partir do log.
 *
 * `eventos` e `notificacoes` são opcionais (injetados em produção; ausentes em
 * testes unitários que exercitam só a persistência).
 */
@Injectable()
export class FiscaisService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly eventos?: FiscalStatusEventos,
    @Optional() private readonly notificacoes?: NotificacoesService,
    @Optional() private readonly validacaoData?: ValidacaoDataService,
    // Feriados: unifica o tratamento com o Relógio Ponto e a Central — um
    // feriado segue a regra do domingo (base 7h20, extras a 100%). Opcional
    // para não quebrar testes unitários que exercitam só a persistência.
    @Optional() private readonly feriados?: FeriadosService,
    // Fechamento do ciclo: bloqueia marcar falta num ciclo já fechado.
    @Optional() private readonly cicloFolha?: CicloFolhaService,
    // Regras por tipo de contrato (data-driven). Opcional: sem ele, o cálculo
    // usa o contrato padrão (6x1), preservando o comportamento vigente.
    @Optional() private readonly tiposContrato?: TiposContratoService,
  ) {}

  /**
   * Regras de jornada do colaborador (contrato atribuído) para o cálculo.
   * `undefined` quando não há serviço — o `calcularJornadaDia` cai no padrão.
   */
  private async regrasDe(
    colaboradorId?: string | null,
  ): Promise<RegrasContrato | undefined> {
    return this.tiposContrato
      ? this.tiposContrato.regrasDoColaborador(colaboradorId ?? null)
      : undefined;
  }

  /**
   * Conjunto dos dias (00:00 UTC) que são feriado no período `[inicio, fim)`.
   * Fonte única compartilhada com a Central (`FeriadosService`). Vazio quando o
   * serviço de feriados não está disponível (mantém o comportamento antigo).
   */
  private async feriadosNoPeriodo(
    inicio: Date,
    fimExclusivo: Date,
  ): Promise<Set<number>> {
    if (!this.feriados) return new Set();
    const mapa = await this.feriados.mapaNoPeriodo(inicio, fimExclusivo);
    return new Set(mapa.keys());
  }

  /** Fiscal vinculado ao usuário autenticado (erro se não houver). */
  async meuFiscal(usuarioId: string): Promise<Fiscal> {
    const fiscal = await this.prisma.fiscal.findFirst({ where: { usuarioId } });
    if (!fiscal) {
      throw new FiscalNaoEncontradoError();
    }
    return fiscal;
  }

  /**
   * Mapa fiscalId → ficha única (colaborador), resolvido por conta de acesso
   * ou matrícula. Usado para ligar o painel/jornada à ficha do colaborador.
   */
  private async mapaColaboradores(): Promise<Map<string, ColaboradorDoFiscal>> {
    const [fiscais, usuarios, colaboradores] = await Promise.all([
      this.prisma.fiscal.findMany({
        select: { id: true, nome: true, usuarioId: true },
      }),
      this.prisma.usuario.findMany({ select: { id: true, login: true } }),
      this.prisma.colaborador.findMany({
        where: { funcao: 'FISCAL' },
        select: { id: true, nome: true, matricula: true, usuarioId: true },
      }),
    ]);
    return mapearFiscalColaborador(fiscais, usuarios, colaboradores);
  }

  /**
   * Resumo do próprio fiscal (status atual + jornada do dia). Retorna null se o
   * usuário autenticado não for um fiscal (ex.: gerente apenas visualizando).
   */
  async meuResumo(
    usuarioId: string,
  ): Promise<
    (ResumoStatus & Jornada & { faltaHoje: boolean; folgaHoje: boolean }) | null
  > {
    const fiscal = await this.prisma.fiscal.findFirst({ where: { usuarioId } });
    if (!fiscal) {
      return null;
    }
    const agora = new Date();
    const registros = await this.registrosDoDia(fiscal.id, agora);
    const ultimo = registros[registros.length - 1] ?? null;
    const faltaHoje = !!(await this.prisma.ausencia.findUnique({
      where: {
        pessoaId_data: { pessoaId: fiscal.id, data: inicioDoDia(agora) },
      },
    }));
    const folgaHoje = await this.isFolgaHoje(fiscal.id, agora);
    return {
      fiscalId: fiscal.id,
      primeiroNome: primeiroNome(fiscal.nome),
      status: statusAtual(registros) ?? 'FORA_EXPEDIENTE',
      em: (ultimo?.em ?? agora).toISOString(),
      faltaHoje,
      folgaHoje,
      ...calcularJornada(registros, agora),
    };
  }

  /** Registros de ponto de um fiscal no dia da data informada (ordenados). */
  private async registrosDoDia(
    fiscalId: string,
    dia: Date,
  ): Promise<RegistroPonto[]> {
    const rows = await this.prisma.registroPontoFiscal.findMany({
      where: { fiscalId, data: inicioDoDia(dia) },
      orderBy: { em: 'asc' },
    });
    return rows.map((r) => ({ status: r.status as StatusFiscal, em: r.em }));
  }

  /**
   * Define o status do fiscal: registra o ponto, propaga em tempo real e
   * notifica os gestores na transição relevante.
   */
  async definirStatus(
    fiscalId: string,
    status: StatusFiscal,
    em: Date = new Date(),
  ): Promise<ResumoStatus & Jornada> {
    // Rejeita datas anteriores à Data_Inicial_Sistema (Req 6.1–6.3).
    await this.validacaoData?.exigirDataPermitida(em);

    // Valida: se está de folga hoje, não pode registrar ponto.
    if (await this.isFolgaHoje(fiscalId, em)) {
      throw new FiscalDeFolgaError();
    }

    // Valida: se já marcou falta hoje, não pode registrar ponto.
    const faltaHoje = await this.prisma.ausencia.findUnique({
      where: { pessoaId_data: { pessoaId: fiscalId, data: inicioDoDia(em) } },
    });
    if (faltaHoje) {
      throw new FaltaRegistradaError();
    }

    const fiscal = await this.prisma.fiscal.findUnique({
      where: { id: fiscalId },
    });
    const nome = fiscal?.nome ?? '';
    const pn = primeiroNome(nome);

    const anterior = statusAtual(await this.registrosDoDia(fiscalId, em));

    await this.prisma.registroPontoFiscal.create({
      data: { fiscalId, status, data: inicioDoDia(em), em },
    });

    // Tempo real (painel atualiza sem recarregar).
    this.eventos?.publicar({ fiscalId, primeiroNome: pn, status, em });

    // Notifica gestores (gerente, supervisor, gerente desenvolvedor).
    const mensagem = mensagemTransicao(nome, anterior, status);
    if (mensagem && this.notificacoes) {
      const gestores =
        await this.notificacoes.destinatariosComPermissao('CENTRAL_JORNADA');
      await this.notificacoes.enviar(gestores, {
        titulo: 'Fiscais',
        mensagem,
      });
    }

    // Recalcular jornada com o novo registro incluído.
    const registros = await this.registrosDoDia(fiscalId, em);
    const jornada = calcularJornada(registros, em);

    return {
      fiscalId,
      primeiroNome: pn,
      status,
      em: em.toISOString(),
      ...jornada,
    };
  }

  /**
   * Reescreve (apaga e recria) o log de ponto de um fiscal no dia a partir das
   * transições derivadas das batidas do Registro de Ponto (ponte batidas →
   * status), usando o `cliente` transacional recebido. Fica DENTRO da mesma
   * transação que grava/ordena as batidas: assim guardar, ordenar, recalcular
   * e sincronizar formam uma única operação atômica, sem estados parciais entre
   * `batidas_ponto` e `registros_ponto_fiscal`. A propagação em tempo real fica
   * separada em `publicarStatusDoDia`, chamada só após o commit. `em` de cada
   * transição já vem em UTC real (a ponte converte a hora da batida).
   */
  async reescreverRegistrosDoDia(
    cliente: Prisma.TransactionClient,
    fiscalId: string,
    dia: Date,
    transicoes: { status: StatusFiscal; em: Date }[],
  ): Promise<void> {
    const data = inicioDoDia(dia);
    const ordenadas = [...transicoes].sort(
      (a, b) => a.em.getTime() - b.em.getTime(),
    );
    await cliente.registroPontoFiscal.deleteMany({ where: { fiscalId, data } });
    if (ordenadas.length > 0) {
      await cliente.registroPontoFiscal.createMany({
        data: ordenadas.map((t) => ({
          fiscalId,
          status: t.status,
          data,
          em: t.em,
        })),
      });
    }
  }

  /**
   * Propaga em tempo real (WebSocket) o status resultante do dia — o do último
   * registro. Chamada DEPOIS do commit da transação que reescreveu o log, para
   * não anunciar um status que poderia ser desfeito por um rollback.
   */
  async publicarStatusDoDia(
    fiscalId: string,
    transicoes: { status: StatusFiscal; em: Date }[],
  ): Promise<void> {
    if (!this.eventos) return;
    const ordenadas = [...transicoes].sort(
      (a, b) => a.em.getTime() - b.em.getTime(),
    );
    const fiscal = await this.prisma.fiscal.findUnique({
      where: { id: fiscalId },
    });
    const ultimo = ordenadas[ordenadas.length - 1] ?? null;
    this.eventos.publicar({
      fiscalId,
      primeiroNome: primeiroNome(fiscal?.nome ?? ''),
      status: ultimo?.status ?? 'FORA_EXPEDIENTE',
      em: ultimo?.em ?? new Date(),
    });
  }

  /**
   * Painel de todos os fiscais com o status atual (tempo real via WebSocket).
   *
   * O status usa a MESMA inteligência da jornada do dia (`calcularJornadaDia`):
   * prefere as batidas do Relógio Ponto e aplica as regras de contrato, então
   * reflete o fim do expediente mesmo SEM uma batida de encerramento — ex.: um
   * fiscal que saiu para intervalo e não voltou (intervalo além do máximo)
   * aparece como FORA_EXPEDIENTE, e não mais preso em "Intervalo". Sem batidas,
   * cai no log legado (`RegistroPontoFiscal`), aplicando o encerramento do dia.
   */
  async painel(): Promise<ItemPainel[]> {
    const agoraReal = new Date();
    const dia = inicioDoDia(agoraReal);
    const agoraPonto = agoraNaBrasilia();
    const diaEncerrado = diaEncerradoEmBrasilia(dia, agoraPonto);
    const limitePonto = diaEncerrado ? inicioDoProximoDia(dia) : agoraPonto;
    const ehFeriado = this.feriados
      ? await this.feriados.ehFeriado(dia)
      : false;

    const [fiscais, registros, batidasFiscais, mapaCol] = await Promise.all([
      this.prisma.fiscal.findMany({ orderBy: { nome: 'asc' } }),
      this.prisma.registroPontoFiscal.findMany({
        where: { data: dia },
        orderBy: { em: 'asc' },
      }),
      this.prisma.batidaPonto.findMany({
        where: { tipoPessoa: 'FISCAL', data: dia },
        orderBy: { hora: 'asc' },
        select: { id: true, pessoaId: true, hora: true },
      }),
      this.mapaColaboradores(),
    ]);
    const porFiscal = this.agrupar(registros);
    const batidasPorFiscal = new Map<string, { id: string; hora: Date }[]>();
    for (const b of batidasFiscais) {
      const atuais = batidasPorFiscal.get(b.pessoaId) ?? [];
      atuais.push({ id: b.id, hora: b.hora });
      batidasPorFiscal.set(b.pessoaId, atuais);
    }

    return Promise.all(
      fiscais.map(async (f) => {
        const regs = porFiscal.get(f.id) ?? [];
        const batidas = batidasPorFiscal.get(f.id) ?? [];
        const col = mapaCol.get(f.id);
        let status: StatusFiscal;
        let desde: string | null;
        if (batidas.length > 0) {
          // Fonte canônica: batidas do Relógio Ponto + regras do contrato.
          const regras = await this.regrasDe(col?.colaboradorId ?? null);
          const j = calcularJornadaDia(
            batidas,
            limitePonto,
            dia.getUTCDay(),
            ehFeriado,
            diaEncerrado,
            regras,
          );
          status = statusFiscalDeJornada(j.status);
          desde = batidas[batidas.length - 1].hora.toISOString();
        } else {
          // Fallback: log legado de status. Aplica o encerramento do dia para
          // não ficar preso em Disponível/Intervalo depois do expediente.
          const ultimo = regs[regs.length - 1] ?? null;
          const bruto = statusAtual(regs) ?? 'FORA_EXPEDIENTE';
          status =
            diaEncerrado && bruto !== 'FORA_EXPEDIENTE'
              ? 'FORA_EXPEDIENTE'
              : bruto;
          desde = ultimo ? ultimo.em.toISOString() : null;
        }
        return {
          fiscalId: f.id,
          colaboradorId: col?.colaboradorId ?? null,
          primeiroNome: primeiroNome(col?.nome ?? f.nome),
          status,
          desde,
        };
      }),
    );
  }

  /**
   * Log de jornada do dia (tempos por pessoa) — uso gerencial. Inclui os
   * fiscais (via RegistroPontoFiscal, com o painel/sync já existentes) e os
   * demais colaboradores ativos que batem ponto (operadores/supervisores),
   * cuja jornada é calculada a partir das batidas do Registro de Ponto.
   */
  async jornadaDoDia(data: Date = new Date()): Promise<ItemJornada[]> {
    const dia = inicioDoDia(data);
    const agoraReal = new Date();
    const agoraPonto = agoraNaBrasilia();
    const fimRotulado = inicioDoProximoDia(dia);
    const diaEncerrado = diaEncerradoEmBrasilia(dia, agoraPonto);
    // BatidaPonto usa hora de parede rotulada como UTC; RegistroPontoFiscal usa
    // instante UTC real. Cada fonte precisa do limite na sua própria referência.
    const limitePonto = diaEncerrado ? fimRotulado : agoraPonto;
    const limiteFiscal = diaEncerrado ? fimDoDiaBrasiliaEmUtc(dia) : agoraReal;
    // Feriado segue a regra do domingo (base 7h20, extras 100%), igual ao
    // Relógio Ponto e à Central.
    const ehFeriado = this.feriados
      ? await this.feriados.ehFeriado(dia)
      : false;
    const [fiscais, registros, mapaCol, batidasFiscais, operadores] =
      await Promise.all([
        this.prisma.fiscal.findMany({ orderBy: { nome: 'asc' } }),
        this.prisma.registroPontoFiscal.findMany({
          where: { data: dia },
          orderBy: { em: 'asc' },
        }),
        this.mapaColaboradores(),
        this.prisma.batidaPonto.findMany({
          where: { tipoPessoa: 'FISCAL', data: dia },
          orderBy: { hora: 'asc' },
          select: { id: true, pessoaId: true, hora: true },
        }),
        this.jornadaOperadoresDoDia(dia, limitePonto, diaEncerrado, ehFeriado),
      ]);
    const porFiscal = this.agrupar(registros);
    const batidasPorFiscal = new Map<string, { id: string; hora: Date }[]>();
    for (const batida of batidasFiscais) {
      const atuais = batidasPorFiscal.get(batida.pessoaId) ?? [];
      atuais.push({ id: batida.id, hora: batida.hora });
      batidasPorFiscal.set(batida.pessoaId, atuais);
    }
    const primeiraMarcacao = (fiscalId: string): number =>
      batidasPorFiscal.get(fiscalId)?.[0]?.hora.getTime() ??
      porFiscal.get(fiscalId)?.[0]?.em.getTime() ??
      Number.MAX_SAFE_INTEGER;
    const dosFiscais: ItemJornada[] = await Promise.all(
      fiscais
        // Prefere as batidas canônicas; mantém o log legado como fallback para
        // fiscais que ainda não passaram pelo Relógio Ponto.
        .filter(
          (f) =>
            (batidasPorFiscal.get(f.id) ?? []).length > 0 ||
            (porFiscal.get(f.id) ?? []).length > 0,
        )
        .sort((a, b) => primeiraMarcacao(a.id) - primeiraMarcacao(b.id))
        .map(async (f) => {
          const col = mapaCol.get(f.id);
          const regras = await this.regrasDe(col?.colaboradorId ?? null);
          const batidas = batidasPorFiscal.get(f.id);
          if (batidas && batidas.length > 0) {
            const j = calcularJornadaDia(
              batidas,
              limitePonto,
              dia.getUTCDay(),
              ehFeriado,
              diaEncerrado,
              regras,
            );
            return {
              fiscalId: f.id,
              pessoaId: f.id,
              tipoPessoa: 'FISCAL' as const,
              funcao: 'FISCAL',
              colaboradorId: col?.colaboradorId ?? null,
              primeiroNome: primeiroNome(col?.nome ?? f.nome),
              status: statusFiscalDeJornada(j.status),
              jornadaStatus: j.status,
              faltando: j.faltando,
              marcacoes: marcacoesDe(j.batidas),
              tempoTrabalhandoMs: j.trabalhadoMs,
              tempoIntervaloMs: j.intervaloMs,
              cargaHorariaMs: j.trabalhadoMs,
            };
          }

          const regs = porFiscal.get(f.id)!;
          const ultimoStatus = statusAtual(regs) ?? 'FORA_EXPEDIENTE';
          const jornadaStatus: StatusJornadaPonto =
            diaEncerrado && ultimoStatus !== 'FORA_EXPEDIENTE'
              ? 'INCOMPLETO'
              : ultimoStatus === 'DISPONIVEL'
                ? 'TRABALHANDO'
                : ultimoStatus === 'INTERVALO'
                  ? 'EM_INTERVALO'
                  : 'ENCERRADO';
          const faltando =
            jornadaStatus !== 'INCOMPLETO'
              ? []
              : ultimoStatus === 'INTERVALO'
                ? ['retorno do intervalo', 'encerramento']
                : ['encerramento'];
          return {
            fiscalId: f.id,
            pessoaId: f.id,
            tipoPessoa: 'FISCAL' as const,
            funcao: 'FISCAL',
            colaboradorId: col?.colaboradorId ?? null,
            primeiroNome: primeiroNome(col?.nome ?? f.nome),
            status:
              jornadaStatus === 'INCOMPLETO' ? 'FORA_EXPEDIENTE' : ultimoStatus,
            jornadaStatus,
            faltando,
            marcacoes: marcacoesDe(
              classificarBatidas(
                regs.map((r, i) => ({ id: String(i), hora: r.em })),
                regras?.maxTrabalhoSemIntervaloMs,
                regras?.intervaloObrigatorio ?? false,
              ),
            ),
            ...calcularJornada(regs, limiteFiscal, diaEncerrado),
          };
        }),
    );
    // Fiscais acima, operadores abaixo — cada grupo já ordenado pela 1ª batida.
    return [...dosFiscais, ...operadores];
  }

  /**
   * Jornada do dia dos colaboradores NÃO-fiscais (operadores/supervisores) que
   * bateram ponto, calculada a partir das batidas (Registro de Ponto). Só
   * inclui quem tem ao menos uma batida no dia (evita dezenas de linhas zeradas
   * de quem não trabalhou). O chip de status é derivado do estado da jornada.
   */
  private async jornadaOperadoresDoDia(
    dia: Date,
    limite: Date,
    diaEncerrado: boolean,
    ehFeriado: boolean,
  ): Promise<ItemJornada[]> {
    const [colaboradores, batidas] = await Promise.all([
      this.prisma.colaborador.findMany({
        where: { ativo: true, funcao: { in: FUNCOES_PONTO_NAO_FISCAL } },
        orderBy: { nome: 'asc' },
      }),
      this.prisma.batidaPonto.findMany({
        where: { tipoPessoa: 'OPERADOR', data: dia },
        orderBy: { hora: 'asc' },
        select: { id: true, pessoaId: true, hora: true },
      }),
    ]);

    const porPessoa = new Map<string, { id: string; hora: Date }[]>();
    for (const b of batidas) {
      const arr = porPessoa.get(b.pessoaId) ?? [];
      arr.push({ id: b.id, hora: b.hora });
      porPessoa.set(b.pessoaId, arr);
    }

    const diaSemana = dia.getUTCDay();
    return Promise.all(
      colaboradores
        .filter((c) => porPessoa.has(c.id))
        // Ordena pela 1ª batida do dia (quem abriu primeiro aparece primeiro).
        .sort(
          (a, b) =>
            porPessoa.get(a.id)![0].hora.getTime() -
            porPessoa.get(b.id)![0].hora.getTime(),
        )
        .map(async (c) => {
          const regras = await this.regrasDe(c.id);
          const j = calcularJornadaDia(
            porPessoa.get(c.id)!,
            limite,
            diaSemana,
            ehFeriado,
            diaEncerrado,
            regras,
          );
          return {
            fiscalId: c.id,
            pessoaId: c.id,
            tipoPessoa: 'OPERADOR',
            funcao: c.funcao,
            colaboradorId: c.id,
            primeiroNome: primeiroNome(c.nome),
            status: statusFiscalDeJornada(j.status),
            jornadaStatus: j.status,
            faltando: j.faltando,
            marcacoes: marcacoesDe(j.batidas),
            tempoTrabalhandoMs: j.trabalhadoMs,
            tempoIntervaloMs: j.intervaloMs,
            cargaHorariaMs: j.trabalhadoMs,
          };
        }),
    );
  }

  /** Registra a falta do fiscal no dia e avisa os gestores. */
  async registrarFalta(
    fiscalId: string,
    dia: Date = new Date(),
  ): Promise<void> {
    const data = inicioDoDia(dia);

    // Bloqueia marcar falta num ciclo de folha já fechado.
    await this.cicloFolha?.exigirCicloAberto(data);

    // Valida: se está de folga hoje, não pode marcar falta.
    if (await this.isFolgaHoje(fiscalId, dia)) {
      throw new FiscalDeFolgaError();
    }

    // Valida: se já tem registros de ponto hoje, não pode marcar falta.
    const registrosHoje = await this.prisma.registroPontoFiscal.findFirst({
      where: { fiscalId, data },
    });
    if (registrosHoje) {
      throw new JaIniciouJornadaError();
    }

    await this.prisma.ausencia.upsert({
      where: { pessoaId_data: { pessoaId: fiscalId, data } },
      update: {},
      create: { pessoaId: fiscalId, data },
    });
    const fiscal = await this.prisma.fiscal.findUnique({
      where: { id: fiscalId },
    });
    if (fiscal && this.notificacoes) {
      const gestores =
        await this.notificacoes.destinatariosComPermissao('FISCAIS_STATUS');
      await this.notificacoes.enviar(gestores, {
        titulo: 'Falta de fiscal',
        mensagem: `${primeiroNome(fiscal.nome)} informou falta hoje.`,
      });
    }
  }

  /**
   * Acumulado de horas extras do mês por pessoa. Horas extras = soma de
   * max(0, cargaTrabalhada - jornadaEsperada) por dia. Os DOMINGOS CONTAM: as
   * extras de domingo entram no adicional de 100%; de segunda a sábado, 50%
   * (mesma regra da jornada diária, `calcularJornadaDia`).
   */
  async horasExtrasMes(mes?: Date): Promise<ItemHorasExtras[]> {
    const agoraReal = new Date();
    const agoraPonto = agoraNaBrasilia();
    const referencia = mes ?? agoraPonto;
    const inicioMes = new Date(
      Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth(), 1),
    );
    const fimMes = new Date(
      Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth() + 1, 1),
    );
    // Feriados do mês (fonte única compartilhada com a Central): feriado conta
    // como domingo (base 7h20, extras 100%).
    const feriadoSet = await this.feriadosNoPeriodo(inicioMes, fimMes);

    const [fiscais, registros, batidasFiscais, mapaCol, operadores] =
      await Promise.all([
        this.prisma.fiscal.findMany({ orderBy: { nome: 'asc' } }),
        this.prisma.registroPontoFiscal.findMany({
          where: { data: { gte: inicioMes, lt: fimMes } },
          orderBy: { em: 'asc' },
        }),
        this.prisma.batidaPonto.findMany({
          where: { tipoPessoa: 'FISCAL', data: { gte: inicioMes, lt: fimMes } },
          orderBy: { hora: 'asc' },
          select: { id: true, pessoaId: true, hora: true, data: true },
        }),
        this.mapaColaboradores(),
        this.horasExtrasOperadoresMes(
          inicioMes,
          fimMes,
          agoraPonto,
          agoraReal,
          feriadoSet,
        ),
      ]);

    // Log legado por fiscal/dia (fallback) e batidas canônicas por fiscal/dia.
    const registrosPorFiscalDia = new Map<
      string,
      Map<string, RegistroPonto[]>
    >();
    for (const r of registros) {
      const diaKey = r.data.toISOString();
      if (!registrosPorFiscalDia.has(r.fiscalId)) {
        registrosPorFiscalDia.set(r.fiscalId, new Map());
      }
      const mapaFiscal = registrosPorFiscalDia.get(r.fiscalId)!;
      if (!mapaFiscal.has(diaKey)) mapaFiscal.set(diaKey, []);
      mapaFiscal
        .get(diaKey)!
        .push({ status: r.status as StatusFiscal, em: r.em });
    }
    const batidasPorFiscalDia = new Map<
      string,
      Map<string, { id: string; hora: Date }[]>
    >();
    for (const b of batidasFiscais) {
      const diaKey = b.data.toISOString();
      if (!batidasPorFiscalDia.has(b.pessoaId)) {
        batidasPorFiscalDia.set(b.pessoaId, new Map());
      }
      const mapaFiscal = batidasPorFiscalDia.get(b.pessoaId)!;
      if (!mapaFiscal.has(diaKey)) mapaFiscal.set(diaKey, []);
      mapaFiscal.get(diaKey)!.push({ id: b.id, hora: b.hora });
    }

    const dosFiscais: ItemHorasExtras[] = await Promise.all(
      fiscais.map(async (f) => {
        const regras = await this.regrasDe(
          mapaCol.get(f.id)?.colaboradorId ?? null,
        );
        const regDias = registrosPorFiscalDia.get(f.id);
        const batDias = batidasPorFiscalDia.get(f.id);
        // União dos dias com log OU com batidas (batidas-first, log de fallback).
        const dias = new Set<string>([
          ...(regDias?.keys() ?? []),
          ...(batDias?.keys() ?? []),
        ]);
        let horasExtras50Ms = 0;
        let horasExtras100Ms = 0;
        for (const diaKey of dias) {
          const diaDate = new Date(diaKey);
          const e = this.extrasDoDia(
            batDias?.get(diaKey),
            regDias?.get(diaKey),
            diaDate,
            feriadoSet.has(diaDate.getTime()),
            agoraPonto,
            agoraReal,
            regras,
          );
          horasExtras50Ms += e.horasExtras50Ms;
          horasExtras100Ms += e.horasExtras100Ms;
        }
        return {
          fiscalId: f.id,
          pessoaId: f.id,
          tipoPessoa: 'FISCAL' as const,
          primeiroNome: primeiroNome(f.nome),
          horasExtras50Ms,
          horasExtras100Ms,
          horasExtrasMs: horasExtras50Ms + horasExtras100Ms,
        };
      }),
    );

    return [...dosFiscais, ...operadores];
  }

  /**
   * Extras (50%/100%) de UMA pessoa num dia, com FONTE ÚNICA canônica: as
   * batidas do Relógio Ponto (`calcularJornadaDia`). O log legado
   * (`RegistroPontoFiscal` + `calcularJornada`) só entra como fallback quando
   * não há batidas naquele dia — preservando o histórico anterior à unificação
   * sem duplicar a regra de cálculo. Feriado conta como domingo (base 7h20,
   * 100%). As batidas usam hora de parede de Brasília (rotulada UTC); o log usa
   * instante UTC real — por isso cada fonte recebe o limite na sua referência.
   */
  private extrasDoDia(
    batidasDoDia: { id: string; hora: Date }[] | undefined,
    registrosDoDia: RegistroPonto[] | undefined,
    diaDate: Date,
    ehFeriado: boolean,
    agoraPonto: Date,
    agoraReal: Date,
    regras?: RegrasContrato,
  ): {
    trabalhadoMs: number;
    horasExtras50Ms: number;
    horasExtras100Ms: number;
  } {
    const diaSemana = diaDate.getUTCDay();
    const diaEncerrado = diaEncerradoEmBrasilia(diaDate, agoraPonto);
    if (batidasDoDia && batidasDoDia.length > 0) {
      const limite = diaEncerrado ? inicioDoProximoDia(diaDate) : agoraPonto;
      const j = calcularJornadaDia(
        batidasDoDia,
        limite,
        diaSemana,
        ehFeriado,
        diaEncerrado,
        regras,
      );
      return {
        trabalhadoMs: j.trabalhadoMs,
        horasExtras50Ms: j.horasExtras50Ms,
        horasExtras100Ms: j.horasExtras100Ms,
      };
    }
    if (registrosDoDia && registrosDoDia.length > 0) {
      const limite = diaEncerrado ? fimDoDiaBrasiliaEmUtc(diaDate) : agoraReal;
      const jornada = calcularJornada(registrosDoDia, limite, diaEncerrado);
      const base = ehFeriado
        ? jornadaEsperadaMs(0)
        : jornadaEsperadaMs(diaSemana);
      const contaComo100 = isDomingo(diaSemana) || ehFeriado;
      const extra = Math.max(0, jornada.cargaHorariaMs - base);
      return {
        trabalhadoMs: jornada.cargaHorariaMs,
        horasExtras50Ms: extra > 0 && !contaComo100 ? extra : 0,
        horasExtras100Ms: extra > 0 && contaComo100 ? extra : 0,
      };
    }
    return { trabalhadoMs: 0, horasExtras50Ms: 0, horasExtras100Ms: 0 };
  }

  /**
   * Horas extras do mês dos colaboradores NÃO-fiscais (operadores/supervisores)
   * que bateram ponto, a partir das batidas do Registro de Ponto. Os domingos
   * CONTAM, no adicional de 100% (reaproveita a regra de `calcularJornadaDia`).
   * Só inclui quem tem batidas no mês.
   */
  private async horasExtrasOperadoresMes(
    inicioMes: Date,
    fimMes: Date,
    agoraPonto: Date,
    agoraReal: Date,
    feriadoSet: Set<number>,
  ): Promise<ItemHorasExtras[]> {
    const [colaboradores, batidas] = await Promise.all([
      this.prisma.colaborador.findMany({
        where: { ativo: true, funcao: { in: FUNCOES_PONTO_NAO_FISCAL } },
        orderBy: { nome: 'asc' },
      }),
      this.prisma.batidaPonto.findMany({
        where: { tipoPessoa: 'OPERADOR', data: { gte: inicioMes, lt: fimMes } },
        orderBy: { hora: 'asc' },
        select: { id: true, pessoaId: true, hora: true, data: true },
      }),
    ]);

    // Agrupar batidas por pessoa e por dia.
    const porPessoaDia = new Map<
      string,
      Map<string, { id: string; hora: Date }[]>
    >();
    for (const b of batidas) {
      const diaKey = b.data.toISOString();
      if (!porPessoaDia.has(b.pessoaId))
        porPessoaDia.set(b.pessoaId, new Map());
      const mapaPessoa = porPessoaDia.get(b.pessoaId)!;
      if (!mapaPessoa.has(diaKey)) mapaPessoa.set(diaKey, []);
      mapaPessoa.get(diaKey)!.push({ id: b.id, hora: b.hora });
    }

    return Promise.all(
      colaboradores
        .filter((c) => porPessoaDia.has(c.id))
        .map(async (c) => {
          const regras = await this.regrasDe(c.id);
          let horasExtras50Ms = 0;
          let horasExtras100Ms = 0;
          const mapaPessoa = porPessoaDia.get(c.id)!;
          for (const [diaKey, regs] of mapaPessoa.entries()) {
            const diaDate = new Date(diaKey);
            // Operadores só têm batidas (sem log legado) — mesma fonte canônica.
            const e = this.extrasDoDia(
              regs,
              undefined,
              diaDate,
              feriadoSet.has(diaDate.getTime()),
              agoraPonto,
              agoraReal,
              regras,
            );
            horasExtras50Ms += e.horasExtras50Ms;
            horasExtras100Ms += e.horasExtras100Ms;
          }
          return {
            fiscalId: c.id,
            pessoaId: c.id,
            tipoPessoa: 'OPERADOR' as const,
            primeiroNome: primeiroNome(c.nome),
            horasExtras50Ms,
            horasExtras100Ms,
            horasExtrasMs: horasExtras50Ms + horasExtras100Ms,
          };
        }),
    );
  }

  /** Histórico semanal do próprio fiscal (últimos 7 dias trabalhados). */
  async historicoSemanal(usuarioId: string) {
    const fiscal = await this.prisma.fiscal.findFirst({ where: { usuarioId } });
    if (!fiscal) return null;

    const agoraReal = new Date();
    const agoraPonto = agoraNaBrasilia();
    const inicioJanela = inicioDoDia(
      new Date(agoraPonto.getTime() - 6 * 24 * 60 * 60 * 1000),
    );
    // Feriado segue a regra do domingo: esperado do dia é 0 (como no domingo).
    const feriadoSet = await this.feriadosNoPeriodo(
      inicioJanela,
      inicioDoProximoDia(agoraPonto),
    );
    const dias: {
      data: string;
      diaSemana: number;
      trabalhadoMs: number;
      esperadoMs: number;
    }[] = [];

    for (let i = 6; i >= 0; i--) {
      const dia = new Date(agoraPonto);
      dia.setUTCDate(dia.getUTCDate() - i);
      const dataInicio = inicioDoDia(dia);
      const diaSemana = dataInicio.getUTCDay();
      const ehFeriado = feriadoSet.has(dataInicio.getTime());

      const registros = await this.prisma.registroPontoFiscal.findMany({
        where: { fiscalId: fiscal.id, data: dataInicio },
        orderBy: { em: 'asc' },
      });

      const regs = registros.map((r) => ({
        status: r.status as StatusFiscal,
        em: r.em,
      }));
      const diaEncerrado = diaEncerradoEmBrasilia(dataInicio, agoraPonto);
      const limite = diaEncerrado
        ? fimDoDiaBrasiliaEmUtc(dataInicio)
        : agoraReal;
      const jornada = calcularJornada(regs, limite, diaEncerrado);

      dias.push({
        data: dataInicio.toISOString().slice(0, 10),
        diaSemana,
        trabalhadoMs: jornada.cargaHorariaMs,
        esperadoMs:
          isDomingo(diaSemana) || ehFeriado ? 0 : jornadaEsperadaMs(diaSemana),
      });
    }

    return {
      fiscalId: fiscal.id,
      primeiroNome: primeiroNome(fiscal.nome),
      dias,
    };
  }

  /** Ranking do mês por puntualidade (quem registra mais perto do horário). */
  async rankingMes() {
    const agora = new Date();
    const inicioMes = new Date(
      Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1),
    );
    const fimMes = new Date(
      Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1),
    );

    const fiscais = await this.prisma.fiscal.findMany();
    const registros = await this.prisma.registroPontoFiscal.findMany({
      where: { data: { gte: inicioMes, lt: fimMes } },
      orderBy: { em: 'asc' },
    });
    const escalas = await this.prisma.escalaEntry.findMany({
      where: { folga: false },
    });

    // Mapa de escala por fiscal + dia.
    const escalaMap = new Map<string, Map<number, string>>();
    for (const e of escalas) {
      if (!e.entrada) continue;
      if (!escalaMap.has(e.funcionarioId))
        escalaMap.set(e.funcionarioId, new Map());
      escalaMap.get(e.funcionarioId)!.set(e.diaSemana, e.entrada);
    }

    // Agrupar primeiro DISPONIVEL por fiscal por dia.
    const primeiroDisponivel = new Map<
      string,
      { desvioTotalMin: number; diasContados: number }
    >();

    for (const fiscal of fiscais) {
      const fiscalRegs = registros.filter((r) => r.fiscalId === fiscal.id);
      const porDia = new Map<string, Date>();

      for (const r of fiscalRegs) {
        if (r.status !== 'DISPONIVEL') continue;
        const diaKey = r.data.toISOString();
        if (!porDia.has(diaKey)) {
          porDia.set(diaKey, r.em);
        }
      }

      const escalaFiscal = escalaMap.get(fiscal.id);
      if (!escalaFiscal) continue;

      let desvioTotal = 0;
      let diasContados = 0;

      for (const [diaKey, primeiraEntrada] of porDia.entries()) {
        const diaDate = new Date(diaKey);
        const diaSemana = diaDate.getUTCDay();
        const entradaPrevista = escalaFiscal.get(diaSemana);
        if (!entradaPrevista) continue;

        const [h, m] = entradaPrevista.split(':').map(Number);
        const previstoMs = (h * 60 + m) * 60 * 1000;
        const realMs =
          (primeiraEntrada.getUTCHours() * 60 +
            primeiraEntrada.getUTCMinutes()) *
            60 *
            1000 +
          primeiraEntrada.getUTCSeconds() * 1000;
        const desvio = Math.abs(realMs - previstoMs) / 60000; // em minutos
        desvioTotal += desvio;
        diasContados++;
      }

      primeiroDisponivel.set(fiscal.id, {
        desvioTotalMin: desvioTotal,
        diasContados,
      });
    }

    // Calcular ranking (menor desvio médio = mais pontual).
    const ranking = fiscais
      .map((f) => {
        const dados = primeiroDisponivel.get(f.id);
        const diasContados = dados?.diasContados ?? 0;
        const desvioMedio =
          diasContados > 0 ? dados!.desvioTotalMin / diasContados : 999;
        return {
          fiscalId: f.id,
          primeiroNome: primeiroNome(f.nome),
          diasContados,
          desvioMedioMin: Math.round(desvioMedio * 10) / 10,
          pontuacao: diasContados > 0 ? Math.max(0, 100 - desvioMedio * 5) : 0,
        };
      })
      .filter((r) => r.diasContados > 0)
      .sort((a, b) => b.pontuacao - a.pontuacao);

    return ranking;
  }

  /** Previsão de horas extras ao final do mês (projeção linear). */
  async previsaoExtras() {
    const agoraReal = new Date();
    const agoraPonto = agoraNaBrasilia();
    const inicioMes = new Date(
      Date.UTC(agoraPonto.getUTCFullYear(), agoraPonto.getUTCMonth(), 1),
    );
    const fimMes = new Date(
      Date.UTC(agoraPonto.getUTCFullYear(), agoraPonto.getUTCMonth() + 1, 1),
    );

    // Feriado conta como domingo: fica fora da projeção de extras "de dia útil"
    // — tanto do acúmulo (numerador) quanto da contagem de dias (denominador).
    const feriadoSet = await this.feriadosNoPeriodo(inicioMes, fimMes);
    // Dias úteis transcorridos no mês (excluindo domingos e feriados).
    const diasTranscorridos = this.diasUteisEntre(
      inicioMes,
      agoraPonto,
      feriadoSet,
    );
    const diasTotaisMes = this.diasUteisEntre(inicioMes, fimMes, feriadoSet);

    if (diasTranscorridos === 0) return [];

    const fiscais = await this.prisma.fiscal.findMany({
      orderBy: { nome: 'asc' },
    });
    const registros = await this.prisma.registroPontoFiscal.findMany({
      where: { data: { gte: inicioMes, lt: fimMes } },
      orderBy: { em: 'asc' },
    });

    const porFiscalDia = new Map<
      string,
      Map<string, { status: StatusFiscal; em: Date }[]>
    >();
    for (const r of registros) {
      const diaKey = r.data.toISOString();
      if (!porFiscalDia.has(r.fiscalId))
        porFiscalDia.set(r.fiscalId, new Map());
      const m = porFiscalDia.get(r.fiscalId)!;
      if (!m.has(diaKey)) m.set(diaKey, []);
      m.get(diaKey)!.push({ status: r.status as StatusFiscal, em: r.em });
    }

    return fiscais.map((f) => {
      const mapaFiscal = porFiscalDia.get(f.id);
      let extrasAtualMs = 0;

      if (mapaFiscal) {
        for (const [diaKey, regs] of mapaFiscal.entries()) {
          const diaDate = new Date(diaKey);
          const diaSemana = diaDate.getUTCDay();
          if (isDomingo(diaSemana) || feriadoSet.has(diaDate.getTime())) {
            continue;
          }

          const diaEncerrado = diaEncerradoEmBrasilia(diaDate, agoraPonto);
          const limite = diaEncerrado
            ? fimDoDiaBrasiliaEmUtc(diaDate)
            : agoraReal;
          const jornada = calcularJornada(regs, limite, diaEncerrado);
          const esperado = jornadaEsperadaMs(diaSemana);
          const extra = jornada.cargaHorariaMs - esperado;
          if (extra > 0) extrasAtualMs += extra;
        }
      }

      // Projeção linear: (extras atuais / dias transcorridos) * dias totais
      const projecaoMs = Math.round(
        (extrasAtualMs / diasTranscorridos) * diasTotaisMes,
      );
      const critico = projecaoMs > 7 * 60 * 60 * 1000; // >7h projetado

      return {
        fiscalId: f.id,
        primeiroNome: primeiroNome(f.nome),
        extrasAtualMs,
        projecaoMesMs: projecaoMs,
        critico,
      };
    });
  }

  /** Contexto de escala formatado para integração com Cluby (texto). */
  async contextoEscala(): Promise<{ contexto: string }> {
    const fiscais = await this.prisma.fiscal.findMany({
      orderBy: { nome: 'asc' },
    });
    const escalas = await this.prisma.escalaEntry.findMany();
    const DIAS = [
      'Domingo',
      'Segunda',
      'Terça',
      'Quarta',
      'Quinta',
      'Sexta',
      'Sábado',
    ];

    const linhas: string[] = ['=== ESCALA DE FISCAIS ==='];

    for (const fiscal of fiscais) {
      const escFiscal = escalas.filter((e) => e.funcionarioId === fiscal.id);
      linhas.push(
        `\n${fiscal.nome} (${fiscal.turno}${fiscal.especial ? ' - horário especial' : ''}):`,
      );
      for (let dia = 0; dia <= 6; dia++) {
        const esc = escFiscal.find((e) => e.diaSemana === dia);
        if (!esc) continue;
        if (esc.folga) {
          linhas.push(`  ${DIAS[dia]}: FOLGA`);
        } else {
          linhas.push(`  ${DIAS[dia]}: ${esc.entrada} - ${esc.saida}`);
        }
      }
    }

    return { contexto: linhas.join('\n') };
  }

  /** Conta dias úteis (excluindo domingos e feriados) entre duas datas. */
  private diasUteisEntre(
    inicio: Date,
    fim: Date,
    feriadoSet: Set<number> = new Set(),
  ): number {
    let count = 0;
    const cursor = new Date(inicio);
    while (cursor < fim) {
      if (cursor.getUTCDay() !== 0 && !feriadoSet.has(cursor.getTime())) {
        count++;
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return count;
  }

  /** Verifica se o fiscal está de folga num dia (baseado na escala). */
  private async isFolgaHoje(
    fiscalId: string,
    dia: Date = new Date(),
  ): Promise<boolean> {
    const diaSemana = this.diaSemanaEmBrasilia(dia);
    const escala = await this.prisma.escalaEntry.findFirst({
      where: { funcionarioId: fiscalId, diaSemana, folga: true },
    });
    return !!escala;
  }

  /** Lista de fiscais que estão de folga hoje. */
  async folgaHoje(dia: Date = new Date()): Promise<ItemFolga[]> {
    const diaSemana = this.diaSemanaEmBrasilia(dia);
    const escalas = await this.prisma.escalaEntry.findMany({
      where: { diaSemana, folga: true },
    });
    if (escalas.length === 0) return [];

    const fiscalIds = escalas.map((e) => e.funcionarioId);
    const fiscais = await this.prisma.fiscal.findMany({
      where: { id: { in: fiscalIds } },
      orderBy: { nome: 'asc' },
    });
    return fiscais.map((f) => ({
      fiscalId: f.id,
      primeiroNome: primeiroNome(f.nome),
    }));
  }

  /** Retorna o dia da semana (0=Dom..6=Sáb) no fuso de Brasília (UTC-3). */
  private diaSemanaEmBrasilia(data: Date = new Date()): number {
    // Brasília = UTC-3. Subtrai 3 horas para obter a data/hora local.
    const emBrasilia = new Date(data.getTime() - 3 * 60 * 60 * 1000);
    return emBrasilia.getUTCDay();
  }

  /** Agrupa registros (linha do banco) por fiscalId, mantendo a ordem. */
  private agrupar(
    registros: { fiscalId: string; status: string; em: Date }[],
  ): Map<string, RegistroPonto[]> {
    const mapa = new Map<string, RegistroPonto[]>();
    for (const r of registros) {
      const arr = mapa.get(r.fiscalId) ?? [];
      arr.push({ status: r.status as StatusFiscal, em: r.em });
      mapa.set(r.fiscalId, arr);
    }
    return mapa;
  }
}
