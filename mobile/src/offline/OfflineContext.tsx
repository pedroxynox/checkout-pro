/**
 * Provedor de contexto do subsistema offline.
 *
 * Inicializa o `OfflineStore` apoiado em SQLite local (com fallback em memória
 * caso o banco nativo não esteja disponível), monta os executores de
 * sincronização a partir dos serviços de API e expõe o estado de operação
 * offline (conectividade, fila pendente, enfileirar, sincronizar) às telas via
 * `useOfflineContexto`.
 *
 * O provedor não altera a renderização das telas; serve para disponibilizar o
 * cache offline e a fila de ações em todo o app (Req 3.1.1, 4.1.1, 4.1.2).
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { fiscaisService, insumosService, pontoService } from '../api/services';
import { OfflineStore } from './OfflineStore';
import {
  abrirPersistenciaSqlite,
  PersistenciaMemoria,
  PersistenciaOffline,
} from './persistencia';
import { criarExecutoresApi, ExecutoresSincronizacao } from './sincronizacao';
import { EstadoOffline, useOffline } from './useOffline';

const OfflineContext = createContext<EstadoOffline | undefined>(undefined);

/** Monta os executores de produção a partir dos serviços de API. */
const executoresProducao: ExecutoresSincronizacao = criarExecutoresApi({
  retirarFardo: (codigoBarras, insumoId, destino) =>
    insumosService.retirarFardo(codigoBarras, insumoId, destino),
  // O fiscal é identificado pelo login no backend; o fiscalId enfileirado é
  // usado apenas para resolver conflitos (last-write-wins).
  alterarStatus: (_fiscalId, status) => fiscaisService.definirStatus(status),
  registrarBatida: (input) => pontoService.registrarBatida(input),
});

export function OfflineProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  // Persistência: começa em memória e é promovida a SQLite quando disponível.
  const [persistencia, setPersistencia] = useState<PersistenciaOffline>(
    () => new PersistenciaMemoria(),
  );

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const sqlite = await abrirPersistenciaSqlite();
        if (ativo) {
          setPersistencia(sqlite);
        }
      } catch {
        // Mantém o fallback em memória quando o SQLite nativo não está
        // disponível (ex.: ambiente sem o runtime do Expo).
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  const store = useMemo(() => new OfflineStore(persistencia), [persistencia]);
  const estado = useOffline(store, executoresProducao);

  return (
    <OfflineContext.Provider value={estado}>{children}</OfflineContext.Provider>
  );
}

/** Acesso ao estado offline. Deve ser usado dentro de `OfflineProvider`. */
export function useOfflineContexto(): EstadoOffline {
  const ctx = useContext(OfflineContext);
  if (!ctx) {
    throw new Error(
      'useOfflineContexto deve ser usado dentro de <OfflineProvider>.',
    );
  }
  return ctx;
}
