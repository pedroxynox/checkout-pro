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
 * limite por minuto da camada gratuita, as chamadas são **serializadas** numa
 * fila interna e há **reintento automático com backoff** quando a API responde
 * 429 (limite) ou 503 (sobrecarga). Assim, no pior caso o usuário espera
 * alguns segundos a mais, em vez de receber um erro.
 */
@Injectable()
export class GeminiClient {
  private readonly logger = new Logger(GeminiClient.name);
  /** Cadeia de promessas que serializa as chamadas à API. */
  private fila: Promise<unknown> = Promise.resolve();

  constructor(private readonly config: ConfigService) {}

  /** Indica se a chave da API está configurada. */
  estaConfigurado(): boolean {
    return Boolean(this.config.get<string>('GEMINI_API_KEY'));
  }

  /**
   * Gera uma resposta do modelo a partir da instrução de sistema e do
   * histórico da conversa. As chamadas entram numa fila (uma de cada vez).
   */
  async gerarResposta(
    instrucaoSistema: string,
    mensagens: MensagemGemini[],
  ): Promise<string> {
    const tarefa = this.fila.then(() =>
      this.chamarComReintento(instrucaoSistema, mensagens),
    );
    // Mantém a fila viva mesmo se esta tarefa falhar (não propaga rejeição).
    this.fila = tarefa.catch(() => undefined);
    return tarefa;
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
      this.config.get<string>('GEMINI_MODEL') ?? 'gemini-2.0-flash';
    const url = `${URL_BASE}/${modelo}:generateContent?key=${chave}`;

    const corpo = {
      systemInstruction: { parts: [{ text: instrucaoSistema }] },
      contents: mensagens.map((m) => ({
        role: m.papel,
        parts: [{ text: m.texto }],
      })),
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 1024,
      },
    };

    let ultimoErro = '';
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      let resposta: Response;
      try {
        resposta = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corpo),
        });
      } catch (erro) {
        ultimoErro = (erro as Error).message;
        await dormir(this.atraso(tentativa));
        continue;
      }

      if (resposta.ok) {
        const dados = (await resposta.json()) as RespostaGemini;
        return this.extrairTexto(dados);
      }

      // 429 (limite) e 503 (sobrecarga) podem ser temporários: reintenta.
      // Guarda o motivo detalhado da API para diagnóstico (qual cota).
      if (resposta.status === 429 || resposta.status === 503) {
        const corpo = await resposta.text().catch(() => '');
        ultimoErro = this.descreverErro(resposta.status, corpo);
        this.logger.warn(
          `Gemini ${resposta.status} (tentativa ${tentativa}/${MAX_TENTATIVAS}) — ${ultimoErro}`,
        );
        if (tentativa < MAX_TENTATIVAS) {
          await dormir(this.atraso(tentativa));
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
