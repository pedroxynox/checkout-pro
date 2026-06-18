import { Injectable } from '@nestjs/common';
import { Checklist } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ArquivoRef,
  JanelaExecucao,
  StatusChecklist,
  TipoChecklist,
  deveAlertar,
  ehImagem,
  janela,
  minutosDoDia,
} from './checklist.domain';
import { ArquivoNaoImagemError } from './checklist.errors';

/** Normaliza uma data para o início do dia (UTC), chave do checklist diário. */
function inicioDoDia(data: Date): Date {
  return new Date(
    Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()),
  );
}

/**
 * Serviço do Modulo_Checklist (Req 5.1–5.3): disponibiliza checklists diários
 * de abertura e fechamento por upload de imagem, expõe as janelas fixas de
 * execução e a regra de alerta de pendência no horário-limite.
 *
 * A lógica pura (validação de imagem, status, janelas e alerta) é delegada a
 * `checklist.domain`; este serviço cuida apenas dos efeitos colaterais via
 * Prisma. Cada par (tipo, dia) é único.
 */
@Injectable()
export class ChecklistService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Disponibiliza (cria se ausente) o checklist diário de um tipo (Req 5.1.1),
   * iniciando com status "PENDENTE".
   */
  async garantirChecklistDoDia(
    tipo: TipoChecklist,
    data: Date,
  ): Promise<Checklist> {
    const dia = inicioDoDia(data);
    const existente = await this.prisma.checklist.findUnique({
      where: { tipo_data: { tipo, data: dia } },
    });
    if (existente) {
      return existente;
    }
    return this.prisma.checklist.create({
      data: { tipo, data: dia, status: 'PENDENTE' },
    });
  }

  /** Valida se um arquivo é uma imagem (Req 5.1.4). */
  validarImagem(arquivo: ArquivoRef): boolean {
    return ehImagem(arquivo);
  }

  /**
   * Envia uma imagem para um checklist (Req 5.1.2, 5.1.3): marca como "FEITO" e
   * registra data/horário e usuário. Rejeita arquivos que não são imagem
   * lançando `ArquivoNaoImagemError`, sem alterar o status (Req 5.1.4).
   */
  async enviarImagem(
    tipo: TipoChecklist,
    data: Date,
    arquivo: ArquivoRef & { url?: string },
    usuarioId: string,
    enviadoEm: Date = new Date(),
  ): Promise<Checklist> {
    if (!ehImagem(arquivo)) {
      throw new ArquivoNaoImagemError(
        arquivo.mimeType ?? arquivo.nome ?? undefined,
      );
    }
    const dia = inicioDoDia(data);
    return this.prisma.checklist.upsert({
      where: { tipo_data: { tipo, data: dia } },
      create: {
        tipo,
        data: dia,
        status: 'FEITO',
        imagemUrl: arquivo.url ?? null,
        enviadoPor: usuarioId,
        enviadoEm,
      },
      update: {
        status: 'FEITO',
        imagemUrl: arquivo.url ?? null,
        enviadoPor: usuarioId,
        enviadoEm,
      },
    });
  }

  /**
   * Status atual de um checklist do dia (Req 5.1.5): "FEITO" quando uma imagem
   * válida já foi enviada; "PENDENTE" caso contrário.
   */
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
   * Verifica se o alerta de pendência deve ser disparado (Req 5.3.1, 5.3.2):
   * quando o horário-limite (08:55/13:55) foi atingido e o checklist do dia
   * ainda está "PENDENTE".
   */
  async verificarAlerta(tipo: TipoChecklist, agora: Date): Promise<boolean> {
    const status = await this.status(tipo, agora);
    return deveAlertar(tipo, minutosDoDia(agora), status);
  }
}
