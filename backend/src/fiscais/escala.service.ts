import { Injectable, Optional } from '@nestjs/common';
import { EscalaEntry as EscalaEntryPrisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  EscalaEfetiva,
  EscalaEntry,
  ItemEscalaConsolidada,
  escalaConsolidada,
  resolverEscalaEfetiva,
} from './escala.domain';
import { mapearFiscalColaborador } from './colaborador-vinculo';
import { EscalaDomingoService } from '../escala-domingo/escala-domingo.service';
import { trabalhaNoDomingo } from '../escala-domingo/escala-domingo.domain';

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
  /** Ficha única correspondente (para abrir o perfil), ou null. */
  colaboradorId: string | null;
  /** Matrícula da ficha, quando resolvida. */
  matricula: string | null;
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
  constructor(
    private readonly prisma: PrismaService,
    // Rodízio de domingo. Opcional para não quebrar testes unitários que
    // constroem o serviço sem a dependência.
    @Optional() private readonly escalaDomingo?: EscalaDomingoService,
  ) {}

  /**
   * Escala de DOMINGO dos fiscais pelo rodízio de grupos (G1/G2/G3). Diferente
   * dos outros dias, o domingo não vem da `EscalaEntry` (semanal), e sim do
   * rodízio: cada fiscal trabalha ou folga conforme o seu grupo e a âncora
   * configurada, com o horário de domingo (entradaDom/saidaDom) do cadastro.
   * Sem âncora, todos folgam (não chuta).
   */
  private async escalaFiscaisDomingo(
    dataDomingo: Date,
  ): Promise<ItemEscalaConsolidadaComNome[]> {
    const ancora = this.escalaDomingo
      ? await this.escalaDomingo.obterAncora()
      : null;
    const [fiscais, usuarios, colaboradores] = await Promise.all([
      this.prisma.fiscal.findMany({
        select: { id: true, nome: true, usuarioId: true },
      }),
      this.prisma.usuario.findMany({
        select: { id: true, login: true, nome: true },
      }),
      this.prisma.colaborador.findMany({
        select: {
          id: true,
          nome: true,
          matricula: true,
          usuarioId: true,
          ativo: true,
          grupoDomingo: true,
          entradaDom: true,
          saidaDom: true,
        },
      }),
    ]);
    const mapaCol = mapearFiscalColaborador(fiscais, usuarios, colaboradores);
    const colPorId = new Map(colaboradores.map((c) => [c.id, c]));

    const itens: ItemEscalaConsolidadaComNome[] = [];
    for (const f of fiscais) {
      const col = mapaCol.get(f.id);
      const ficha = col ? colPorId.get(col.colaboradorId) : undefined;
      if (ficha && ficha.ativo === false) continue; // fiscal desligado
      const trabalha =
        !!ancora &&
        trabalhaNoDomingo(
          ficha?.grupoDomingo,
          dataDomingo,
          ancora.data,
          ancora.ordem,
        );
      const efetiva: EscalaEfetiva = trabalha
        ? {
            funcionarioId: f.id,
            diaSemana: 0,
            entrada: ficha?.entradaDom ?? null,
            saida: ficha?.saidaDom ?? null,
            intervaloMin: 0,
            folga: false,
            especial: false,
          }
        : 'FOLGA';
      itens.push({
        funcionarioId: f.id,
        efetiva,
        nome: col?.nome ?? f.nome,
        colaboradorId: col?.colaboradorId ?? null,
        matricula: col?.matricula ?? null,
      });
    }
    itens.sort((a, b) => a.nome.localeCompare(b.nome));
    return itens;
  }

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
    dataISO?: string,
  ): Promise<ItemEscalaConsolidadaComNome[]> {
    // No domingo (quando a data real é informada), a escala dos fiscais vem do
    // rodízio de grupos, não da EscalaEntry semanal.
    if (dataISO) {
      const dataDomingo = new Date(`${dataISO.slice(0, 10)}T00:00:00.000Z`);
      if (
        !Number.isNaN(dataDomingo.getTime()) &&
        dataDomingo.getUTCDay() === 0
      ) {
        return this.escalaFiscaisDomingo(dataDomingo);
      }
    }

    const entries = await this.prisma.escalaEntry.findMany({
      where: { diaSemana },
    });
    const itens = escalaConsolidada(
      entries as unknown as EscalaEntry[],
      diaSemana,
    );

    // Resolve nomes (fiscais, colaboradores e usuários) num único mapa id -> nome.
    const [fiscais, usuarios, colaboradores] = await Promise.all([
      this.prisma.fiscal.findMany({
        select: { id: true, nome: true, usuarioId: true },
      }),
      this.prisma.usuario.findMany({
        select: { id: true, login: true, nome: true },
      }),
      this.prisma.colaborador.findMany({
        select: {
          id: true,
          nome: true,
          matricula: true,
          usuarioId: true,
          ativo: true,
        },
      }),
    ]);
    const mapa = new Map<string, string>();
    for (const f of fiscais) mapa.set(f.id, f.nome);
    for (const c of colaboradores) mapa.set(c.id, c.nome);
    for (const u of usuarios) if (u.nome) mapa.set(u.id, u.nome);

    // Vínculo Fiscal → ficha única (colaborador), para nome canônico + perfil.
    const mapaCol = mapearFiscalColaborador(fiscais, usuarios, colaboradores);

    // Pessoas inativas (desligadas do quadro) NÃO aparecem na escala, mesmo que
    // sua escala semanal ainda exista no banco. (No domingo já é filtrado.)
    const inativos = new Set(
      colaboradores.filter((c) => c.ativo === false).map((c) => c.id),
    );

    return itens
      .map((it) => {
        const col = mapaCol.get(it.funcionarioId);
        return {
          ...it,
          nome: col?.nome ?? mapa.get(it.funcionarioId) ?? it.funcionarioId,
          colaboradorId: col?.colaboradorId ?? null,
          matricula: col?.matricula ?? null,
        };
      })
      .filter((it) => !(it.colaboradorId && inativos.has(it.colaboradorId)));
  }
}
