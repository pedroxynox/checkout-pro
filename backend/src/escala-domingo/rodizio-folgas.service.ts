import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UM_DIA_MS, diaCivilBrasilia } from '../common/datas';
import { CicloFolhaService } from '../ciclo-folha/ciclo-folha.service';
import { EscalaDomingoService } from './escala-domingo.service';
import { GrupoDomingo, grupoFolgaNoDomingo } from './escala-domingo.domain';
import {
  AvisoRodizio,
  PadraoRodizio,
  RodizioFolgas,
  SemanaPrevia,
  avisosDoRodizio,
  gruposDeFolgaNoDia,
  padraoDe,
  previaDoRodizio,
  rodizioDaLinha,
  rodizioNoDia,
  segundaDaSemana,
  validarRodizio,
} from './rodizio-folgas.domain';

/** Semanas da prévia: dois ciclos de 3 semanas. */
const SEMANAS_PREVIA = 6;

/** Uma vigência do rodízio como a API devolve. */
export interface RodizioFolgasVigenciaView {
  /** null numa simulação (ainda não gravada). */
  id: string | null;
  /** Segunda-feira de início (yyyy-mm-dd). */
  vigenteDesde: string;
  semanasNoCiclo: number;
  padrao: PadraoRodizio;
  criadoPor: string | null;
  criadoEm: string | null;
  atualizadoPor: string | null;
  atualizadoEm: string | null;
  /** Avisos da configuração (R3.4); não impedem gravar. */
  avisos: AvisoRodizio[];
}

/** Configuração do rodízio de folgas + prévia das próximas semanas. */
export interface RodizioFolgasConfig {
  /** Todas as vigências, da mais antiga para a mais nova. */
  vigencias: RodizioFolgasVigenciaView[];
  /** A que vale hoje (Brasília), ou null antes da primeira. */
  vigente: RodizioFolgasVigenciaView | null;
  /** Semanas de segunda a domingo a partir da semana atual. */
  previa: SemanaPrevia[];
}

/** Resultado de uma simulação: a vigência como ficaria, sem gravar. */
export interface SimulacaoRodizioFolgas {
  vigencia: RodizioFolgasVigenciaView;
  previa: SemanaPrevia[];
}

/** O que a tela manda (gravar ou simular). */
export interface DadosRodizioFolgas {
  vigenteDesde: string;
  semanasNoCiclo: number;
  padrao: unknown;
}

interface LinhaRodizio {
  id: string;
  vigenteDesde: Date;
  semanasNoCiclo: number;
  padrao: Prisma.JsonValue;
  criadoPor: string | null;
  criadoEm: Date;
  atualizadoPor: string | null;
  atualizadoEm: Date;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Rodízio de folgas do 5x2 (spec `jornada-5x2`, Fase 3): leitura, validação,
 * prévia e gravação das vigências (`rodizio_folgas_vigencias`).
 *
 * Quem decide a folga de cada dia é a jornada prevista
 * (`JornadaVigenciaService`), que lê a mesma tabela; este serviço é o da tela.
 */
@Injectable()
export class RodizioFolgasService {
  constructor(
    private readonly prisma: PrismaService,
    // Rodízio antigo de domingo: mostra a continuidade dos domingos na prévia e
    // nos avisos. Opcional como nos demais serviços.
    @Optional() private readonly escalaDomingo?: EscalaDomingoService,
    // Ciclo de folha fechado não aceita rodízio que mude os dias dele.
    @Optional() private readonly cicloFolha?: CicloFolhaService,
  ) {}

  /** Todas as vigências válidas, da mais antiga para a mais nova. */
  async vigencias(): Promise<RodizioFolgas[]> {
    const linhas = await this.prisma.rodizioFolgasVigencia.findMany({
      orderBy: { vigenteDesde: 'asc' },
    });
    return linhas
      .map(rodizioDaLinha)
      .filter((r): r is RodizioFolgas => r !== null);
  }

  /** Configuração vigente, histórico e prévia das próximas semanas. */
  async obter(hoje: Date = diaCivilBrasilia()): Promise<RodizioFolgasConfig> {
    const linhas: LinhaRodizio[] =
      await this.prisma.rodizioFolgasVigencia.findMany({
        orderBy: { vigenteDesde: 'asc' },
      });
    // Uma linha com JSON que não é um padrão (não acontece pela API) fica fora.
    const pares = linhas.flatMap((linha) => {
      const r = rodizioDaLinha(linha);
      return r ? [{ linha, r }] : [];
    });
    const vigencias = pares.map((p) => p.r);
    const domingoAntes = await this.domingoAntes(vigencias);
    const views = pares.map((p) => this.view(p.r, domingoAntes, p.linha));
    const vigente = rodizioNoDia(vigencias, hoje);
    return {
      vigencias: views,
      vigente: vigente
        ? (views.find((v) => v.id === vigente.id) ?? null)
        : null,
      previa: previaDoRodizio(
        vigencias,
        hoje,
        SEMANAS_PREVIA,
        await this.domingoAntigo(),
      ),
    };
  }

