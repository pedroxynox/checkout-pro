import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Feriado, FeriadoAmbito } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { inicioDoDia } from '../common/datas';
import { ehFeriadoNacional, feriadosNacionais } from './feriados.domain';

/** Um feriado como exibido ao gestor (nacional automático ou manual). */
export interface FeriadoView {
  /** id no banco (null nos nacionais automáticos — não removíveis). */
  id: string | null;
  /** Data em ISO (00:00 UTC). */
  data: string;
  nome: string;
  ambito: FeriadoAmbito;
  /** true = calculado automaticamente (nacional). */
  automatico: boolean;
  /** true = pode ser removido pelo gestor (apenas os manuais). */
  removivel: boolean;
}

/**
 * Feriados. Os NACIONAIS são calculados automaticamente (domínio puro); os
 * ESTADUAIS/MUNICIPAIS são cadastrados manualmente pelo gestor e ficam no banco.
 * Para a jornada, todo feriado segue a regra do domingo (100%), porém sem o
 * rodízio por grupos — isso é aplicado na Central de Jornada.
 */
@Injectable()
export class FeriadosService {
  constructor(private readonly prisma: PrismaService) {}

  /** Feriados do ano: nacionais (automáticos) + manuais (banco), ordenados. */
  async listarDoAno(ano: number): Promise<FeriadoView[]> {
    const inicio = new Date(Date.UTC(ano, 0, 1));
    const fim = new Date(Date.UTC(ano + 1, 0, 1));
    const manuais = await this.prisma.feriado.findMany({
      where: { data: { gte: inicio, lt: fim } },
      orderBy: { data: 'asc' },
    });
    const nacionais = feriadosNacionais(ano);
    const datasNacionais = new Set(nacionais.map((n) => n.data.getTime()));

    const views: FeriadoView[] = nacionais.map((n) => ({
      id: null,
      data: n.data.toISOString(),
      nome: n.nome,
      ambito: 'NACIONAL',
      automatico: true,
      removivel: false,
    }));
    for (const m of manuais) {
      // Se um manual cair na mesma data de um nacional, o nacional prevalece.
      if (datasNacionais.has(inicioDoDia(m.data).getTime())) continue;
      views.push({
        id: m.id,
        data: m.data.toISOString(),
        nome: m.nome,
        ambito: m.ambito,
        automatico: false,
        removivel: true,
      });
    }
    return views.sort((a, b) => a.data.localeCompare(b.data));
  }

  /**
   * Mapa `tempo(00:00 UTC) → nome` dos feriados no período `[inicio, fim)`.
   * Usado pela Central de Jornada para saber, por dia, se é feriado (100%).
   */
  async mapaNoPeriodo(
    inicio: Date,
    fimExclusivo: Date,
  ): Promise<Map<number, string>> {
    const mapa = new Map<number, string>();
    const anoFim = new Date(fimExclusivo.getTime() - 1).getUTCFullYear();
    for (let ano = inicio.getUTCFullYear(); ano <= anoFim; ano++) {
      for (const n of feriadosNacionais(ano)) {
        if (n.data >= inicio && n.data < fimExclusivo) {
          mapa.set(n.data.getTime(), n.nome);
        }
      }
    }
    const manuais = await this.prisma.feriado.findMany({
      where: { data: { gte: inicio, lt: fimExclusivo } },
    });
    for (const m of manuais) {
      mapa.set(inicioDoDia(m.data).getTime(), m.nome);
    }
    return mapa;
  }

  /** Cadastra um feriado manual (ESTADUAL/MUNICIPAL). */
  async adicionar(
    dto: { data: string; nome: string; ambito: 'ESTADUAL' | 'MUNICIPAL' },
    autor?: { sub?: string; nome?: string | null },
  ): Promise<Feriado> {
    const data = inicioDoDia(new Date(dto.data));
    if (Number.isNaN(data.getTime())) {
      throw new BadRequestException('Data inválida.');
    }
    if (ehFeriadoNacional(data)) {
      throw new ConflictException(
        'Essa data já é um feriado nacional (reconhecido automaticamente).',
      );
    }
    const existente = await this.prisma.feriado.findUnique({ where: { data } });
    if (existente) {
      throw new ConflictException(
        'Já existe um feriado cadastrado nessa data.',
      );
    }
    return this.prisma.feriado.create({
      data: {
        data,
        nome: dto.nome.trim(),
        ambito: dto.ambito,
        automatico: false,
        criadoPorId: autor?.sub ?? null,
        criadoPorNome: autor?.nome ?? null,
      },
    });
  }

  /** Remove um feriado manual (os nacionais não têm registro e não são removíveis). */
  async remover(id: string): Promise<void> {
    const existente = await this.prisma.feriado.findUnique({ where: { id } });
    if (!existente) {
      throw new NotFoundException('Feriado não encontrado.');
    }
    await this.prisma.feriado.delete({ where: { id } });
  }
}
