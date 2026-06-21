import { Injectable } from '@nestjs/common';
import { PROCEDIMENTOS } from './procedimentos/procedimentos.data';
import {
  BlocoProcedimento,
  ProcedimentoGuiado,
} from './procedimentos/procedimentos.types';

/** Passo a passo retornado ao app (título + blocos). */
export interface ProcedimentoResposta {
  id: string;
  titulo: string;
  blocos: BlocoProcedimento[];
}

/**
 * Serviço dos procedimentos guiados (passo a passo ilustrado das normativas).
 *
 * Carrega o catálogo gerado a partir dos PDFs e o disponibiliza para o
 * assistente: a Cluby reconhece quando uma pergunta corresponde a um
 * procedimento e o app exibe os passos com as fotos reais do documento.
 */
@Injectable()
export class ProcedimentosService {
  private readonly mapa = new Map<string, ProcedimentoGuiado>(
    PROCEDIMENTOS.map((p) => [p.id, p]),
  );

  /** Há procedimentos carregados? */
  get temProcedimentos(): boolean {
    return PROCEDIMENTOS.length > 0;
  }

  /**
   * Catálogo resumido (id + título + palavras-chave) para injetar na instrução
   * do modelo, que decide qual procedimento corresponde à pergunta.
   */
  catalogo(): string {
    return PROCEDIMENTOS.map(
      (p) =>
        `- ${p.id}: ${p.titulo} (${p.palavrasChave.slice(0, 8).join(', ')})`,
    ).join('\n');
  }

  /** Busca um procedimento pelo id e o devolve no formato de resposta. */
  buscar(id: string): ProcedimentoResposta | undefined {
    const p = this.mapa.get(id);
    if (!p) {
      return undefined;
    }
    return { id: p.id, titulo: p.titulo, blocos: p.blocos };
  }
}
