import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { PessoaPonto } from './ponto.service';
import {
  ConfiancaComprovante,
  interpretarComprovante,
  normalizarTexto,
} from './ponto-ocr.parser';
import { scoreNome } from './ponto-nome-match';
import { LerComprovanteDto } from './dto/ponto.dto';
import { FUNCOES_PONTO_NAO_FISCAL } from './pessoas-ponto';
import { mapearFiscalColaborador } from '../fiscais/colaborador-vinculo';

/** Um colaborador sugerido pela leitura, com a confiança do casamento (0–1). */
export interface CandidatoPonto extends PessoaPonto {
  /** Quão parecido o nome do candidato é com o nome lido (0–1). */
  confianca: number;
  /** true quando veio de um alias já confirmado antes (memória do leitor). */
  aprendido?: boolean;
}

/** Resultado da leitura do comprovante, para o app confirmar/corrigir. */
export interface RespostaLeituraComprovante {
  /** Texto bruto lido (auditoria). */
  texto: string;
  nome: string | null;
  data: string | null;
  hora: string | null;
  /** Confiança estimada da leitura (por campo e geral). */
  confianca: ConfiancaComprovante;
  /** Colaboradores sugeridos pelo nome lido, do mais provável ao menos. */
  candidatos: CandidatoPonto[];
}

/** Dados mínimos para memorizar um alias (nome lido → pessoa confirmada). */
export interface AlvoAlias {
  pessoaId: string;
  tipoPessoa: 'FISCAL' | 'OPERADOR';
  colaboradorId?: string | null;
  nome: string;
}

// Abaixo deste score, o candidato é fraco demais para sugerir.
const LIMIAR_CANDIDATO = 0.4;
// Tamanho mínimo do texto lido para virar um alias (evita lixo curto).
const MIN_TEXTO_ALIAS = 4;
// Confirmações repetidas de uma pessoa DIFERENTE necessárias para substituir
// uma associação já aprendida. Uma seleção isolada (1 confirmação) nunca troca
// a associação vigente — evita que um engano pontual se propague.
const CONFIRMACOES_PARA_TROCAR = 2;

/**
 * Interpreta o comprovante (Fase B): recebe o **texto já lido no aparelho**
 * (ML Kit, no APK), extrai nome/data/hora + a confiança da leitura e sugere os
 * colaboradores correspondentes (casamento tolerante a erros do OCR, mais a
 * memória de confirmações anteriores). O usuário sempre confirma antes de
 * gravar; o registro em si é feito pelo endpoint de batidas da Fase A.
 *
 * A leitura da IMAGEM no servidor (OCR) foi desativada — só o APK lê o
 * comprovante (no aparelho); na web o registro é manual.
 */
@Injectable()
export class PontoOcrService {
  constructor(private readonly prisma: PrismaService) {}

  async lerComprovante(
    dto: LerComprovanteDto,
  ): Promise<RespostaLeituraComprovante> {
    const texto = (dto.texto ?? '').trim();
    if (!texto) {
      throw new BadRequestException('Envie o texto lido do comprovante.');
    }

    const interpretado = interpretarComprovante(texto);
    const candidatos = interpretado.nome
      ? await this.candidatosPara(interpretado.nome)
      : [];

    return {
      texto: interpretado.texto,
      nome: interpretado.nome,
      data: interpretado.data,
      hora: interpretado.hora,
      confianca: interpretado.confianca,
      candidatos,
    };
  }

  /**
   * Colaboradores mais parecidos com o nome lido. Primeiro consulta a memória
   * do leitor (alias exato já confirmado antes) — que entra no topo com
   * confiança máxima —, depois casa por similaridade (tolerante ao OCR).
   */
  private async candidatosPara(nomeLido: string): Promise<CandidatoPonto[]> {
    const alvo = normalizarTexto(nomeLido);

    const [alias, fiscais, usuarios, colaboradoresFiscais, colaboradores] =
      await Promise.all([
        this.prisma.aliasLeituraPonto.findUnique({
          where: { textoNome: alvo },
        }),
        this.prisma.fiscal.findMany({
          select: { id: true, nome: true, usuarioId: true },
        }),
        this.prisma.usuario.findMany({ select: { id: true, login: true } }),
        this.prisma.colaborador.findMany({
          where: { ativo: true, funcao: 'FISCAL' },
          select: { id: true, nome: true, matricula: true, usuarioId: true },
        }),
        this.prisma.colaborador.findMany({
          where: { ativo: true, funcao: { in: FUNCOES_PONTO_NAO_FISCAL } },
        }),
      ]);

    const fiscalParaColaborador = mapearFiscalColaborador(
      fiscais,
      usuarios,
      colaboradoresFiscais,
    );
    // Universo de pessoas ATIVAS que batem ponto. Fiscais sem ficha canônica
    // ativa ficam de fora tanto da similaridade quanto de aliases antigos.
    const pessoas: Array<{
      id: string;
      nome: string;
      tipoPessoa: 'FISCAL' | 'OPERADOR';
      colaboradorId: string | null;
    }> = [
      ...fiscais.flatMap((f) => {
        const vinculo = fiscalParaColaborador.get(f.id);
        return vinculo
          ? [
              {
                id: f.id,
                nome: vinculo.nome,
                tipoPessoa: 'FISCAL' as const,
                colaboradorId: vinculo.colaboradorId,
              },
            ]
          : [];
      }),
      ...colaboradores.map((c) => ({
        id: c.id,
        nome: c.nome,
        tipoPessoa: 'OPERADOR' as const,
        colaboradorId: c.id,
      })),
    ];

    const porSimilaridade: CandidatoPonto[] = pessoas
      .map((p) => ({ p, score: scoreNome(alvo, normalizarTexto(p.nome)) }))
      .filter((x) => x.score >= LIMIAR_CANDIDATO)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => ({
        id: x.p.id,
        nome: x.p.nome,
        tipoPessoa: x.p.tipoPessoa,
        colaboradorId: x.p.colaboradorId,
        confianca: Math.round(x.score * 100) / 100,
      }));

