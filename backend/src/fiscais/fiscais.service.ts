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
  mensagemTransicao,
  primeiroNome,
  statusAtual,
} from './fiscais.domain';
import { FiscalNaoEncontradoError, FaltaRegistradaError, JaIniciouJornadaError } from './fiscais.errors';
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
  async meuResumo(usuarioId: string): Promise<(ResumoStatus & Jornada & { faltaHoje: boolean }) | null> {
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
    return {
      fiscalId: fiscal.id,
      primeiroNome: primeiroNome(fiscal.nome),
      status: statusAtual(registros) ?? 'FORA_EXPEDIENTE',
      em: (ultimo?.em ?? agora).toISOString(),
      faltaHoje,
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
