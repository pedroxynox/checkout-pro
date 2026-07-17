/**
 * Teste de UI de operação offline e sincronização posterior (Task 19.2).
 *
 * Valida, através do hook `useOffline` (consumido pelas telas), que:
 *  - ações realizadas offline (leitura de fardo, alteração de status) são
 *    enfileiradas e nada é enviado ao backend enquanto offline;
 *  - ao reconectar, a fila é sincronizada automaticamente, enviando as ações;
 *  - alterações de status do mesmo fiscal são resolvidas por "última alteração
 *    vence" (apenas a mais recente é enviada).
 *
 * Inclui também um teste direto do motor de sincronização com persistência em
 * memória, para cobrir o comportamento sem a camada de UI.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { OfflineStore } from './OfflineStore';
import { PersistenciaMemoria } from './persistencia';
import { ExecutoresSincronizacao, sincronizar } from './sincronizacao';
import { useOffline } from './useOffline';

function relogioIncremental(inicio = 1000): () => number {
  let t = inicio;
  return () => (t += 1000);
}

function executoresFake(): ExecutoresSincronizacao & {
  fardos: unknown[];
  status: unknown[];
  batidas: unknown[];
} {
  const fardos: unknown[] = [];
  const status: unknown[] = [];
  const batidas: unknown[] = [];
  return {
    fardos,
    status,
    batidas,
    retirarFardo: jest.fn(async (p) => {
      fardos.push(p);
    }),
    alterarStatusFiscal: jest.fn(async (p) => {
      status.push(p);
    }),
    registrarBatida: jest.fn(async (p) => {
      batidas.push(p);
    }),
  };
}

describe('useOffline — operação offline e sincronização', () => {
  it('enfileira ações offline e sincroniza ao reconectar (last-write-wins)', async () => {
    const store = new OfflineStore(
      new PersistenciaMemoria(),
      relogioIncremental(),
    );
    const executores = executoresFake();

    const { result } = renderHook(() =>
      useOffline(store, executores, /* inicialOnline */ false),
    );

    // Offline: enfileira uma leitura de fardo e duas alterações de status do
    // mesmo fiscal.
    await act(async () => {
      await result.current.enfileirar(
        'RETIRADA_FARDO',
        { codigoBarras: '789100000001', insumoId: 'sacola-p' },
        'sacola-p',
      );
      await result.current.enfileirar(
        'ALTERACAO_STATUS_FISCAL',
        { fiscalId: 'fiscal-1', status: 'INTERVALO' },
        'fiscal-1',
      );
      await result.current.enfileirar(
        'ALTERACAO_STATUS_FISCAL',
        { fiscalId: 'fiscal-1', status: 'DISPONIVEL' },
        'fiscal-1',
      );
    });

    // Nada foi enviado enquanto offline; há 3 ações pendentes.
    expect(executores.retirarFardo).not.toHaveBeenCalled();
    expect(executores.alterarStatusFiscal).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.pendentes).toBe(3));

    // Reconecta: dispara a sincronização automática.
    act(() => {
      result.current.definirOnline(true);
    });

    await waitFor(() => expect(result.current.pendentes).toBe(0));

    // A leitura de fardo foi enviada; das duas alterações de status, apenas a
    // mais recente (DISPONIVEL) foi enviada (last-write-wins).
    expect(executores.retirarFardo).toHaveBeenCalledTimes(1);
    expect(executores.alterarStatusFiscal).toHaveBeenCalledTimes(1);
    expect(executores.status).toEqual([
      { fiscalId: 'fiscal-1', status: 'DISPONIVEL' },
    ]);
  });

  it('não envia nada e preserva a fila enquanto offline', async () => {
    const store = new OfflineStore(
      new PersistenciaMemoria(),
      relogioIncremental(),
    );
    const executores = executoresFake();

    await store.enfileirar(
      'RETIRADA_FARDO',
      { codigoBarras: '1', insumoId: 'i1' },
      'i1',
    );

    const resultado = await sincronizar(store, executores, { online: false });

    expect(resultado.offline).toBe(true);
    expect(resultado.pendentes).toBe(1);
    expect(executores.retirarFardo).not.toHaveBeenCalled();
    expect(await store.quantidadePendente()).toBe(1);
  });

  it('mantém na fila as ações que falham no envio', async () => {
    const store = new OfflineStore(
      new PersistenciaMemoria(),
      relogioIncremental(),
    );
    const executores = executoresFake();
    (executores.retirarFardo as jest.Mock).mockRejectedValueOnce(
      new Error('rede indisponível'),
    );

    await store.enfileirar(
      'RETIRADA_FARDO',
      { codigoBarras: '1', insumoId: 'i1' },
      'i1',
    );

    const resultado = await sincronizar(store, executores, { online: true });

    expect(resultado.sincronizadas).toBe(0);
    expect(resultado.pendentes).toBe(1);
    expect(await store.quantidadePendente()).toBe(1);
  });

  it('serve leitura do cache quando a busca online falha (offline)', async () => {
    const store = new OfflineStore(new PersistenciaMemoria());

    // Primeira leitura online popula o cache.
    const online = await store.lerComCache('escala:1', async () => [
      { funcionarioId: 'Ana', efetiva: 'FOLGA' },
    ]);
    expect(online).toHaveLength(1);

    // Segunda leitura falha (offline): devolve o valor cacheado.
    const offline = await store.lerComCache('escala:1', async () => {
      throw new Error('sem conexão');
    });
    expect(offline).toEqual([{ funcionarioId: 'Ana', efetiva: 'FOLGA' }]);
  });
});


