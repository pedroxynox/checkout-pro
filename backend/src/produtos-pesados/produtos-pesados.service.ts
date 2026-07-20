import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LinhaProdutoPesado, normalizarTexto } from './produtos-pesados.parser';

/** Produto do catálogo, na forma entregue ao app (sem campos internos). */
export interface ProdutoPesadoView {
  id: string;
  codigo: string;
  nome: string;
  categoria: string;
  tipo: string | null;
}

/** Contagem de produtos por setor. */
export interface ContagemCategoria {
  categoria: string;
  total: number;
}

/** Resultado de uma carga (substituição total do catálogo). */
export interface ResultadoImportacaoProdutos {
  total: number;
  categorias: ContagemCategoria[];
}

/** Estado atual do catálogo (para a tela de carga). */
export interface StatusCatalogoProdutos {
  total: number;
  /** Última atualização (ISO) ou null se o catálogo está vazio. */
  atualizadoEm: string | null;
  categorias: ContagemCategoria[];
}

/**
 * Serviço do catálogo de produtos pesados. A carga é uma SUBSTITUIÇÃO TOTAL
 * (o arquivo traz todos os setores): apaga o catálogo e recria a partir do
 * arquivo, de forma transacional e idempotente — reenviar o mesmo arquivo
 * deixa o catálogo idêntico.
 */
@Injectable()
export class ProdutosPesadosService {
  constructor(private readonly prisma: PrismaService) {}

  /** Substitui todo o catálogo pelas linhas lidas do arquivo. */
  async importar(
    linhas: LinhaProdutoPesado[],
  ): Promise<ResultadoImportacaoProdutos> {
    // Deduplica por (categoria, código) — a última ocorrência vence. Evita
    // violar o índice único caso o arquivo traga repetições.
    const mapa = new Map<
      string,
      {
        codigo: string;
        nome: string;
        nomeNormalizado: string;
        categoria: string;
        tipo: string | null;
      }
    >();
    for (const l of linhas) {
      const categoria = l.categoria.trim().toUpperCase();
      const codigo = l.codigo.trim();
      const nome = l.nome.trim();
      if (!categoria || !codigo || !nome) {
        continue;
      }
      mapa.set(`${categoria}\u0000${codigo}`, {
        codigo,
        nome,
        nomeNormalizado: normalizarTexto(nome),
        categoria,
        tipo: l.tipo?.trim() || null,
      });
    }
    const registros = [...mapa.values()];

    await this.prisma.$transaction([
      this.prisma.produtoPesado.deleteMany({}),
      this.prisma.produtoPesado.createMany({ data: registros }),
    ]);

    return { total: registros.length, categorias: contar(registros) };
  }

  /** Catálogo completo, ordenado por setor e nome (o app filtra em memória). */
  listar(): Promise<ProdutoPesadoView[]> {
    return this.prisma.produtoPesado.findMany({
      orderBy: [{ categoria: 'asc' }, { nome: 'asc' }],
      select: {
        id: true,
        codigo: true,
        nome: true,
        categoria: true,
        tipo: true,
      },
    });
  }

  /** Total, última atualização e contagem por setor. */
  async status(): Promise<StatusCatalogoProdutos> {
    const [total, grupos, ultimo] = await Promise.all([
      this.prisma.produtoPesado.count(),
      this.prisma.produtoPesado.groupBy({
        by: ['categoria'],
        _count: { _all: true },
        orderBy: { categoria: 'asc' },
      }),
      this.prisma.produtoPesado.findFirst({
        orderBy: { atualizadoEm: 'desc' },
        select: { atualizadoEm: true },
      }),
    ]);
    return {
      total,
      atualizadoEm: ultimo?.atualizadoEm.toISOString() ?? null,
      categorias: grupos.map((g) => ({
        categoria: g.categoria,
        total: g._count._all,
      })),
    };
  }
}

/** Conta quantos produtos há por setor, em ordem alfabética de setor. */
function contar(
  registros: readonly { categoria: string }[],
): ContagemCategoria[] {
  const mapa = new Map<string, number>();
  for (const r of registros) {
    mapa.set(r.categoria, (mapa.get(r.categoria) ?? 0) + 1);
  }
  return [...mapa.entries()]
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria));
}
