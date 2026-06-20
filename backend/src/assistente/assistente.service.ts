import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { montarInstrucaoSistema } from './assistente.prompt';
import { GeminiClient, MensagemGemini, PapelGemini } from './gemini.client';

/** Uma mensagem da conversa exposta ao app. */
export interface MensagemConversa {
  id: string;
  papel: PapelGemini;
  conteudo: string;
  criadaEm: Date;
}

/** Identidade mínima do usuário para personalizar o assistente. */
export interface ContextoUsuario {
  id: string;
  nome?: string | null;
  perfil?: string | null;
}

/** Janela de retenção das conversas: 24 horas. */
const RETENCAO_HORAS = 24;
/** Máximo de mensagens do histórico enviadas ao modelo (controla custo). */
const MAX_HISTORICO = 20;

/**
 * Serviço do assistente de IA (chat flutuante).
 *
 * Responsabilidades:
 * - Manter a conversa de cada usuário isolada e efêmera (24h).
 * - Montar o histórico e chamar o `GeminiClient` para gerar respostas.
 * - Persistir as mensagens (pergunta + resposta) para que o usuário recupere a
 *   conversa caso feche o app sem querer.
 * - Limpar diariamente as conversas com mais de 24h (cron).
 */
@Injectable()
export class AssistenteService {
  private readonly logger = new Logger(AssistenteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiClient,
  ) {}

  /** Data-limite de retenção (mensagens anteriores não são consideradas). */
  private get limiteRetencao(): Date {
    return new Date(Date.now() - RETENCAO_HORAS * 60 * 60 * 1000);
  }

  /** Indica se o assistente está configurado (chave da API presente). */
  estaConfigurado(): boolean {
    return this.gemini.estaConfigurado();
  }

  /** Retorna a conversa atual do usuário (mensagens das últimas 24h). */
  async obterConversa(usuarioId: string): Promise<MensagemConversa[]> {
    const mensagens = await this.prisma.mensagemAssistente.findMany({
      where: { usuarioId, criadaEm: { gte: this.limiteRetencao } },
      orderBy: { criadaEm: 'asc' },
    });
    return mensagens.map((m) => ({
      id: m.id,
      papel: m.papel as PapelGemini,
      conteudo: m.conteudo,
      criadaEm: m.criadaEm,
    }));
  }

  /**
   * Processa uma mensagem do usuário: monta o histórico, chama o Gemini,
   * persiste pergunta e resposta, e devolve a resposta gerada.
   */
  async enviarMensagem(
    usuario: ContextoUsuario,
    texto: string,
  ): Promise<MensagemConversa> {
    const conversa = await this.obterConversa(usuario.id);
    const recente = conversa.slice(-MAX_HISTORICO);

    const instrucao = montarInstrucaoSistema({
      nomeUsuario: usuario.nome,
      perfil: usuario.perfil,
    });
    const mensagens: MensagemGemini[] = [
      ...recente.map((m) => ({ papel: m.papel, texto: m.conteudo })),
      { papel: 'user' as PapelGemini, texto },
    ];

    const resposta = await this.gemini.gerarResposta(instrucao, mensagens);

    // Persiste pergunta e resposta apenas após sucesso da geração.
    await this.prisma.mensagemAssistente.create({
      data: { usuarioId: usuario.id, papel: 'user', conteudo: texto },
    });
    const salva = await this.prisma.mensagemAssistente.create({
      data: { usuarioId: usuario.id, papel: 'model', conteudo: resposta },
    });

    return {
      id: salva.id,
      papel: 'model',
      conteudo: salva.conteudo,
      criadaEm: salva.criadaEm,
    };
  }

  /** Apaga toda a conversa do usuário (botão "Limpar conversa"). */
  async limparConversa(usuarioId: string): Promise<{ removidas: number }> {
    const { count } = await this.prisma.mensagemAssistente.deleteMany({
      where: { usuarioId },
    });
    return { removidas: count };
  }

  /**
   * Cron diário (03:00 horário de Brasília) que remove conversas com mais de
   * 24h. Mantém o banco limpo e respeita a natureza efêmera do chat.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: 'limpeza-conversas-assistente',
    timeZone: 'America/Sao_Paulo',
  })
  async limparConversasAntigas(): Promise<number> {
    const { count } = await this.prisma.mensagemAssistente.deleteMany({
      where: { criadaEm: { lt: this.limiteRetencao } },
    });
    if (count > 0) {
      this.logger.log(
        `Limpeza do assistente: ${count} mensagem(ns) > 24h removidas.`,
      );
    }
    return count;
  }
}
