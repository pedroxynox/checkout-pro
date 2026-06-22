import { Injectable, Logger } from '@nestjs/common';
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
import {
  CONFIG_ARRECADACAO,
  TIPOS_ARRECADACAO,
} from '../arrecadacao/arrecadacao.domain';

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
    const [escala, indicadoresBase, apae] = await Promise.all([
      this.montarContextoEscala(),
      this.montarContextoIndicadores(),
      this.montarContextoApae(),
    ]);
    const indicadores = [indicadoresBase, apae]
      .filter((s): s is string => !!s)
      .join('\n\n') || undefined;
    const instrucao = montarInstrucaoSistema({
      nomeUsuario: usuario.nome,
      perfil: usuario.perfil,
      escala,
      indicadores,
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
   * Monta o contexto de escala dos fiscais para a Cluby — lê direto via
   * Prisma (desacoplado do FiscaisModule para evitar dependência circular).
   * Retorna texto formatado com turno, horários e folgas de cada fiscal.
   * Em caso de erro (ex.: tabelas ainda não migradas), retorna undefined para
   * não quebrar o chat.
   */
  private async montarContextoEscala(): Promise<string | undefined> {
    try {
      const [fiscais, escalas] = await Promise.all([
        this.prisma.fiscal.findMany({ orderBy: { nome: 'asc' } }),
        this.prisma.escalaEntry.findMany(),
      ]);
      if (fiscais.length === 0 || escalas.length === 0) {
        return undefined;
      }

      const DIAS = [
        'Domingo',
        'Segunda',
        'Terça',
        'Quarta',
        'Quinta',
        'Sexta',
        'Sábado',
      ];
      const linhas: string[] = [];

      for (const fiscal of fiscais) {
        const escFiscal = escalas.filter((e) => e.funcionarioId === fiscal.id);
        if (escFiscal.length === 0) continue;
        const especial = fiscal.especial ? ' - horário especial' : '';
        linhas.push(`\n${fiscal.nome} (${fiscal.turno}${especial}):`);
        for (let dia = 0; dia <= 6; dia++) {
          const esc = escFiscal.find((e) => e.diaSemana === dia);
          if (!esc) continue;
          if (esc.folga) {
            linhas.push(`  ${DIAS[dia]}: FOLGA`);
          } else {
            linhas.push(`  ${DIAS[dia]}: ${esc.entrada} - ${esc.saida}`);
          }
        }
      }

      return linhas.length > 0 ? linhas.join('\n') : undefined;
    } catch (erro) {
      this.logger.warn(
        `Não foi possível montar o contexto de escala: ${String(erro)}`,
      );
      return undefined;
    }
  }

  /**
   * Monta o contexto dos indicadores de arrecadação do mês atual para a Cluby
   * — lê direto via Prisma (registroArrecadacao + vendaDiaria + metaIndicador),
   * desacoplado do ArrecadacaoModule. Importa apenas a config pura (domínio).
   * Retorna texto com total do mês, meta e semáforo de cada indicador.
   */
  private async montarContextoIndicadores(): Promise<string | undefined> {
    try {
      const agora = new Date();
      const inicioMes = new Date(
        Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1),
      );
      const inicioProximoMes = new Date(
        Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1),
      );

      // Metas configuradas (fallback ao default da config).
      const metasDb = await this.prisma.metaIndicador.findMany();
      const metaPorTipo = new Map(metasDb.map((m) => [m.tipo, Number(m.meta)]));

      // Vendas do mês (para indicadores base VENDAS).
      const vendasAgg = await this.prisma.vendaDiaria.aggregate({
        where: { data: { gte: inicioMes, lt: inicioProximoMes } },
        _sum: { valor: true },
      });
      const vendasMes = Number(vendasAgg._sum.valor ?? 0);

      const arred = (n: number): number => Math.round(n * 100) / 100;
      const linhas: string[] = [];
      let temDados = false;

      for (const tipo of TIPOS_ARRECADACAO) {
        const config = CONFIG_ARRECADACAO[tipo];
        const meta = metaPorTipo.get(tipo) ?? config.meta;
        const agg = await this.prisma.registroArrecadacao.aggregate({
          where: { tipo, data: { gte: inicioMes, lt: inicioProximoMes } },
          _sum: { valor: true },
        });
        const totalMes = arred(Number(agg._sum.valor ?? 0));
        if (totalMes > 0) temDados = true;

        if (config.base === 'VENDAS') {
          const pct = vendasMes > 0 ? arred((totalMes / vendasMes) * 100) : 0;
          const emoji = pct <= meta ? '🟢' : pct <= meta * 1.5 ? '🟡' : '🔴';
          linhas.push(
            `${emoji} ${config.titulo}: ${pct}% das vendas no mês (meta ≤ ${meta}%).`,
          );
        } else {
          const emoji =
            totalMes >= meta ? '🟢' : totalMes >= meta * 0.75 ? '🟡' : '🔴';
          linhas.push(
            `${emoji} ${config.titulo}: R$${totalMes} arrecadado no mês (meta R$${meta}).`,
          );
        }
      }

      if (!temDados) return undefined;

      // Fiscais não entram nos rankings de destaque (operam caixa raramente).
      const fiscaisDb = await this.prisma.fiscal.findMany({ select: { nome: true } });
      const norm = (n: string): string =>
        n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
      const nomesFiscais = new Set(fiscaisDb.map((f) => norm(f.nome)));
      const ehFiscal = (nome: string): boolean => nomesFiscais.has(norm(nome));

      // Destaques do mês (Top por categoria, excluindo fiscais).
      const topPorTipo = async (tipo: string): Promise<{ nome: string; total: number } | null> => {
        const regs = await this.prisma.registroArrecadacao.findMany({
          where: { tipo, data: { gte: inicioMes, lt: inicioProximoMes } },
          select: { nome: true, valor: true },
        });
        const totais = new Map<string, number>();
        for (const r of regs) {
          if (ehFiscal(r.nome)) continue;
          totais.set(r.nome, (totais.get(r.nome) ?? 0) + Number(r.valor));
        }
        let melhorTipo: { nome: string; total: number } | null = null;
        for (const [nome, total] of totais.entries()) {
          if (total > 0 && (melhorTipo === null || total > melhorTipo.total)) {
            melhorTipo = { nome, total: arred(total) };
          }
        }
        return melhorTipo;
      };
      const [topTroco, topRecargas, topCancel] = await Promise.all([
        topPorTipo('TROCO_SOLIDARIO'),
        topPorTipo('RECARGAS_CELULAR'),
        topPorTipo('CANCELAMENTO_ITENS'),
      ]);
      if (topTroco || topRecargas || topCancel) {
        linhas.push('\nDestaques do mês (somente operadores; fiscais não entram):');
        if (topTroco) linhas.push(`🏆 Troco solidário: ${topTroco.nome} (R$${topTroco.total}).`);
        if (topRecargas) linhas.push(`🏆 Recargas: ${topRecargas.nome} (R$${topRecargas.total}).`);
        if (topCancel) linhas.push(`⚠️ Mais cancelou itens: ${topCancel.nome} (R$${topCancel.total}).`);

        // Menos cancelou: entre operadores ativos (troco/recargas), o menor cancelamento.
        const [contribRegs, cancelRegs] = await Promise.all([
          this.prisma.registroArrecadacao.findMany({
            where: {
              tipo: { in: ['TROCO_SOLIDARIO', 'RECARGAS_CELULAR'] },
              data: { gte: inicioMes, lt: inicioProximoMes },
            },
            select: { nome: true, valor: true },
          }),
          this.prisma.registroArrecadacao.findMany({
            where: { tipo: 'CANCELAMENTO_ITENS', data: { gte: inicioMes, lt: inicioProximoMes } },
            select: { nome: true, valor: true },
          }),
        ]);
        const contrib = new Map<string, number>();
        for (const r of contribRegs) {
          if (ehFiscal(r.nome)) continue;
          contrib.set(r.nome, (contrib.get(r.nome) ?? 0) + Number(r.valor));
        }
        const cancel = new Map<string, number>();
        for (const r of cancelRegs) {
          if (ehFiscal(r.nome)) continue;
          cancel.set(r.nome, (cancel.get(r.nome) ?? 0) + Number(r.valor));
        }
        let melhorMenos: { nome: string; cancel: number; contrib: number } | null = null;
        for (const [nome, contribTotal] of contrib.entries()) {
          if (contribTotal <= 0) continue;
          const cancelTotal = cancel.get(nome) ?? 0;
          if (
            melhorMenos === null ||
            cancelTotal < melhorMenos.cancel ||
            (cancelTotal === melhorMenos.cancel && contribTotal > melhorMenos.contrib)
          ) {
            melhorMenos = { nome, cancel: cancelTotal, contrib: contribTotal };
          }
        }
        if (melhorMenos) {
          const txt = melhorMenos.cancel > 0 ? `R$${arred(melhorMenos.cancel)}` : 'sem cancelamentos';
          linhas.push(`🏆 Menos cancelou itens: ${melhorMenos.nome} (${txt}).`);
        }
      }

      return linhas.join('\n');
    } catch (erro) {
      this.logger.warn(
        `Não foi possível montar o contexto de indicadores: ${String(erro)}`,
      );
      return undefined;
    }
  }

  /**
   * Contexto das Sacolas APAE para a Cluby — lê via Prisma (config + movimentos
   * + lotes). Permite responder "quanto arrecadamos para a APAE este mês?",
   * "qual a meta?", "quanto já arrecadamos no total?". Desacoplado do módulo.
   */
  private async montarContextoApae(): Promise<string | undefined> {
    try {
      const agora = new Date();
      const inicioMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
      const inicioProxMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1));
      const arred = (n: number): number => Math.round(n * 100) / 100;

      const cfg = await this.prisma.configApae.findUnique({ where: { id: 'apae' } });
      const preco = cfg ? Number(cfg.precoSacola) : 0.49;
      const meta = cfg ? Number(cfg.metaMensal) : 500;

      const [aggMes, aggTotal] = await Promise.all([
        this.prisma.movimentoLoteApae.aggregate({
          where: { em: { gte: inicioMes, lt: inicioProxMes } },
          _sum: { vendidas: true },
        }),
        this.prisma.loteApae.aggregate({ _sum: { quantidadeVendida: true } }),
      ]);
      const vendidasMes = Number(aggMes._sum.vendidas ?? 0);
      const arrecadadoMes = arred(vendidasMes * preco);
      const totalHistorico = arred(Number(aggTotal._sum.quantidadeVendida ?? 0) * preco);

      // Só inclui se houver alguma arrecadação histórica (evita ruído).
      if (totalHistorico <= 0 && arrecadadoMes <= 0) return undefined;

      const pctMeta = meta > 0 ? Math.round((arrecadadoMes / meta) * 100) : 0;
      const linhas = [
        '=== SACOLAS APAE (causa social) ===',
        `Preço por sacola: R$${arred(preco)}.`,
        `Arrecadado no mês: R$${arrecadadoMes} (${vendidasMes} sacolas) — meta de R$${arred(meta)} (${pctMeta}% da meta).`,
        `Total já arrecadado para a APAE (histórico): R$${totalHistorico}.`,
      ];
      return linhas.join('\n');
    } catch (erro) {
      this.logger.warn(
        `Não foi possível montar o contexto da APAE: ${String(erro)}`,
      );
      return undefined;
    }
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
