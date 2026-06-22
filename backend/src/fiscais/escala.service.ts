import { Injectable } from '@nestjs/common';
import { EscalaEntry as EscalaEntryPrisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  EscalaEfetiva,
  EscalaEntry,
  ItemEscalaConsolidada,
  escalaConsolidada,
  resolverEscalaEfetiva,
} from './escala.domain';

/** Dados para cadastrar uma entrada de escala (Req 4.3.1–4.3.4). */
export interface EscalaEntryInput {
  funcionarioId: string;
  diaSemana: number;
  entrada?: string | null;
  saida?: string | null;
  intervaloMin?: number;
  folga?: boolean;
}

/** Item da escala consolidada com o nome resolvido do funcionário. */
export interface ItemEscalaConsolidadaComNome extends ItemEscalaConsolidada {
  nome: string;
}

/**
 * Serviço da escala de trabalho (Req 4.3): cadastro de escala por dia da semana
 * com intervalo variável e folga, cadastro de horário especial individual e
 * resolução/consolidação da escala efetiva.
 *
 * A lógica de prevalência do horário especial e a consolidação são delegadas a
 * `escala.domain`; este serviço cuida apenas das escritas/consultas via Prisma.
 */
@Injectable()
export class EscalaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cadastra a escala geral de um funcionário para um dia da semana
   * (Req 4.3.1–4.3.4): horário de entrada/saída, duração do intervalo e folga.
   */
  async cadastrarEscala(entry: EscalaEntryInput): Promise<EscalaEntryPrisma> {
    return this.prisma.escalaEntry.create({
      data: {
        funcionarioId: entry.funcionarioId,
        diaSemana: entry.diaSemana,
        entrada: entry.entrada ?? null,
        saida: entry.saida ?? null,
        intervaloMin: entry.intervaloMin ?? 0,
        folga: entry.folga ?? false,
        especial: false,
      },
    });
  }

  /**
   * Define um horário especial individual para um funcionário em um dia
   * (Req 4.3.5), marcado como especial para prevalecer sobre a regra geral.
   */
  async definirHorarioEspecial(
    funcionarioId: string,
    entry: EscalaEntryInput,
  ): Promise<EscalaEntryPrisma> {
    return this.prisma.escalaEntry.create({
      data: {
        funcionarioId,
        diaSemana: entry.diaSemana,
        entrada: entry.entrada ?? null,
        saida: entry.saida ?? null,
        intervaloMin: entry.intervaloMin ?? 0,
        folga: entry.folga ?? false,
        especial: true,
      },
    });
  }

  /**
   * Resolve a escala efetiva de um funcionário em um dia (Req 4.3.5): o horário
   * especial prevalece sobre a regra geral; na ausência de ambos, retorna
   * folga.
   */
  async resolverEscalaEfetiva(
    funcionarioId: string,
    diaSemana: number,
  ): Promise<EscalaEfetiva> {
    const entries = await this.prisma.escalaEntry.findMany({
      where: { funcionarioId, diaSemana },
    });
    const geral = entries.find((e) => !e.especial) ?? null;
    const especial = entries.find((e) => e.especial) ?? null;
    return resolverEscalaEfetiva(
      geral as EscalaEntry | null,
      especial as EscalaEntry | null,
    );
  }

  /**
   * Escala consolidada por dia da semana (Req 4.3.6), com entrada, saída,
   * intervalo e folga de cada funcionário, aplicando a prevalência do horário
   * especial. Resolve o **nome** do funcionário (fiscal/operador/usuário) para
   * exibição, com fallback para o próprio id.
   */
  async escalaConsolidada(
    diaSemana: number,
  ): Promise<ItemEscalaConsolidadaComNome[]> {
    const entries = await this.prisma.escalaEntry.findMany({
      where: { diaSemana },
    });
    const itens = escalaConsolidada(entries as unknown as EscalaEntry[], diaSemana);

    // Resolve nomes (fiscais, operadores e usuários) num único mapa id -> nome.
    const [fiscais, operadores, usuarios] = await Promise.all([
      this.prisma.fiscal.findMany({ select: { id: true, nome: true } }),
      this.prisma.operador.findMany({ select: { id: true, nome: true } }),
      this.prisma.usuario.findMany({ select: { id: true, nome: true } }),
    ]);
    const mapa = new Map<string, string>();
    for (const f of fiscais) mapa.set(f.id, f.nome);
    for (const o of operadores) mapa.set(o.id, o.nome);
    for (const u of usuarios) if (u.nome) mapa.set(u.id, u.nome);

    return itens.map((it) => ({
      ...it,
      nome: mapa.get(it.funcionarioId) ?? it.funcionarioId,
    }));
  }
}
