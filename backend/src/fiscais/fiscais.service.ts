import { Injectable, Optional } from '@nestjs/common';
import { Fiscal } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
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
import { FiscalNaoEncontradoError, FaltaRegistradaError, JaIniciouJornadaError, FiscalDeFolgaError } from './fiscais.errors';
import { FiscalStatusEventos } from './fiscais.eventos';

/** Item do painel em tempo real: um fiscal e seu status atual. */
export interface ItemPainel {
  fiscalId: string;
  primeiroNome: string;
  status: StatusFiscal;
  /** Instante (ISO) do último registro; null se ainda não bateu ponto hoje. */
  desde: string | null;
}

/** Item do log de jornada do dia (tempos por fiscal). */
export interface ItemJornada extends Jornada {
  fiscalId: string;
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
   * Resumo do próprio fiscal (status atual + jornada do dia). Retorna null se o
   * usuário autenticado não for um fiscal (ex.: gerente apenas visualizando).
   */
  async meuResumo(usuarioId: string): Promise<(ResumoStatus & Jornada & { faltaHoje: boolean; folgaHoje: boolean }) | null> {
    const fiscal = await this.prisma.fiscal.findFirst({ where: { usuarioId } });
    if (!fiscal) {
      return null;
    }
    const agora = new Date();
    const registros = await this.registrosDoDia(fiscal.id, agora);
    const ultimo = registros[registros.length - 1] ?? null;
    const faltaHoje = !!(await this.prisma.ausencia.findUnique({
      where: { pessoaId_data: { pessoaId: fiscal.id, data: inicioDoDia(agora) } },
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
    // Validar: si está de folga hoy, no puede registrar ponto.
    if (await this.isFolgaHoje(fiscalId, em)) {
      throw new FiscalDeFolgaError();
    }

    // Validar: si ya marcó falta hoy, no puede registrar ponto.
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

    return { fiscalId, primeiroNome: pn, status, em: em.toISOString(), ...jornada };
  }

  /** Painel de todos os fiscais com o status atual (tempo real via WebSocket). */
  async painel(): Promise<ItemPainel[]> {
    const agora = new Date();
    const [fiscais, registros] = await Promise.all([
      this.prisma.fiscal.findMany({ orderBy: { nome: 'asc' } }),
      this.prisma.registroPontoFiscal.findMany({
        where: { data: inicioDoDia(agora) },
        orderBy: { em: 'asc' },
      }),
    ]);
    const porFiscal = this.agrupar(registros);
    return fiscais.map((f) => {
      const regs = porFiscal.get(f.id) ?? [];
      const ultimo = regs[regs.length - 1] ?? null;
      return {
        fiscalId: f.id,
        primeiroNome: primeiroNome(f.nome),
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
    const [fiscais, registros] = await Promise.all([
      this.prisma.fiscal.findMany({ orderBy: { nome: 'asc' } }),
      this.prisma.registroPontoFiscal.findMany({
        where: { data: inicioDoDia(data) },
        orderBy: { em: 'asc' },
      }),
    ]);
    const porFiscal = this.agrupar(registros);
    return fiscais.map((f) => {
      const regs = porFiscal.get(f.id) ?? [];
      return {
        fiscalId: f.id,
        primeiroNome: primeiroNome(f.nome),
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

    // Validar: si está de folga hoy, no puede marcar falta.
    if (await this.isFolgaHoje(fiscalId, dia)) {
      throw new FiscalDeFolgaError();
    }

    // Validar: si ya tiene registros de ponto hoy, no puede marcar falta.
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
  async horasExtrasMes(
    mes?: Date,
  ): Promise<ItemHorasExtras[]> {
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
      mapaFiscal.get(diaKey)!.push({ status: r.status as StatusFiscal, em: r.em });
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

  /** Verifica se o fiscal está de folga num dia (baseado na escala). */
  private async isFolgaHoje(fiscalId: string, dia: Date = new Date()): Promise<boolean> {
    const diaSemana = dia.getDay();
    const escala = await this.prisma.escalaEntry.findFirst({
      where: { funcionarioId: fiscalId, diaSemana, folga: true },
    });
    return !!escala;
  }

  /** Lista de fiscais que estão de folga hoje. */
  async folgaHoje(dia: Date = new Date()): Promise<ItemFolga[]> {
    const diaSemana = dia.getDay();
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
