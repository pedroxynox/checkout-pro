import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Papel de uma mensagem na conversa, na convenção da API Gemini. */
export type PapelGemini = 'user' | 'model';

/** Uma mensagem do histórico enviada ao modelo. */
export interface MensagemGemini {
  papel: PapelGemini;
  texto: string;
}

/** Erro de configuração: a chave da API do Gemini não foi definida. */
export class GeminiNaoConfiguradoError extends Error {
  constructor() {
    super(
      'O assistente de IA ainda não foi configurado. Defina a variável GEMINI_API_KEY no servidor.',
    );
    this.name = 'GeminiNaoConfiguradoError';
  }
}

/** Erro genérico ao falar com a API do Gemini (após esgotar tentativas). */
export class GeminiIndisponivelError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'GeminiIndisponivelError';
  }
}

const URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_TENTATIVAS = 3;
const TIMEOUT_MS = 20000; // 20s por tentativa — evita que uma conexão pendurada bloqueie indefinidamente.

interface RespostaGemini {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
}

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cliente da API do Google Gemini para o assistente de IA.
 *
 * Usa o `fetch` nativo do Node (sem dependências novas). Para suportar picos
 * de uso (ex.: vários usuários conversando ao mesmo tempo) sem estourar o
 * limite por minuto da camada gratuita, as chamadas são limitadas a
 * `MAX_CONCORRENCIA` requisições **simultâneas** (concorrência limitada via
 * semáforo), evitando o bloqueio de fila única (head-of-line blocking). Cada
 * tentativa tem um **timeout** (TIMEOUT_MS) para não ficar pendurada, e há
 * **reintento automático com backoff** quando a API responde 429 (limite) ou
 * 503 (sobrecarga). Assim, no pior caso o usuário espera alguns segundos a
 * mais, em vez de receber um erro.
 */
@Injectable()
export class GeminiClient {
  private readonly logger = new Logger(GeminiClient.name);

  /** Máximo de chamadas simultâneas ao Gemini (equilibra vazão x limite gratuito). */
  private readonly MAX_CONCORRENCIA = 2;
  private emExecucao = 0;
  private readonly aguardando: Array<() => void> = [];

  private async adquirir(): Promise<void> {
    if (this.emExecucao < this.MAX_CONCORRENCIA) {
      this.emExecucao++;
      return;
    }
    // Sem vaga: aguarda. O "slot" é transferido no liberar() (sem alterar o contador).
    return new Promise<void>((resolve) => this.aguardando.push(resolve));
  }

  private liberar(): void {
    const proximo = this.aguardando.shift();
    if (proximo) {
      proximo();
    } else {
      this.emExecucao--;
    }
  }

  constructor(private readonly config: ConfigService) {}

  /** Indica se a chave da API está configurada. */
  estaConfigurado(): boolean {
    return Boolean(this.config.get<string>('GEMINI_API_KEY'));
  }

  /**
   * Gera uma resposta do modelo a partir da instrução de sistema e do
   * histórico da conversa. As chamadas são limitadas a `MAX_CONCORRENCIA`
   * requisições simultâneas (concorrência limitada por semáforo).
   */
  async gerarResposta(
    instrucaoSistema: string,
    mensagens: MensagemGemini[],
  ): Promise<string> {
    await this.adquirir();
    try {
      return await this.chamarComReintento(instrucaoSistema, mensagens);
    } finally {
      this.liberar();
    }
  }

  private async chamarComReintento(
    instrucaoSistema: string,
    mensagens: MensagemGemini[],
  ): Promise<string> {
    const chave = this.config.get<string>('GEMINI_API_KEY');
    if (!chave) {
      throw new GeminiNaoConfiguradoError();
    }
    const modelo =
      this.config.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash';
    const url = `${URL_BASE}/${modelo}:generateContent`;

    const corpo = {
      systemInstruction: { parts: [{ text: instrucaoSistema }] },
      contents: mensagens.map((m) => ({
        role: m.papel,
        parts: [{ text: m.texto }],
      })),
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4096,
        // Os modelos gemini-2.5-* "pensam" antes de responder, e esse
        // raciocínio consome o orçamento de saída — podendo truncar a resposta
        // no meio. Desativamos o thinking (não é necessário aqui) e ampliamos o
        // limite para a Cluby completar respostas longas (passo a passo).
        thinkingConfig: { thinkingBudget: 0 },
      },
    };

