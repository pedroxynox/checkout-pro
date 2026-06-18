/** Barrel do subsistema de cache offline e sincronização (Task 19). */
export * from './tipos';
export * from './fila';
export {
  PersistenciaMemoria,
  PersistenciaSqlite,
  abrirPersistenciaSqlite,
  NOME_BANCO,
} from './persistencia';
export type { PersistenciaOffline } from './persistencia';
export { OfflineStore } from './OfflineStore';
export {
  sincronizar,
  criarExecutoresApi,
} from './sincronizacao';
export type { ExecutoresSincronizacao } from './sincronizacao';
export { useOffline } from './useOffline';
export type { EstadoOffline } from './useOffline';
export { OfflineProvider, useOfflineContexto } from './OfflineContext';
