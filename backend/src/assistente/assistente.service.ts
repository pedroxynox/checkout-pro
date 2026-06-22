import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  montarInstrucaoProcedimento,
  montarInstrucaoSistema,
} from './assistente.prompt';
import { GeminiClient, MensagemGemini, PapelGemini } from './gemini.client';
import {
  ProcedimentosService,
  ProcedimentoResposta,
} from './procedimentos.service';
import {
  BlocoProcedimento,
  ProcedimentoGuiado,
} from './procedimentos/procedimentos.types';
import { FiscaisService } from '../fiscais/fiscais.service';

/** Uma mensagem da conversa exposta ao app. */
export interface MensagemConversa {
  id: string;
  papel: PapelGemini;
  conteudo: string;
  criadaEm: Date;
  /** Passo a passo ilustrado, quando a resposta corresponde a um procedimento. */
  procedimento?: ProcedimentoResposta;
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
    private readonly procedimentos: ProcedimentosService,
    @Optional() private readonly fiscaisService?: FiscaisService,
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
  /**
   * Processa uma mensagem do usuário. Se a pergunta corresponder a um
   * procedimento oficial, a Cluby o resume (em passos fáceis) e o app exibe as
   * fotos reais nos pontos certos. Caso contrário, é uma conversa normal.
   */
  async enviarMensagem(
    usuario: ContextoUsuario,
    texto: string,
  ): Promise<MensagemConversa> {
    const proc = this.procedimentos.encontrar(texto);
    if (proc) {
      return this.responderProcedimento(usuario, texto, proc);
    }

    const conversa = await this.obterConversa(usuario.id);
    const recente = conversa.slice(-MAX_HISTORICO);
    const escalaCtx = this.fiscaisService
      ? (await this.fiscaisService.contextoEscala()).contexto
      : undefined;
    const instrucao = montarInstrucaoSistema({
      nomeUsuario: usuario.nome,
      perfil: usuario.perfil,
      escala: escalaCtx,
    });
    const mensagens: MensagemGemini[] = [
      ...recente.map((m) => ({ papel: m.papel, texto: m.conteudo })),
      { papel: 'user' as PapelGemini, texto },
    ];

    const resposta = await this.gemini.gerarResposta(instrucao, mensagens);

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

  /**
   * Pede à Cluby para resumir o procedimento (mantendo os marcadores [FOTO:k])
   * e monta os blocos do passo a passo (texto resumido + fotos reais).
   */
  private async responderProcedimento(
    usuario: ContextoUsuario,
    pergunta: string,
    proc: ProcedimentoGuiado,
  ): Promise<MensagemConversa> {
    const { documento, imagens } = this.procedimentos.montarDocumento(proc);
    const instrucao = montarInstrucaoProcedimento(
      { nomeUsuario: usuario.nome, perfil: usuario.perfil },
      proc.titulo,
      documento,
      imagens.length,
    );
    const bruto = await this.gemini.gerarResposta(instrucao, [
      { papel: 'user', texto: pergunta },
    ]);
    const blocos = this.montarBlocos(bruto, imagens);
    const resumo = bruto
      .replace(/\[FOTO:\s*\d+\s*\]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    await this.prisma.mensagemAssistente.create({
      data: { usuarioId: usuario.id, papel: 'user', conteudo: pergunta },
    });
    const salva = await this.prisma.mensagemAssistente.create({
      data: {
        usuarioId: usuario.id,
        papel: 'model',
        conteudo: resumo || `Passo a passo: ${proc.titulo}`,
      },
    });

    return {
      id: salva.id,
      papel: 'model',
      conteudo: `Aqui está o passo a passo de **${proc.titulo}**, resumido 👇`,
      criadaEm: salva.criadaEm,
      procedimento: { id: proc.id, titulo: proc.titulo, blocos },
    };
  }

  /**
   * Reconstrói os blocos do passo a passo a partir do texto resumido pela
   * Cluby: divide nos marcadores [FOTO:k] e intercala as imagens reais. Fotos
   * não posicionadas pelo modelo são anexadas ao final (para não se perderem).
   */
  private montarBlocos(
    bruto: string,
    imagens: BlocoProcedimento[],
  ): BlocoProcedimento[] {
    const blocos: BlocoProcedimento[] = [];
    const usadas = new Set<number>();
    const regex = /\[FOTO:\s*(\d+)\s*\]/g;
    let ultimo = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(bruto)) !== null) {
      const txt = bruto.slice(ultimo, m.index).trim();
      if (txt) {
        blocos.push({ tipo: 'texto', conteudo: txt });
      }
      const k = parseInt(m[1], 10);
      const img = imagens[k - 1];
      if (img && !usadas.has(k)) {
        blocos.push(img);
        usadas.add(k);
      }
      ultimo = regex.lastIndex;
    }
    const resto = bruto.slice(ultimo).trim();
    if (resto) {
      blocos.push({ tipo: 'texto', conteudo: resto });
    }
    imagens.forEach((img, i) => {
      if (!usadas.has(i + 1)) {
        blocos.push(img);
      }
    });
    return blocos;
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
