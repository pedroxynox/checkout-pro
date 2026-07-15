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

    const [alias, fiscais, colaboradores] = await Promise.all([
      this.prisma.aliasLeituraPonto.findUnique({ where: { textoNome: alvo } }),
      this.prisma.fiscal.findMany(),
      this.prisma.colaborador.findMany({
        where: { ativo: true, funcao: { in: FUNCOES_PONTO_NAO_FISCAL } },
      }),
    ]);

    // Universo de pessoas que batem ponto: fiscais (tabela Fiscal) + demais
    // colaboradores ativos (operadores/supervisores) do Cadastro.
    const pessoas: Array<{
      id: string;
      nome: string;
      tipoPessoa: 'FISCAL' | 'OPERADOR';
      colaboradorId: string | null;
    }> = [
      ...fiscais.map((f) => ({
        id: f.id,
        nome: f.nome,
        tipoPessoa: 'FISCAL' as const,
        colaboradorId: null,
      })),
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

    // Alias confirmado antes: vai para o topo com confiança máxima, sem
    // duplicar quem já apareceu por similaridade.
    const semAlias = porSimilaridade.filter((c) => c.id !== alias.pessoaId);
    const doAlias: CandidatoPonto = {
      id: alias.pessoaId,
      nome: alias.nome,
      tipoPessoa: alias.tipoPessoa as 'FISCAL' | 'OPERADOR',
      colaboradorId: alias.colaboradorId ?? null,
      confianca: 1,
      aprendido: true,
    };
    return [doAlias, ...semAlias].slice(0, 5);
  }

  /**
   * Memoriza que um nome lido corresponde à pessoa confirmada pelo usuário.
   * Chamado ao registrar uma batida vinda do leitor (origem LEITOR). Assim a
   * próxima leitura do mesmo comprovante reconhece a pessoa na hora.
   */
  async aprenderAlias(nomeLido: string, alvo: AlvoAlias): Promise<void> {
    const textoNome = normalizarTexto(nomeLido);
    if (textoNome.length < MIN_TEXTO_ALIAS) return;
    await this.prisma.aliasLeituraPonto.upsert({
      where: { textoNome },
      create: {
        textoNome,
        pessoaId: alvo.pessoaId,
        tipoPessoa: alvo.tipoPessoa,
        colaboradorId: alvo.colaboradorId ?? null,
        nome: alvo.nome,
      },
      update: {
        pessoaId: alvo.pessoaId,
        tipoPessoa: alvo.tipoPessoa,
        colaboradorId: alvo.colaboradorId ?? null,
        nome: alvo.nome,
        usos: { increment: 1 },
      },
    });
  }
}
