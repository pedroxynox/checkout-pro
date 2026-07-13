import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  GrupoDomingo,
  ehDomingo,
  ehGrupoValido,
  grupoFolgaNoDomingo,
  proximosDomingos,
} from './escala-domingo.domain';

/** Âncora vigente do rodízio (domingo de referência + grupo que folga). */
export interface AncoraDomingo {
  data: Date;
  grupo: GrupoDomingo;
}

/** Um domingo do preview com o grupo que folga nele. */
export interface DomingoPreview {
  /** Data do domingo (ISO yyyy-mm-dd). */
  data: string;
  /** Grupo que folga nesse domingo (G1/G2/G3). */
  grupoFolga: GrupoDomingo;
}

/** Configuração do rodízio de domingo + preview dos próximos domingos. */
export interface EscalaDomingoConfig {
  /** Domingo de referência (ISO yyyy-mm-dd) ou null se ainda não configurado. */
  ancoraData: string | null;
  /** Grupo que folga na âncora (G1/G2/G3) ou null. */
  ancoraGrupo: GrupoDomingo | null;
  /** Próximos domingos com o grupo que folga (vazio se sem âncora). */
  proximos: DomingoPreview[];
}

const PREVIEW_QTD = 8;

/**
 * Configuração (singleton) do rodízio de domingo, guardada em `ConfigSistema`
 * (mesmo padrão de `DataInicialService`). Lê/grava a âncora (domingo de
 * referência + grupo que folga) e devolve um preview dos próximos domingos para
 * o gestor conferir se a rotação bate com a realidade.
 */
@Injectable()
export class EscalaDomingoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Âncora vigente (domingo de referência + grupo que folga), ou null se o
   * rodízio ainda não foi configurado. Usada por quem resolve a escala de um
   * domingo específico (quadro de operadores).
   */
  async obterAncora(): Promise<AncoraDomingo | null> {
    const cfg = await this.prisma.configSistema.findUnique({
      where: { id: 'sistema' },
    });
    const data = cfg?.domingoAncoraData ?? null;
    const grupo = ehGrupoValido(cfg?.domingoAncoraGrupo)
      ? cfg!.domingoAncoraGrupo
      : null;
    if (!data || !grupo) return null;
    return { data, grupo };
  }

  /** Configuração vigente + preview dos próximos domingos. */
  async obter(): Promise<EscalaDomingoConfig> {
    const cfg = await this.prisma.configSistema.findUnique({
      where: { id: 'sistema' },
    });
    const ancoraData = cfg?.domingoAncoraData ?? null;
    const ancoraGrupo = ehGrupoValido(cfg?.domingoAncoraGrupo)
      ? cfg!.domingoAncoraGrupo
      : null;

    if (!ancoraData || !ancoraGrupo) {
      return { ancoraData: null, ancoraGrupo: null, proximos: [] };
    }

    const proximos: DomingoPreview[] = proximosDomingos(
      new Date(),
      PREVIEW_QTD,
    ).map((d) => ({
      data: d.toISOString().slice(0, 10),
      grupoFolga: grupoFolgaNoDomingo(d, ancoraData, ancoraGrupo),
    }));

    return {
      ancoraData: ancoraData.toISOString().slice(0, 10),
      ancoraGrupo,
      proximos,
    };
  }

  /**
   * Define o ponto de partida do rodízio: um domingo de referência e o grupo
   * que folga nele. Valida que a data é realmente um domingo e o grupo é
   * G1/G2/G3.
   */
  async definir(
    ancoraDataISO: string,
    ancoraGrupo: string,
    por?: string,
  ): Promise<EscalaDomingoConfig> {
    if (!ehGrupoValido(ancoraGrupo)) {
      throw new BadRequestException('O grupo deve ser G1, G2 ou G3.');
    }
    const data = new Date(`${ancoraDataISO.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(data.getTime())) {
      throw new BadRequestException('Data de referência inválida.');
    }
    if (!ehDomingo(data)) {
      throw new BadRequestException(
        'A data de referência precisa ser um domingo.',
      );
    }

    await this.prisma.configSistema.upsert({
      where: { id: 'sistema' },
      update: {
        domingoAncoraData: data,
        domingoAncoraGrupo: ancoraGrupo,
        atualizadoPor: por,
      },
      create: {
        id: 'sistema',
        domingoAncoraData: data,
        domingoAncoraGrupo: ancoraGrupo,
        atualizadoPor: por,
      },
    });
    return this.obter();
  }
}
