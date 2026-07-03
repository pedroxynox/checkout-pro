import { ConfigService } from '@nestjs/config';
import { GeminiClient } from './gemini.client';

/** Um "deferred": promessa cujo resolve controlamos externamente no teste. */
function criarDiferido<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
} {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Cria uma resposta fetch fake com sucesso (ok:true) e o texto informado. */
function respostaOk(texto: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: texto }] } }],
    }),
  } as unknown as Response;
}

function criarConfig(valores: Record<string, string>): ConfigService {
  return {
    get: (chave: string) => valores[chave],
  } as unknown as ConfigService;
}

describe('GeminiClient', () => {
  const configComChave = criarConfig({ GEMINI_API_KEY: 'chave-de-teste' });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('estaConfigurado() reflete a presença da chave', () => {
    const clienteSem = new GeminiClient(criarConfig({}));
    const clienteCom = new GeminiClient(configComChave);
    expect(clienteSem.estaConfigurado()).toBe(false);
    expect(clienteCom.estaConfigurado()).toBe(true);
  });

  it('retorna o texto extraído em uma chamada simples', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(respostaOk('olá do modelo'));
    const cliente = new GeminiClient(configComChave);
    await expect(cliente.gerarResposta('sys', [])).resolves.toBe(
      'olá do modelo',
    );
  });

  it('não mantém mais de MAX_CONCORRENCIA (2) chamadas fetch simultâneas', async () => {
    const diferidos = [
      criarDiferido<Response>(),
      criarDiferido<Response>(),
      criarDiferido<Response>(),
    ];
    let indice = 0;
    let emVoo = 0;
    let maxEmVoo = 0;

    jest.spyOn(global, 'fetch').mockImplementation(() => {
      const atual = diferidos[indice++];
      emVoo++;
      maxEmVoo = Math.max(maxEmVoo, emVoo);
      // Decrementa o contador quando o fetch "termina".
      return atual.promise.then((r) => {
        emVoo--;
        return r;
      });
    });

    const cliente = new GeminiClient(configComChave);

    // Inicia 3 chamadas; com concorrência 2, apenas 2 fetch devem disparar.
    const p1 = cliente.gerarResposta('sys', []);
    const p2 = cliente.gerarResposta('sys', []);
    const p3 = cliente.gerarResposta('sys', []);

    // Deixa os microtasks rodarem para os fetch iniciais dispararem.
    await Promise.resolve();
    await Promise.resolve();
    expect(global.fetch).toHaveBeenCalledTimes(2);

    // Resolve a 1ª: libera um slot, permitindo a 3ª chamada iniciar seu fetch.
    diferidos[0].resolve(respostaOk('r1'));
    await p1;
    await Promise.resolve();
    await Promise.resolve();
    expect(global.fetch).toHaveBeenCalledTimes(3);

    // Resolve as demais e garante que tudo conclui sem exceder o limite.
    diferidos[1].resolve(respostaOk('r2'));
    diferidos[2].resolve(respostaOk('r3'));
    await Promise.all([p2, p3]);

    expect(maxEmVoo).toBeLessThanOrEqual(2);
  });
});
