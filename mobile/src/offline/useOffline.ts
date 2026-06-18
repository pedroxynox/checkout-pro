/**
 * Hook de operação offline e sincronização para as telas.
 *
 * Expõe o estado de conectividade, a contagem de ações pendentes e funções
 * para enfileirar ações (leitura de fardo, alteração de status) e disparar a
 * sincronização. Ao transitar de offline para online, sincroniza
 * automaticamente a fila pendente (Req 4.1.2, 3.1.1).
 *
 * A detecção de conectividade real depende de um monitor de rede (ex.:
 * `@react-native-community/netinfo`) no dispositivo; aqui a conectividade é
 * controlada por `definirOnline`, permitindo que a camada de rede/serviços
 * informe o estado atual.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { OfflineStore } from './OfflineStore';
import {
  ExecutoresSincronizacao,
  sincronizar,
} from './sincronizacao';
import {
  PayloadPorTipo,
  ResultadoSincronizacao,
  TipoAcao,
} from './tipos';

export interface EstadoOffline {
  online: boolean;
  pendentes: number;
  definirOnline: (online: boolean) => void;
  enfileirar: <T extends TipoAcao>(
    tipo: T,
    payload: PayloadPorTipo[T],
    entidadeId: string,
  ) => Promise<void>;
  sincronizarAgora: () => Promise<ResultadoSincronizacao>;
}

export function useOffline(
  store: OfflineStore,
  executores: ExecutoresSincronizacao,
  inicialOnline = true,
): EstadoOffline {
  const [online, setOnline] = useState(inicialOnline);
  const [pendentes, setPendentes] = useState(0);
  const onlineAnterior = useRef(inicialOnline);

  const atualizarContagem = useCallback(async () => {
    setPendentes(await store.quantidadePendente());
  }, [store]);

  useEffect(() => {
    void atualizarContagem();
  }, [atualizarContagem]);

  const sincronizarAgora =
    useCallback(async (): Promise<ResultadoSincronizacao> => {
      const resultado = await sincronizar(store, executores, { online });
      await atualizarContagem();
      return resultado;
    }, [store, executores, online, atualizarContagem]);

  const enfileirar = useCallback(
    async <T extends TipoAcao>(
      tipo: T,
      payload: PayloadPorTipo[T],
      entidadeId: string,
    ): Promise<void> => {
      await store.enfileirar(tipo, payload, entidadeId);
      await atualizarContagem();
    },
    [store, atualizarContagem],
  );

  // Sincroniza automaticamente ao reconectar (transição offline -> online).
  useEffect(() => {
    if (online && !onlineAnterior.current) {
      void sincronizarAgora();
    }
    onlineAnterior.current = online;
  }, [online, sincronizarAgora]);

  const definirOnline = useCallback((valor: boolean) => {
    setOnline(valor);
  }, []);

  return {
    online,
    pendentes,
    definirOnline,
    enfileirar,
    sincronizarAgora,
  };
}