    let ultimoErro = '';
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      let resposta: Response;
      const controlador = new AbortController();
      const timer = setTimeout(() => controlador.abort(), TIMEOUT_MS);
      try {
        resposta = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // A chave vai no cabeçalho (não na query string da URL), evitando
            // que ela seja exposta em logs de acesso/proxies e no histórico.
            'x-goog-api-key': chave,
          },
          body: JSON.stringify(corpo),
          signal: controlador.signal,
        });
      } catch (erro) {
        const abortado = (erro as Error).name === 'AbortError';
        ultimoErro = abortado
          ? `tempo limite de ${TIMEOUT_MS}ms excedido`
          : (erro as Error).message;
        await dormir(this.atraso(tentativa));
        continue;
      } finally {
        clearTimeout(timer);
      }

      if (resposta.ok) {
        const dados = (await resposta.json()) as RespostaGemini;
        return this.extrairTexto(dados);
      }

      // 429 (limite) e 503 (sobrecarga) podem ser temporários: reintenta,
      // respeitando o tempo de espera sugerido pela API (campo retryDelay).
      if (resposta.status === 429 || resposta.status === 503) {
        const corpo = await resposta.text().catch(() => '');
        ultimoErro = this.descreverErro(resposta.status, corpo);
        const espera = Math.min(
          this.tempoDeEsperaSugerido(corpo) ?? this.atraso(tentativa),
          12000,
        );
        this.logger.warn(
          `Gemini ${resposta.status} (tentativa ${tentativa}/${MAX_TENTATIVAS}); aguardando ${espera}ms — ${ultimoErro}`,
        );
        if (tentativa < MAX_TENTATIVAS) {
          await dormir(espera);
        }
        continue;
      }

      // Outros erros não são recuperáveis com reintento.
      const detalhe = await resposta.text().catch(() => '');
      const motivo = this.descreverErro(resposta.status, detalhe);
      this.logger.error(`Gemini rejeitou a chamada — ${motivo}`);
      throw new GeminiIndisponivelError(
        `Falha ao consultar o assistente — ${motivo}`,
      );
    }

    throw new GeminiIndisponivelError(
      `O assistente atingiu um limite da API do Gemini. Detalhe: ${ultimoErro}`,
    );
  }

  /** Backoff exponencial simples: ~1s, 2s, 4s, 8s. */
  private atraso(tentativa: number): number {
    return 2 ** (tentativa - 1) * 1000;
  }

  /**
   * Extrai do corpo de erro 429 o tempo de espera sugerido pela API (em ms),
   * seja do campo estruturado RetryInfo (`retryDelay: "10s"`) ou do texto
   * ("Please retry in 10.15s"). Retorna undefined se não houver.
   */
  private tempoDeEsperaSugerido(corpo: string): number | undefined {
    const segundos = corpo.match(
      /retry(?:Delay)?["':\s]*~?\s*(\d+(?:\.\d+)?)\s*s/i,
    );
    if (segundos) {
      return Math.ceil(parseFloat(segundos[1]) * 1000);
    }
    return undefined;
  }

  /**
   * Extrai um motivo legível do corpo de erro da API do Gemini, que costuma
   * vir como { error: { code, status, message } }. Ajuda a diagnosticar
   * problemas comuns (chave inválida, modelo inexistente, API não habilitada).
   */
  private descreverErro(status: number, corpo: string): string {
    try {
      const json = JSON.parse(corpo) as {
        error?: { status?: string; message?: string };
      };
      const erro = json.error;
      if (erro?.message) {
        return `${erro.status ?? `HTTP ${status}`}: ${erro.message}`;
      }
    } catch {
      // corpo não é JSON; usa o texto cru abaixo.
    }
    return `HTTP ${status}. ${corpo.slice(0, 200)}`.trim();
  }

  private extrairTexto(dados: RespostaGemini): string {
    const bloqueio = dados.promptFeedback?.blockReason;
    if (bloqueio) {
      return 'Não consigo responder a essa mensagem. Pode reformular a pergunta de outra forma?';
    }
    const texto = dados.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim();
    if (!texto) {
      return 'Não consegui gerar uma resposta agora. Pode tentar reformular a pergunta?';
    }
    return texto;
  }
}
