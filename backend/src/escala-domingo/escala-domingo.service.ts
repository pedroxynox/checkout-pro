import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  GrupoDomingo,
  GRUPOS_DOMINGO,
  ehDomingo,
  ehGrupoValido,
  grupoFolgaNoDomingo,
  ordemValida,
  proximosDomingos,
} from './escala-domingo.domain';

/**
 * Âncora vigente do rodízio: 1º domingo de referência + a ORDEM do ciclo
 * (sequência de grupos que folga em cada domingo do ciclo, ex.: ['G1','G3','G2']).
 */
export interface AncoraDomingo {
  data: Date;
  ordem: GrupoDomingo[];
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
  /** Ordem do ciclo (quem folga em cada domingo), ou null se não configurado. */
  ordem: GrupoDomingo[] | null;
  /** Próximos domingos com o grupo que folga (vazio se sem âncora). */
  proximos: DomingoPreview[];
}

const PREVIEW_QTD = 8;

/**
 * Ordem legada: quando só existe o grupo único antigo (`domingoAncoraGrupo`),
 * reconstrói a ordem assumindo o comportamento anterior (G1 → G2 → G3 a partir
 * do grupo salvo). Mantém a configuração antiga funcionando até ser regravada.
 */
function ordemLegado(grupo: string | null | undefined): string[] {
  if (!ehGrupoValido(grupo)) return [];
  const base = GRUPOS_DOMINGO.indexOf(grupo);
  return [0, 1, 2].map((i) => GRUPOS_DOMINGO[(base + i) % 3]);
}

/**
 * Configuração (singleton) do rodízio de domingo, guardada em `ConfigSistema`
 * (mesmo padrão de `DataInicialService`). Lê/grava a âncora (1º domingo de
 * referência + a ordem do ciclo) e devolve um preview dos próximos domingos
 * para o gestor conferir se a rotação bate com a realidade.
 */
@Injectable()
export class EscalaDomingoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Âncora vigente (domingo de referência + ordem do ciclo), ou null se o
   * rodízio ainda não foi configurado. Usada por quem resolve a escala de um
   * domingo específico (quadro de operadores e escala dos fiscais).
   */
  async obterAncora(): Promise<AncoraDomingo | null> {
    const cfg = await this.prisma.configSistema.findUnique({
      where: { id: 'sistema' },
    });
    const data = cfg?.domingoAncoraData ?? null;
    if (!data) return null;
    // Nova config (ordem do ciclo, CSV) ou fallback à antiga (grupo único).
    const ordem = cfg?.domingoOrdemGrupos
      ? cfg.domingoOrdemGrupos.split(',')
      : ordemLegado(cfg?.domingoAncoraGrupo);
    if (!ordemValida(ordem)) return null;
    return { data, ordem };
  }

  /** Configuração vigente + preview dos próximos domingos. */
  async obter(): Promise<EscalaDomingoConfig> {
    const ancora = await this.obterAncora();
    if (!ancora) {
      return { ancoraData: null, ordem: null, proximos: [] };
    }

    const proximos: DomingoPreview[] = proximosDomingos(
      new Date(),
      PREVIEW_QTD,
    ).map((d) => ({
      data: d.toISOString().slice(0, 10),
      grupoFolga: grupoFolgaNoDomingo(d, ancora.data, ancora.ordem),
    }));

    return {
      ancoraData: ancora.data.toISOString().slice(0, 10),
      ordem: ancora.ordem,
      proximos,
    };
  }

  /**
   * Define o rodízio: o 1º domingo de referência e a ORDEM do ciclo (quem folga
   * no 1º, 2º e 3º domingos). A ordem deve conter G1, G2 e G3, cada um uma vez.
   * Valida também que a data é um domingo.
   */
  async definir(
    ancoraDataISO: string,
    ordem: string[],
    por?: string,
  ): Promise<EscalaDomingoConfig> {
    if (!ordemValida(ordem)) {
      throw new BadRequestException(
        'A ordem do ciclo deve conter G1, G2 e G3, cada um uma vez.',
      );
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

    const dados = {
      domingoAncoraData: data,
      domingoOrdemGrupos: ordem.join(','),
      // Mantém o campo antigo coerente (1º grupo do ciclo) por compatibilidade.
      domingoAncoraGrupo: ordem[0],
      atualizadoPor: por,
    };
    await this.prisma.configSistema.upsert({
      where: { id: 'sistema' },
      update: dados,
      create: { id: 'sistema', ...dados },
    });
    return this.obter();
  }
}