describe('sincronização de batidas de ponto (offline)', () => {
  function erroComStatus(status: number): Error {
    return Object.assign(new Error(`erro ${status}`), { status });
  }

  it('envia a batida ao sincronizar, preservando a hora e o clienteId (idempotência)', async () => {
    const store = new OfflineStore(
      new PersistenciaMemoria(),
      relogioIncremental(),
    );
    const executores = executoresFake();

    await store.enfileirar(
      'REGISTRO_BATIDA',
      {
        clienteId: 'cli-1',
        pessoaId: 'p1',
        tipoPessoa: 'FISCAL',
        data: '2026-07-10',
        hora: '2026-07-10T08:00:00.000Z',
        origem: 'LEITOR',
      },
      'p1',
    );

    const r = await sincronizar(store, executores, { online: true });

    expect(r.sincronizadas).toBe(1);
    expect(executores.batidas).toEqual([
      expect.objectContaining({
        pessoaId: 'p1',
        // A hora do comprovante é preservada (não vira a hora de envio).
        hora: '2026-07-10T08:00:00.000Z',
        // O clienteId fixado na 1ª tentativa é reenviado (idempotência).
        clienteId: 'cli-1',
      }),
    ]);
    expect(await store.quantidadePendente()).toBe(0);
  });

  it('descarta uma batida rejeitada pelo backend (4xx) sem travar a fila', async () => {
    const store = new OfflineStore(
      new PersistenciaMemoria(),
      relogioIncremental(),
    );
    const executores = executoresFake();
    // A batida (mais antiga) é rejeitada com 409 (ex.: dia de folga).
    (executores.registrarBatida as jest.Mock).mockRejectedValueOnce(
      erroComStatus(409),
    );

    await store.enfileirar(
      'REGISTRO_BATIDA',
      {
        clienteId: 'cli-rej',
        pessoaId: 'p1',
        data: '2026-07-10',
        hora: '2026-07-10T08:00:00.000Z',
      },
      'p1',
    );
    await store.enfileirar(
      'RETIRADA_FARDO',
      { codigoBarras: '1', insumoId: 'i1' },
      'i1',
    );

    const r = await sincronizar(store, executores, { online: true });

    // A batida rejeitada é removida; a ação seguinte (fardo) é enviada.
    expect(r.rejeitadas).toBe(1);
    expect(r.sincronizadas).toBe(1);
    expect(executores.fardos).toHaveLength(1);
    expect(await store.quantidadePendente()).toBe(0);
  });

  it('mantém a batida na fila quando falha por rede (status 0, transitório)', async () => {
    const store = new OfflineStore(
      new PersistenciaMemoria(),
      relogioIncremental(),
    );
    const executores = executoresFake();
    (executores.registrarBatida as jest.Mock).mockRejectedValueOnce(
      erroComStatus(0),
    );

    await store.enfileirar(
      'REGISTRO_BATIDA',
      {
        clienteId: 'cli-net',
        pessoaId: 'p1',
        data: '2026-07-10',
        hora: '2026-07-10T08:00:00.000Z',
      },
      'p1',
    );

    const r = await sincronizar(store, executores, { online: true });

    expect(r.rejeitadas).toBe(0);
    expect(r.sincronizadas).toBe(0);
    expect(await store.quantidadePendente()).toBe(1);
  });
});
