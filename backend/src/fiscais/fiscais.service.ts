import { Injectable, Optional } from '@nestjs/common';
import { Fiscal } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { ValidacaoDataService } from '../data-inicial/validacao-data.service';
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

/** Item do log de jornada do dia (tempos por fiscal). */
export interface ItemJornada extends Jornada {
  fiscalId: string;
  colaboradorId: string | null;
  primeiroNome: string;
  status: StatusFiscal;
}

/** Resumo do status atual de um fiscal (retornado após definir status). */
export interface ResumoStatus {
  fiscalId: string;
  primeiroNome: string;
  status: StatusFiscal;
  em: string;
}

/** Acumulado de horas extras do mês por fiscal. */
export interface ItemHorasExtras {
  fiscalId: string;
  primeiroNome: string;
  horasExtrasMs: number;
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
  ) {}

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
      const gestores = await this.notificacoes.gestores();
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
   * Substitui os registros de ponto de um fiscal no dia pelas transições
   * derivadas das batidas do Registro de Ponto (ponte batidas → status).
   *
   * Reescreve o log do dia (apaga e recria) para que painel, perfil e crons —
   * que leem `RegistroPontoFiscal` — reflitam exatamente as batidas, sem
   * duplicar. Propaga o status resultante em tempo real. `em` de cada transição
   * já vem em UTC real (a ponte converte a hora da batida).
   */
  async aplicarTransicoesDoDia(
    fiscalId: string,
    dia: Date,
    transicoes: { status: StatusFiscal; em: Date }[],
  ): Promise<void> {
    const data = inicioDoDia(dia);
    const ordenadas = [...transicoes].sort(
      (a, b) => a.em.getTime() - b.em.getTime(),
    );

    await this.prisma.$transaction([
      this.prisma.registroPontoFiscal.deleteMany({ where: { fiscalId, data } }),
      ...(ordenadas.length > 0
        ? [
            this.prisma.registroPontoFiscal.createMany({
              data: ordenadas.map((t) => ({
                fiscalId,
                status: t.status,
                data,
                em: t.em,
              })),
            }),
          ]
        : []),
    ]);

    // Tempo real: propaga o status resultante (o do último registro do dia).
    const fiscal = await this.prisma.fiscal.findUnique({
      where: { id: fiscalId },
    });
    const ultimo = ordenadas[ordenadas.length - 1] ?? null;
    this.eventos?.publicar({
      fiscalId,
      primeiroNome: primeiroNome(fiscal?.nome ?? ''),
      status: ultimo?.status ?? 'FORA_EXPEDIENTE',
      em: ultimo?.em ?? new Date(),
    });
  }

  /** Painel de todos os fiscais com o status atual (tempo real via WebSocket). */
  async painel(): Promise<ItemPainel[]> {
    const agora = new Date();
    const [fiscais, registros, mapaCol] = await Promise.all([
      this.prisma.fiscal.findMany({ orderBy: { nome: 'asc' } }),
      this.prisma.registroPontoFiscal.findMany({
        where: { data: inicioDoDia(agora) },
        orderBy: { em: 'asc' },
      }),
      this.mapaColaboradores(),
    ]);
    const porFiscal = this.agrupar(registros);
    return fiscais.map((f) => {
      const regs = porFiscal.get(f.id) ?? [];
      const ultimo = regs[regs.length - 1] ?? null;
      const col = mapaCol.get(f.id);
      return {
        fiscalId: f.id,
        colaboradorId: col?.colaboradorId ?? null,
        primeiroNome: primeiroNome(col?.nome ?? f.nome),
        status: statusAtual(regs) ?? 'FORA_EXPEDIENTE',
        desde: ultimo ? ultimo.em.toISOString() : null,
      };
    });
  }

  /** Log de jornada do dia (tempos por fiscal) — uso gerencial. */
  async jornadaDoDia(data: Date = new Date()): Promise<ItemJornada[]> {
    const agora = new Date();
    const fim = inicioDoProximoDia(data);
    // Para dias passados, conta no máximo até o fim do dia; para hoje, até agora.
    const limite = agora < fim ? agora : fim;
    const [fiscais, registros, mapaCol] = await Promise.all([
      this.prisma.fiscal.findMany({ orderBy: { nome: 'asc' } }),
      this.prisma.registroPontoFiscal.findMany({
        where: { data: inicioDoDia(data) },
        orderBy: { em: 'asc' },
      }),
      this.mapaColaboradores(),
    ]);
    const porFiscal = this.agrupar(registros);
    return fiscais.map((f) => {
      const regs = porFiscal.get(f.id) ?? [];
      const col = mapaCol.get(f.id);
      return {
        fiscalId: f.id,
        colaboradorId: col?.colaboradorId ?? null,
        primeiroNome: primeiroNome(col?.nome ?? f.nome),
        status: statusAtual(regs) ?? 'FORA_EXPEDIENTE',
        ...calcularJornada(regs, limite),
      };
    });
  }

  /** Registra a falta do fiscal no dia e avisa os gestores. */
  async registrarFalta(
    fiscalId: string,
    dia: Date = new Date(),
  ): Promise<void> {
    const data = inicioDoDia(dia);

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
      const gestores = await this.notificacoes.gestores();
      await this.notificacoes.enviar(gestores, {
        titulo: 'Falta de fiscal',
        mensagem: `${primeiroNome(fiscal.nome)} informou falta hoje.`,
      });
    }
  }

  /**
   * Acumulado de horas extras do mês por fiscal (excluindo domingos).
   * Horas extras = soma de max(0, cargaTrabalhada - jornadaEsperada) por dia.
   */
  async horasExtrasMes(mes?: Date): Promise<ItemHorasExtras[]> {
    const referencia = mes ?? new Date();
    const inicioMes = new Date(
      Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth(), 1),
    );
    const fimMes = new Date(
      Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth() + 1, 1),
    );
    // Limita ao dia de hoje se for o mês atual.
    const agora = new Date();
    const limite = agora < fimMes ? agora : fimMes;

    const [fiscais, registros] = await Promise.all([
      this.prisma.fiscal.findMany({ orderBy: { nome: 'asc' } }),
      this.prisma.registroPontoFiscal.findMany({
        where: { data: { gte: inicioMes, lt: fimMes } },
        orderBy: { em: 'asc' },
      }),
    ]);

    // Agrupar registros por fiscalId e por data (dia).
    const porFiscalDia = new Map<string, Map<string, RegistroPonto[]>>();
    for (const r of registros) {
      const diaKey = r.data.toISOString();
      if (!porFiscalDia.has(r.fiscalId)) {
        porFiscalDia.set(r.fiscalId, new Map());
      }
      const mapaFiscal = porFiscalDia.get(r.fiscalId)!;
      if (!mapaFiscal.has(diaKey)) {
        mapaFiscal.set(diaKey, []);
      }
      mapaFiscal
        .get(diaKey)!
        .push({ status: r.status as StatusFiscal, em: r.em });
    }

    return fiscais.map((f) => {
      const mapaFiscal = porFiscalDia.get(f.id);
      let horasExtrasMs = 0;

      if (mapaFiscal) {
        for (const [diaKey, regs] of mapaFiscal.entries()) {
          const diaDate = new Date(diaKey);
          const diaSemana = diaDate.getUTCDay();

          // Domingos não contam para horas extras.
          if (isDomingo(diaSemana)) continue;

          const fimDia = inicioDoProximoDia(diaDate);
          const limiteDia = limite < fimDia ? limite : fimDia;
          const jornada = calcularJornada(regs, limiteDia);
          const esperado = jornadaEsperadaMs(diaSemana);
          const extra = jornada.cargaHorariaMs - esperado;
          if (extra > 0) {
            horasExtrasMs += extra;
          }
        }
      }

      return {
        fiscalId: f.id,
        primeiroNome: primeiroNome(f.nome),
        horasExtrasMs,
      };
    });
  }

  /** Histórico semanal do próprio fiscal (últimos 7 dias trabalhados). */
  async historicoSemanal(usuarioId: string) {
    const fiscal = await this.prisma.fiscal.findFirst({ where: { usuarioId } });
    if (!fiscal) return null;

    const agora = new Date();
    const dias: {
      data: string;
      diaSemana: number;
      trabalhadoMs: number;
      esperadoMs: number;
    }[] = [];

    for (let i = 6; i >= 0; i--) {
      const dia = new Date(agora);
      dia.setDate(dia.getDate() - i);
      const dataInicio = inicioDoDia(dia);
      const diaSemana = dataInicio.getUTCDay();

      const registros = await this.prisma.registroPontoFiscal.findMany({
        where: { fiscalId: fiscal.id, data: dataInicio },
        orderBy: { em: 'asc' },
      });

      const regs = registros.map((r) => ({
        status: r.status as StatusFiscal,
        em: r.em,
      }));
      const fimDia = inicioDoProximoDia(dia);
      const limite = agora < fimDia ? agora : fimDia;
      const jornada = calcularJornada(regs, limite);

      dias.push({
        data: dataInicio.toISOString().slice(0, 10),
        diaSemana,
        trabalhadoMs: jornada.cargaHorariaMs,
        esperadoMs: isDomingo(diaSemana) ? 0 : jornadaEsperadaMs(diaSemana),
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
    const agora = new Date();
    const inicioMes = new Date(
      Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1),
    );
    const fimMes = new Date(
      Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1),
    );

    // Dias úteis transcorridos no mês (excluindo domingos).
    const diasTranscorridos = this.diasUteisEntre(inicioMes, agora);
    const diasTotaisMes = this.diasUteisEntre(inicioMes, fimMes);

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
          if (isDomingo(diaSemana)) continue;

          const fimDia = new Date(diaDate.getTime() + 24 * 60 * 60 * 1000);
          const limite = agora < fimDia ? agora : fimDia;
          const jornada = calcularJornada(regs, limite);
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

  /** Conta dias úteis (excluindo domingos) entre duas datas. */
  private diasUteisEntre(inicio: Date, fim: Date): number {
    let count = 0;
    const cursor = new Date(inicio);
    while (cursor < fim) {
      if (cursor.getUTCDay() !== 0) count++;
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