    if (!alias) return porSimilaridade;

    const pessoaAtivaDoAlias = pessoas.find(
      (p) =>
        p.id === alias.pessoaId &&
        p.tipoPessoa === (alias.tipoPessoa as 'FISCAL' | 'OPERADOR'),
    );
    if (!pessoaAtivaDoAlias) return porSimilaridade;

    // Alias confirmado antes: só entra se ainda aponta para uma pessoa ativa.
    // Nome e ficha vêm do cadastro atual, não da cópia histórica do alias.
    const semAlias = porSimilaridade.filter(
      (c) =>
        c.id !== pessoaAtivaDoAlias.id ||
        c.tipoPessoa !== pessoaAtivaDoAlias.tipoPessoa,
    );
    const doAlias: CandidatoPonto = {
      id: pessoaAtivaDoAlias.id,
      nome: pessoaAtivaDoAlias.nome,
      tipoPessoa: pessoaAtivaDoAlias.tipoPessoa,
      colaboradorId: pessoaAtivaDoAlias.colaboradorId,
      confianca: 1,
      aprendido: true,
    };
    return [doAlias, ...semAlias].slice(0, 5);
  }

  /**
   * Memoriza que um nome lido corresponde à pessoa confirmada pelo usuário.
   * Chamado ao registrar uma batida vinda do leitor (origem LEITOR). Assim a
   * próxima leitura do mesmo comprovante reconhece a pessoa na hora.
   *
   * O aprendizado é **apoio, não confirmação definitiva**: uma associação já
   * aprendida só é trocada por outra pessoa depois de `CONFIRMACOES_PARA_TROCAR`
   * confirmações repetidas da MESMA nova pessoa. Uma seleção isolada (ou uma
   * confirmação avulsa de alguém diferente) fica apenas registrada como
   * "desafiante pendente" e NÃO substitui a associação vigente — assim um
   * engano pontual não se propaga para as próximas leituras.
   */
  async aprenderAlias(nomeLido: string, alvo: AlvoAlias): Promise<void> {
    const textoNome = normalizarTexto(nomeLido);
    if (textoNome.length < MIN_TEXTO_ALIAS) return;

    const atual = await this.prisma.aliasLeituraPonto.findUnique({
      where: { textoNome },
    });

    // 1) Alias novo: cria a associação (primeira confirmação).
    if (!atual) {
      await this.prisma.aliasLeituraPonto.create({
        data: {
          textoNome,
          pessoaId: alvo.pessoaId,
          tipoPessoa: alvo.tipoPessoa,
          colaboradorId: alvo.colaboradorId ?? null,
          nome: alvo.nome,
        },
      });
      return;
    }

    const mesmaPessoa =
      atual.pessoaId === alvo.pessoaId && atual.tipoPessoa === alvo.tipoPessoa;

    // 2) Confirma a MESMA pessoa: reforça a associação (mais um uso) e descarta
    // qualquer desafiante pendente (a divergência anterior foi ruído).
    if (mesmaPessoa) {
      await this.prisma.aliasLeituraPonto.update({
        where: { textoNome },
        data: {
          colaboradorId: alvo.colaboradorId ?? null,
          nome: alvo.nome,
          usos: { increment: 1 },
          pendentePessoaId: null,
          pendenteTipoPessoa: null,
          pendenteColaboradorId: null,
          pendenteNome: null,
          pendenteUsos: 0,
        },
      });
      return;
    }

    // 3) Confirma uma pessoa DIFERENTE da associação vigente.
    const mesmoDesafiante =
      atual.pendentePessoaId === alvo.pessoaId &&
      atual.pendenteTipoPessoa === alvo.tipoPessoa;
    const confirmacoesDesafiante =
      (mesmoDesafiante ? atual.pendenteUsos : 0) + 1;

    // 3a) O desafiante alcançou as confirmações repetidas → troca a associação.
    if (confirmacoesDesafiante >= CONFIRMACOES_PARA_TROCAR) {
      await this.prisma.aliasLeituraPonto.update({
        where: { textoNome },
        data: {
          pessoaId: alvo.pessoaId,
          tipoPessoa: alvo.tipoPessoa,
          colaboradorId: alvo.colaboradorId ?? null,
          nome: alvo.nome,
          usos: confirmacoesDesafiante,
          pendentePessoaId: null,
          pendenteTipoPessoa: null,
          pendenteColaboradorId: null,
          pendenteNome: null,
          pendenteUsos: 0,
        },
      });
      return;
    }

    // 3b) Ainda não atingiu o limiar: registra/atualiza o desafiante pendente
    // SEM trocar a associação vigente (uma seleção isolada não substitui).
    await this.prisma.aliasLeituraPonto.update({
      where: { textoNome },
      data: {
        pendentePessoaId: alvo.pessoaId,
        pendenteTipoPessoa: alvo.tipoPessoa,
        pendenteColaboradorId: alvo.colaboradorId ?? null,
        pendenteNome: alvo.nome,
        pendenteUsos: confirmacoesDesafiante,
      },
    });
  }
}
