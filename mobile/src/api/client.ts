/**
 * Cliente HTTP do app.
 *
 * Encapsula `fetch` adicionando: URL base, cabeçalho de autorização com o
 * token JWT (carregado do armazenamento seguro), serialização de JSON, suporte
 * a `multipart/form-data` (upload de arquivos/imagens), timeout e o mapeamento
 * de erros do backend para uma exceção tipada (`ApiError`) com a mensagem em
 * Português devolvida pela API.
 */
import { API_BASE_URL, TIMEOUT_REQUISICAO_MS } from './config';
import { tokenStorage } from './tokenStorage';

export class ApiError extends Error {
  readonly status: number;
  readonly corpo: unknown;

  constructor(status: number, mensagem: string, corpo?: unknown) {
    super(mensagem);
    this.name = 'ApiError';
    this.status = status;
    this.corpo = corpo;
  }

  /** Indica falha de autenticação/autorização (sessão inválida/expirada). */
  get naoAutorizado(): boolean {
    return this.status === 401;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface OpcoesRequisicao {
  query?: Query;
  body?: unknown;
  /** Quando definido, envia como multipart/form-data (upload). */
  form?: FormData;
  signal?: AbortSignal;
}

/** Notifica a aplicação quando a sessão expira (token inválido). */
type AoExpirarSessao = () => void;

let aoExpirarSessao: AoExpirarSessao | null = null;

export function registrarAoExpirarSessao(cb: AoExpirarSessao | null): void {
  aoExpirarSessao = cb;
}

function montarUrl(caminho: string, query?: Query): string {
  const url = new URL(
    caminho.startsWith('/') ? caminho.slice(1) : caminho,
    `${API_BASE_URL}/`,
  );
  if (query) {
    for (const [chave, valor] of Object.entries(query)) {
      if (valor !== undefined && valor !== null) {
        url.searchParams.append(chave, String(valor));
      }
    }
  }
  return url.toString();
}

async function extrairMensagemErro(
  resposta: Response,
): Promise<{ mensagem: string; corpo: unknown }> {
  try {
    const corpo = await resposta.json();
    // O backend normaliza erros como { statusCode, mensagem } (em Português);
    // validações do Nest usam { message }. Aceitamos ambos para sempre exibir
    // a mensagem real do servidor, com fallback genérico.
    const bruto =
      corpo?.mensagem ??
      (Array.isArray(corpo?.message) ? corpo.message.join(', ') : corpo?.message) ??
      corpo?.error ??
      `Erro ${resposta.status}`;
    const mensagem = Array.isArray(bruto) ? bruto.join(', ') : String(bruto);
    return { mensagem, corpo };
  } catch {
    return {
      mensagem: `Erro ${resposta.status} ao comunicar com o servidor.`,
      corpo: null,
    };
  }
}

async function requisitar<T>(
  metodo: string,
  caminho: string,
  opcoes: OpcoesRequisicao = {},
): Promise<T> {
  const { query, body, form, signal } = opcoes;
  const url = montarUrl(caminho, query);

  const token = await tokenStorage.obterToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let payload: BodyInit | undefined;
  if (form) {
    payload = form as unknown as BodyInit;
    // Não definimos Content-Type: o runtime adiciona o boundary do multipart.
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const controlador = new AbortController();
  const timeout = setTimeout(
    () => controlador.abort(),
    TIMEOUT_REQUISICAO_MS,
  );
  if (signal) {
    signal.addEventListener('abort', () => controlador.abort());
  }

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: metodo,
      headers,
      body: payload,
      signal: controlador.signal,
    });
  } catch (erro) {
    clearTimeout(timeout);
    if ((erro as Error).name === 'AbortError') {
      throw new ApiError(0, 'Tempo de conexão esgotado. Tente novamente.');
    }
    throw new ApiError(
      0,
      'Não foi possível conectar ao servidor. Verifique sua conexão.',
    );
  }
  clearTimeout(timeout);

  if (!resposta.ok) {
    const { mensagem, corpo } = await extrairMensagemErro(resposta);
    if (resposta.status === 401) {
      aoExpirarSessao?.();
    }
    throw new ApiError(resposta.status, mensagem, corpo);
  }

  if (resposta.status === 204) {
    return undefined as T;
  }

  const tipoConteudo = resposta.headers.get('content-type') ?? '';
  if (tipoConteudo.includes('application/json')) {
    return (await resposta.json()) as T;
  }
  return (await resposta.text()) as unknown as T;
}

export const apiClient = {
  get: <T>(caminho: string, query?: Query, signal?: AbortSignal) =>
    requisitar<T>('GET', caminho, { query, signal }),
  post: <T>(caminho: string, body?: unknown, query?: Query) =>
    requisitar<T>('POST', caminho, { body, query }),
  put: <T>(caminho: string, body?: unknown, query?: Query) =>
    requisitar<T>('PUT', caminho, { body, query }),
  patch: <T>(caminho: string, body?: unknown, query?: Query) =>
    requisitar<T>('PATCH', caminho, { body, query }),
  delete: <T>(caminho: string, query?: Query) =>
    requisitar<T>('DELETE', caminho, { query }),
  upload: <T>(caminho: string, form: FormData, query?: Query) =>
    requisitar<T>('POST', caminho, { form, query }),
};

export default apiClient;
