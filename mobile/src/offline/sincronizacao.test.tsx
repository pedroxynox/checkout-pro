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
} {
  const fardos: unknown[] = [];
  const status: unknown[] = [];
  return {
    fardos,
    status,
    retirarFardo: jest.fn(async (p) => {
      fardos.push(p);
    }),
    alterarStatusFiscal: jest.fn(async (p) => {
      status.push(p);
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
