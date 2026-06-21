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
 * Liga/desliga os procedimentos guiados (normativas) sem apagá-los. Quando
 * `false`, a Cluby ignora as normativas e responde apenas com seu conhecimento
 * geral de gestão de supermercados. Os dados continuam em
 * `procedimentos.data.ts` — basta voltar para `true` para reativar.
 */
const PROCEDIMENTOS_ATIVOS: boolean = false;

function semAcento(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Serviço dos procedimentos guiados (passo a passo ilustrado das normativas).
 *
 * Carrega o catálogo gerado a partir dos PDFs. Faz a correspondência da
 * pergunta do usuário com um procedimento (busca por palavras-chave) e monta o
 * "documento" do procedimento com marcadores de foto, para que a Cluby o
 * RESUMA de forma fácil e o app exiba as fotos reais nos pontos certos.
 */
@Injectable()
export class ProcedimentosService {
  /** Há procedimentos carregados E ativos? */
  get temProcedimentos(): boolean {
    return PROCEDIMENTOS_ATIVOS && PROCEDIMENTOS.length > 0;
  }

  /**
   * Encontra o procedimento que melhor corresponde à pergunta (por
   * palavras-chave e palavras do título). Retorna undefined se nada bater com
   * confiança suficiente — ou se os procedimentos estiverem desativados.
   */
  encontrar(pergunta: string): ProcedimentoGuiado | undefined {
    if (!PROCEDIMENTOS_ATIVOS) {
      return undefined;
    }
    const q = semAcento(pergunta);
    let melhor: ProcedimentoGuiado | undefined;
    let melhorPontos = 0;
    for (const p of PROCEDIMENTOS) {
      let pontos = 0;
      for (const kw of p.palavrasChave) {
        const k = semAcento(kw);
        if (k.length >= 3 && q.includes(k)) {
          pontos += k.length >= 6 ? 2 : 1;
        }
      }
      for (const palavra of semAcento(p.titulo).split(/\s+/)) {
        if (palavra.length >= 5 && q.includes(palavra)) {
          pontos += 1;
        }
      }
      if (pontos > melhorPontos) {
        melhorPontos = pontos;
        melhor = p;
      }
    }
    return melhorPontos >= 2 ? melhor : undefined;
  }

  /**
   * Monta o "documento" do procedimento: o texto na ordem original, com as
   * fotos substituídas por marcadores [FOTO:k]. Devolve também a lista de
   * imagens (na ordem) para reconstruir os blocos depois.
   */
  montarDocumento(proc: ProcedimentoGuiado): {
    documento: string;
    imagens: BlocoProcedimento[];
  } {
    const imagens = proc.blocos.filter((b) => b.tipo === 'imagem');
    let k = 0;
    const linhas = proc.blocos.map((b) => {
      if (b.tipo === 'imagem') {
        k += 1;
        return `[FOTO:${k}]`;
      }
      return b.conteudo ?? '';
    });
    return { documento: linhas.join('\n'), imagens };
  }
}
