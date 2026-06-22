import { Injectable, Logger, Optional } from '@nestjs/common';
import { Checklist } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import {
  ArquivoRef,
  JanelaExecucao,
  StatusChecklist,
  StatusVisual,
  TipoChecklist,
  derivarStatusVisual,
  deveAlertar,
  deveLembrarInicio,
  ehImagem,
  janela,
  janelaTexto,
  minutosDoDia,
} from './checklist.domain';
import { ArquivoNaoImagemError } from './checklist.errors';

/** Normaliza uma data para o início do dia (UTC), chave do checklist diário. */
function inicioDoDia(data: Date): Date {
  return new Date(
    Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()),
  );
}

function addDias(data: Date, dias: number): Date {
  const d = inicioDoDia(data);
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

const TIPOS: TipoChecklist[] = ['ABERTURA', 'FECHAMENTO'];

/** Data/hora atuais no fuso de Brasília (minutos do dia + data ISO). */
function agoraBrasilia(): { dataISO: string; minutos: number } {
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
  let hora = parseInt(get('hour'), 10);
  if (hora === 24) hora = 0;
  return {
    dataISO: `${get('year')}-${get('month')}-${get('day')}`,
    minutos: hora * 60 + parseInt(get('minute'), 10),
  };
}

/**
 * Minutos do dia "relativos" a uma data: se a data já passou, retorna um valor
 * acima de qualquer janela (dia encerrado); se é futura, retorna -1; se é hoje,
 * os minutos atuais de Brasília. Serve para derivar NAO_FEITO/PENDENTE.
 */
function minutosRelativos(dataISO: string, agora: { dataISO: string; minutos: number }): number {
  if (dataISO < agora.dataISO) return 24 * 60 + 1;
  if (dataISO > agora.dataISO) return -1;
  return agora.minutos;
}

/** Estado rico de um checklist (para a UI). */
export interface ChecklistEstado {
  tipo: TipoChecklist;
  status: StatusChecklist;
  statusVisual: StatusVisual;
  janela: { inicio: string; fim: string };
  enviadoPor: string | null;
  enviadoEm: string | null;
  imagemUrl: string | null;
  noPrazo: boolean | null;
  /** Foto repetida (mesmo hash de outro checklist) — possível fraude. */
  duplicado: boolean;
}

export interface EstadoChecklists {
  dataISO: string;
  abertura: ChecklistEstado;
  fechamento: ChecklistEstado;
}

export interface ChecklistMetricas {
  mes: string;
  diasOperacao: number;
  totalEsperado: number;
  feitos: number;
  noPrazo: number;
  percentualNoPrazo: number;
  rachaDias: number;
}

export interface ChecklistHistoricoTipo {
  statusVisual: StatusVisual;
  imagemUrl: string | null;
  enviadoPor: string | null;
  enviadoEm: string | null;
}

export interface ChecklistHistoricoDia {
  dataISO: string;
  diaSemana: number;
  abertura: ChecklistHistoricoTipo | null;
  fechamento: ChecklistHistoricoTipo | null;
}

/**
 * Serviço do Modulo_Checklist (Req 5.1–5.3): checklists diários de abertura e
 * fechamento por upload de imagem (na prática, um print do checklist feito no
 * "Checklist Fácil"). Expõe janelas fixas, estado rico (pontualidade,
 * auditoria), métricas de cumprimento, histórico e a detecção de foto repetida
 * (anti-fraude). A lógica pura fica em `checklist.domain`.
 */
@Injectable()
export class ChecklistService {
  private readonly logger = new Logger(ChecklistService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

  /** Disponibiliza (cria se ausente) o checklist diário (Req 5.1.1). */
  async garantirChecklistDoDia(
    tipo: TipoChecklist,
    data: Date,
  ): Promise<Checklist> {
    const dia = inicioDoDia(data);
    const existente = await this.prisma.checklist.findUnique({
      where: { tipo_data: { tipo, data: dia } },
    });
    if (existente) return existente;
    return this.prisma.checklist.create({
      data: { tipo, data: dia, status: 'PENDENTE' },
    });
  }

  /** Valida se um arquivo é uma imagem (Req 5.1.4). */
  validarImagem(arquivo: ArquivoRef): boolean {
    return ehImagem(arquivo);
  }

  /**
   * Envia uma imagem para um checklist (Req 5.1.2, 5.1.3): marca "FEITO",
   * registra data/horário/usuário, a pontualidade (dentro da janela) e o hash
   * da imagem. Dispara aviso aos gestores se a mesma foto já foi usada antes
   * (anti-fraude). Rejeita não-imagem com `ArquivoNaoImagemError`.
   */
  async enviarImagem(
    tipo: TipoChecklist,
    data: Date,
    arquivo: ArquivoRef & { url?: string; hash?: string },
    usuarioId: string,
    enviadoEm: Date = new Date(),
  ): Promise<Checklist> {
    if (!ehImagem(arquivo)) {
      throw new ArquivoNaoImagemError(
        arquivo.mimeType ?? arquivo.nome ?? undefined,
      );
    }
    const dia = inicioDoDia(data);
    const agora = agoraBrasilia();
    // Pontualidade: enviado dentro da janela (só faz sentido no mesmo dia).
    const noPrazo =
      agora.dataISO === dia.toISOString().slice(0, 10)
        ? agora.minutos >= janela(tipo).inicioMin &&
          agora.minutos <= janela(tipo).fimMin
        : null;

    const salvo = await this.prisma.checklist.upsert({
      where: { tipo_data: { tipo, data: dia } },
      create: {
        tipo,
        data: dia,
        status: 'FEITO',
        imagemUrl: arquivo.url ?? null,
        imagemHash: arquivo.hash ?? null,
        noPrazo,
        enviadoPor: usuarioId,
        enviadoEm,
      },
      update: {
        status: 'FEITO',
        imagemUrl: arquivo.url ?? null,
        imagemHash: arquivo.hash ?? null,
        noPrazo,
        enviadoPor: usuarioId,
        enviadoEm,
      },
    });

    // Anti-fraude: a mesma imagem (hash) já foi usada em outro checklist?
    if (arquivo.hash) {
      void this.avisarFotoRepetida(tipo, arquivo.hash, salvo.id);
    }
    return salvo;
  }

  /** Notifica gestores quando a mesma foto (hash) já foi usada antes. */
  private async avisarFotoRepetida(
    tipo: TipoChecklist,
    hash: string,
    idAtual: string,
  ): Promise<void> {
    if (!this.notificacoes) return;
    try {
      const outro = await this.prisma.checklist.findFirst({
        where: { imagemHash: hash, id: { not: idAtual } },
        orderBy: { data: 'desc' },
      });
      if (!outro) return;
      const gestores = await this.notificacoes.gestores();
      if (gestores.length === 0) return;
      const rotulo = tipo === 'ABERTURA' ? 'abertura' : 'fechamento';
      const quando = outro.data.toISOString().slice(0, 10);
      await this.notificacoes.enviar(gestores, {
        titulo: '⚠️ Possível foto repetida no checklist',
        mensagem: `A imagem enviada no checklist de ${rotulo} é idêntica a uma já usada (${quando}). Verifique se o print é do dia.`,
      });
    } catch (erro) {
      this.logger.warn(`Falha ao verificar foto repetida: ${String(erro)}`);
    }
  }

  /** Status simples do checklist do dia (Req 5.1.5) — compatibilidade. */
  async status(tipo: TipoChecklist, data: Date): Promise<StatusChecklist> {
    const dia = inicioDoDia(data);
    const checklist = await this.prisma.checklist.findUnique({
      where: { tipo_data: { tipo, data: dia } },
    });
    return (checklist?.status as StatusChecklist) ?? 'PENDENTE';
  }

  /** Janela de execução fixa de um checklist (Req 5.2). */
  janela(tipo: TipoChecklist): JanelaExecucao {
    return janela(tipo);
  }

  /**
   * Estado rico dos dois checklists de um dia: status visual (pontual/atrasado/
   * pendente/não feito), janela, quem enviou, quando, imagem, pontualidade e
   * se a foto é repetida (anti-fraude).
   */
  async estado(data: Date): Promise<EstadoChecklists> {
    const dia = inicioDoDia(data);
    const dataISO = dia.toISOString().slice(0, 10);
    const agora = agoraBrasilia();
    const minutos = minutosRelativos(dataISO, agora);

    const registros = await this.prisma.checklist.findMany({
      where: { data: dia },
    });

    // Resolve nomes de quem enviou.
    const ids = registros
      .map((r) => r.enviadoPor)
      .filter((x): x is string => !!x);
    const usuarios = ids.length
      ? await this.prisma.usuario.findMany({
          where: { id: { in: ids } },
          select: { id: true, nome: true, login: true },
        })
      : [];
    const nomeDe = (id: string | null): string | null => {
      if (!id) return null;
      const u = usuarios.find((x) => x.id === id);
      return u ? u.nome ?? u.login : id;
    };

    // Hashes repetidos (aparecem em mais de um checklist no histórico).
    const hashes = registros
      .map((r) => r.imagemHash)
      .filter((x): x is string => !!x);
    const repetidos = new Set<string>();
    if (hashes.length > 0) {
      const ocorrencias = await this.prisma.checklist.findMany({
        where: { imagemHash: { in: hashes } },
        select: { imagemHash: true },
      });
      const contagem = new Map<string, number>();
      for (const o of ocorrencias) {
        if (o.imagemHash) {
          contagem.set(o.imagemHash, (contagem.get(o.imagemHash) ?? 0) + 1);
        }
      }
      for (const [h, n] of contagem) if (n > 1) repetidos.add(h);
    }

    const build = (tipo: TipoChecklist): ChecklistEstado => {
      const r = registros.find((x) => x.tipo === tipo);
      const status = (r?.status as StatusChecklist) ?? 'PENDENTE';
      const noPrazo = r?.noPrazo ?? null;
      return {
        tipo,
        status,
        statusVisual: derivarStatusVisual(status, noPrazo, minutos, tipo),
        janela: janelaTexto(tipo),
        enviadoPor: nomeDe(r?.enviadoPor ?? null),
        enviadoEm: r?.enviadoEm ? r.enviadoEm.toISOString() : null,
        imagemUrl: r?.imagemUrl ?? null,
        noPrazo,
        duplicado: !!(r?.imagemHash && repetidos.has(r.imagemHash)),
      };
    };

    return { dataISO, abertura: build('ABERTURA'), fechamento: build('FECHAMENTO') };
  }

  /**
   * Métricas de cumprimento do mês que contém a data: dias de operação
   * (Seg–Sáb até hoje), total esperado (2 por dia), feitos, no prazo, % no
   * prazo e a racha de dias recentes com ambos os checklists no prazo.
   */
  async metricas(data: Date): Promise<ChecklistMetricas> {
    const ref = inicioDoDia(data);
    const agora = agoraBrasilia();
    const inicioMes = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
    const hojeISO = agora.dataISO;
    // Limite: hoje (se o mês de referência é o atual) ou fim do mês.
    const fimMes = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 1));
    const hojeDate = new Date(`${hojeISO}T00:00:00.000Z`);
    const limite = hojeDate < fimMes ? addDias(hojeDate, 1) : fimMes;

    const registros = await this.prisma.checklist.findMany({
      where: { data: { gte: inicioMes, lt: limite } },
      select: { tipo: true, data: true, status: true, noPrazo: true },
    });

    // Dias de operação (Seg–Sáb) do início do mês até o limite (exclusivo).
    let diasOperacao = 0;
    for (let d = new Date(inicioMes); d < limite; d = addDias(d, 1)) {
      if (d.getUTCDay() !== 0) diasOperacao += 1; // exclui domingo
    }

    const feitos = registros.filter((r) => r.status === 'FEITO').length;
    const noPrazo = registros.filter((r) => r.noPrazo === true).length;
    const totalEsperado = diasOperacao * 2;
    const percentualNoPrazo =
      totalEsperado > 0 ? Math.round((noPrazo / totalEsperado) * 100) : 0;

    // Racha: dias de operação recentes (de hoje para trás) com abertura E
    // fechamento no prazo. Para no primeiro dia que falhar.
    const mapa = new Map<string, { ab: boolean; fe: boolean }>();
    for (const r of registros) {
      const iso = r.data.toISOString().slice(0, 10);
      const atual = mapa.get(iso) ?? { ab: false, fe: false };
      if (r.tipo === 'ABERTURA' && r.noPrazo === true) atual.ab = true;
      if (r.tipo === 'FECHAMENTO' && r.noPrazo === true) atual.fe = true;
      mapa.set(iso, atual);
    }
    let rachaDias = 0;
    for (let d = new Date(hojeDate); d >= inicioMes; d = addDias(d, -1)) {
      if (d.getUTCDay() === 0) continue; // domingo não conta
      const iso = d.toISOString().slice(0, 10);
      const reg = mapa.get(iso);
      if (reg && reg.ab && reg.fe) rachaDias += 1;
      else break;
    }

    return {
      mes: hojeISO.slice(0, 7),
      diasOperacao,
      totalEsperado,
      feitos,
      noPrazo,
      percentualNoPrazo,
      rachaDias,
    };
  }

  /** Histórico dos últimos N dias (ambos os checklists por dia). */
  async historico(dias = 14): Promise<ChecklistHistoricoDia[]> {
    const agora = agoraBrasilia();
    const hojeDate = new Date(`${agora.dataISO}T00:00:00.000Z`);
    const fim = addDias(hojeDate, 1);
    const inicio = addDias(hojeDate, -(dias - 1));

    const registros = await this.prisma.checklist.findMany({
      where: { data: { gte: inicio, lt: fim } },
    });
    const ids = registros
      .map((r) => r.enviadoPor)
      .filter((x): x is string => !!x);
    const usuarios = ids.length
      ? await this.prisma.usuario.findMany({
          where: { id: { in: ids } },
          select: { id: true, nome: true, login: true },
        })
      : [];
    const nomeDe = (id: string | null): string | null => {
      if (!id) return null;
      const u = usuarios.find((x) => x.id === id);
      return u ? u.nome ?? u.login : id;
    };

    const lista: ChecklistHistoricoDia[] = [];
    for (let i = 0; i < dias; i++) {
      const d = addDias(hojeDate, -i);
      const iso = d.toISOString().slice(0, 10);
      const minutos = minutosRelativos(iso, agora);
      const mk = (tipo: TipoChecklist): ChecklistHistoricoTipo | null => {
        const r = registros.find(
          (x) => x.tipo === tipo && x.data.toISOString().slice(0, 10) === iso,
        );
        const status = (r?.status as StatusChecklist) ?? 'PENDENTE';
        return {
          statusVisual: derivarStatusVisual(status, r?.noPrazo ?? null, minutos, tipo),
          imagemUrl: r?.imagemUrl ?? null,
          enviadoPor: nomeDe(r?.enviadoPor ?? null),
          enviadoEm: r?.enviadoEm ? r.enviadoEm.toISOString() : null,
        };
      };
      lista.push({
        dataISO: iso,
        diaSemana: d.getUTCDay(),
        abertura: mk('ABERTURA'),
        fechamento: mk('FECHAMENTO'),
      });
    }
    return lista;
  }

  /**
   * Verifica se o alerta de pendência deve ser disparado (15 min antes do
   * limite) — usado pelos cron jobs.
   */
  async verificarAlerta(tipo: TipoChecklist, agora: Date): Promise<boolean> {
    const status = await this.status(tipo, agora);
    return deveAlertar(tipo, minutosDoDia(agora), status);
  }

  /**
   * Verifica se o lembrete de início (5 min antes da janela) deve ser
   * disparado e o checklist ainda está pendente.
   */
  async verificarLembreteInicio(tipo: TipoChecklist, agora: Date): Promise<boolean> {
    const status = await this.status(tipo, agora);
    return deveLembrarInicio(tipo, minutosDoDia(agora), status);
  }

  /** Lista de tipos de checklist. */
  tipos(): TipoChecklist[] {
    return TIPOS;
  }
}