  /**
   * Valida e mostra como ficaria a vigência (avisos e prévia), sem gravar. A
   * prévia começa na semana anterior ao início, para conferir a passagem.
   */
  async simular(dados: DadosRodizioFolgas): Promise<SimulacaoRodizioFolgas> {
    const nova = this.validar(dados);
    const vigencias = [
      ...(await this.vigencias()).filter(
        (r) => r.vigenteDesde.getTime() !== nova.vigenteDesde.getTime(),
      ),
      nova,
    ];
    const domingoAntes = await this.domingoAntes(vigencias);
    return {
      vigencia: this.view(nova, domingoAntes),
      previa: previaDoRodizio(
        vigencias,
        new Date(nova.vigenteDesde.getTime() - 7 * UM_DIA_MS),
        SEMANAS_PREVIA + 1,
        await this.domingoAntigo(),
      ),
    };
  }

  /**
   * Grava (cria ou substitui) a vigência que começa em `vigenteDesde`. Recusa
   * dados inválidos (400) e início em ciclo de folha fechado (409): os dias
   * desde o início seriam recalculados.
   */
  async definir(
    dados: DadosRodizioFolgas,
    por?: string,
  ): Promise<RodizioFolgasConfig> {
    const nova = this.validar(dados);
    if (this.cicloFolha) {
      await this.cicloFolha.exigirCicloAberto(nova.vigenteDesde);
    }
    const padrao = nova.padrao as unknown as Prisma.InputJsonValue;
    await this.prisma.rodizioFolgasVigencia.upsert({
      where: { vigenteDesde: nova.vigenteDesde },
      create: {
        vigenteDesde: nova.vigenteDesde,
        semanasNoCiclo: nova.semanasNoCiclo,
        padrao,
        criadoPor: por ?? null,
      },
      update: {
        semanasNoCiclo: nova.semanasNoCiclo,
        padrao,
        atualizadoPor: por ?? null,
      },
    });
    return this.obter();
  }

  /** Data e padrão validados (400 com todos os erros juntos). */
  private validar(dados: DadosRodizioFolgas): RodizioFolgas {
    const vigenteDesde = new Date(
      `${String(dados.vigenteDesde).slice(0, 10)}T00:00:00.000Z`,
    );
    const erros = validarRodizio({
      vigenteDesde,
      semanasNoCiclo: dados.semanasNoCiclo,
      padrao: dados.padrao,
    });
    const padrao = erros.length === 0 ? padraoDe(dados.padrao) : null;
    if (erros.length > 0 || !padrao) {
      throw new BadRequestException(erros.join(' '));
    }
    return {
      id: null,
      vigenteDesde,
      semanasNoCiclo: dados.semanasNoCiclo,
      padrao,
    };
  }

  private view(
    r: RodizioFolgas,
    domingoAntes: (r: RodizioFolgas) => (d: Date) => GrupoDomingo | null,
    linha?: LinhaRodizio,
  ): RodizioFolgasVigenciaView {
    return {
      id: r.id,
      vigenteDesde: iso(r.vigenteDesde),
      semanasNoCiclo: r.semanasNoCiclo,
      padrao: r.padrao,
      criadoPor: linha?.criadoPor ?? null,
      criadoEm: linha?.criadoEm.toISOString() ?? null,
      atualizadoPor: linha?.atualizadoPor ?? null,
      atualizadoEm: linha?.atualizadoEm.toISOString() ?? null,
      avisos: avisosDoRodizio(r, domingoAntes(r)),
    };
  }

  /** Grupo que folgou num domingo pelo rodízio ANTIGO (null sem âncora). */
  private async domingoAntigo(): Promise<
    ((domingo: Date) => GrupoDomingo | null) | undefined
  > {
    const ancora = this.escalaDomingo
      ? await this.escalaDomingo.obterAncora()
      : null;
    if (!ancora) return undefined;
    return (domingo) => grupoFolgaNoDomingo(domingo, ancora.data, ancora.ordem);
  }

  /**
   * Para os avisos de domingos seguidos na passagem: quem folgou nos domingos
   * antes do início de cada vigência — pela vigência anterior ou, antes da
   * primeira, pelo rodízio antigo de domingo.
   */
  private async domingoAntes(
    vigencias: readonly RodizioFolgas[],
  ): Promise<(r: RodizioFolgas) => (d: Date) => GrupoDomingo | null> {
    const antigo = await this.domingoAntigo();
    return (r) => {
      const anteriores = vigencias.filter(
        (v) =>
          segundaDaSemana(v.vigenteDesde).getTime() <
          segundaDaSemana(r.vigenteDesde).getTime(),
      );
      return (domingo) => {
        const anterior = rodizioNoDia(anteriores, domingo);
        if (anterior) return gruposDeFolgaNoDia(anterior, domingo)[0] ?? null;
        return antigo ? antigo(domingo) : null;
      };
    };
  }
}
