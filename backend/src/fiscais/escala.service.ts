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
import { FeriasService } from '../ferias/ferias.service';

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
    // Férias (inativação não rígida): num dia concreto, quem está de férias não
    // aparece na escala. Opcional pelo mesmo motivo.
    @Optional() private readonly ferias?: FeriasService,
  ) {}

  /**
   * Conjunto dos `colaboradorId` de férias na data (ISO `YYYY-MM-DD`), ou vazio
   * quando não há data concreta / o serviço de férias não está disponível. A
   * escala semanal (sem data) não aplica férias — elas são por dia.
   */
  private async feriasNaData(dataISO?: string): Promise<Set<string>> {
    if (!dataISO || !this.ferias) return new Set<string>();
    const dia = new Date(`${dataISO.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(dia.getTime())) return new Set<string>();
    return this.ferias.colaboradoresDeFeriasNoDia(dia);
  }

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
    const deFerias = this.ferias
      ? await this.ferias.colaboradoresDeFeriasNoDia(dataDomingo)
      : new Set<string>();

    const itens: ItemEscalaConsolidadaComNome[] = [];
    for (const f of fiscais) {
      const col = mapaCol.get(f.id);
      const ficha = col ? colPorId.get(col.colaboradorId) : undefined;
      if (ficha && ficha.ativo === false) continue; // fiscal desligado
      // De férias no domingo: some da escala (inativação não rígida).
      if (col?.colaboradorId && deFerias.has(col.colaboradorId)) continue;
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
   * Resolve a ficha canônica (Colaborador funcao FISCAL) do `funcionarioId` de
   * uma escala (que é o `Fiscal.id`), seguindo a MESMA regra de
   * `mapearFiscalColaborador`: pela conta de acesso (`usuarioId`, único) e, em
   * fallback, pela matrícula (== login da conta). `null` quando não há ficha.
   * Usado para gravar o vínculo `colaboradorId` na escala manual (Fase 4 ·
   * Opção A). Reaproveita antes um vínculo já gravado para o mesmo funcionário.
   */
  private async colaboradorIdDoFuncionario(
    funcionarioId: string,
  ): Promise<string | null> {
    const jaVinculada = await this.prisma.escalaEntry.findFirst({
      where: { funcionarioId, colaboradorId: { not: null } },
      select: { colaboradorId: true },
    });
    if (jaVinculada?.colaboradorId) return jaVinculada.colaboradorId;

    const fiscal = await this.prisma.fiscal.findUnique({
      where: { id: funcionarioId },
      select: { usuarioId: true },
    });
    if (!fiscal?.usuarioId) return null;
    const porConta = await this.prisma.colaborador.findFirst({
      where: { funcao: 'FISCAL', usuarioId: fiscal.usuarioId },
      select: { id: true },
    });
    if (porConta) return porConta.id;
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: fiscal.usuarioId },
      select: { login: true },
    });
    if (!usuario?.login) return null;
    const porMatricula = await this.prisma.colaborador.findFirst({
      where: {
        funcao: 'FISCAL',
        matricula: { equals: usuario.login.trim(), mode: 'insensitive' },
      },
      select: { id: true },
    });
    return porMatricula?.id ?? null;
  }

  /**
   * Cadastra a escala geral de um funcionário para um dia da semana
   * (Req 4.3.1–4.3.4): horário de entrada/saída, duração do intervalo e folga.
   */
  async cadastrarEscala(entry: EscalaEntryInput): Promise<EscalaEntryPrisma> {
    const colaboradorId = await this.colaboradorIdDoFuncionario(
      entry.funcionarioId,
    );
    return this.prisma.escalaEntry.create({
      data: {
        funcionarioId: entry.funcionarioId,
        // Vínculo com a ficha canônica (Fase 4 · Opção A).
        colaboradorId,
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
    const colaboradorId = await this.colaboradorIdDoFuncionario(funcionarioId);
    return this.prisma.escalaEntry.create({
      data: {
        funcionarioId,
        // Vínculo com a ficha canônica (Fase 4 · Opção A).
        colaboradorId,
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
    const colPorId = new Map(colaboradores.map((c) => [c.id, c]));

    // Vínculo Fiscal → ficha única (colaborador), para nome canônico + perfil.
    const mapaCol = mapearFiscalColaborador(fiscais, usuarios, colaboradores);

    // Vínculo AUTORITATIVO gravado na própria escala (funcionarioId →
    // colaboradorId). É a fonte confiável mesmo quando a conta de acesso do
    // fiscal foi removida/desvinculada (aí o `mapaCol` falha e a pessoa
    // apareceria como "sem ficha", escapando do filtro de inativos).
    const colabPorFuncionario = new Map<string, string>();
    for (const e of entries) {
      if (e.colaboradorId)
        colabPorFuncionario.set(e.funcionarioId, e.colaboradorId);
    }

    // Pessoas inativas (desligadas do quadro) NÃO aparecem na escala, mesmo que
    // sua escala semanal ainda exista no banco. (No domingo já é filtrado.)
    const inativos = new Set(
      colaboradores.filter((c) => c.ativo === false).map((c) => c.id),
    );

    // De férias na data concreta (inativação não rígida): somem da escala. A
    // escala semanal (sem `dataISO`) não aplica férias — elas são por dia.
    const deFerias = await this.feriasNaData(dataISO);

    return itens
      .map((it) => {
        const col = mapaCol.get(it.funcionarioId);
        const colaboradorId =
          col?.colaboradorId ??
          colabPorFuncionario.get(it.funcionarioId) ??
          null;
        const ficha = colaboradorId ? colPorId.get(colaboradorId) : undefined;
        return {
          ...it,
          nome:
            col?.nome ??
            ficha?.nome ??
            mapa.get(it.funcionarioId) ??
            it.funcionarioId,
          colaboradorId,
          matricula: col?.matricula ?? ficha?.matricula ?? null,
        };
      })
      .filter(
        (it) =>
          !(it.colaboradorId && inativos.has(it.colaboradorId)) &&
          !(it.colaboradorId && deFerias.has(it.colaboradorId)),
      );
  }
}
