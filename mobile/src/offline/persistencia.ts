/**
 * Camada de persistência do cache offline e da fila de ações pendentes.
 *
 * Define a interface `PersistenciaOffline` (usada pelo `OfflineStore`) e duas
 * implementações:
 *  - `PersistenciaSqlite`: armazenamento real em **SQLite local** via
 *    `expo-sqlite` (Req: "SQLite local / cache offline" do design). Requer o
 *    runtime nativo do Expo — deve ser exercitada em um dispositivo/emulador.
 *  - `PersistenciaMemoria`: implementação em memória, usada nos testes e como
 *    fallback, com a mesma semântica observável.
 */
import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { AcaoPendente } from './tipos';

/**
 * Contrato de persistência offline: um armazenamento chave-valor para o cache
 * de leitura e uma fila serializada de ações pendentes.
 */
export interface PersistenciaOffline {
  lerCache(chave: string): Promise<string | null>;
  gravarCache(chave: string, valor: string): Promise<void>;
  listarAcoes(): Promise<AcaoPendente[]>;
  salvarAcoes(acoes: readonly AcaoPendente[]): Promise<void>;
  limpar(): Promise<void>;
}

/** Implementação em memória (testes/fallback). */
export class PersistenciaMemoria implements PersistenciaOffline {
  private cache = new Map<string, string>();
  private acoes: AcaoPendente[] = [];

  async lerCache(chave: string): Promise<string | null> {
    return this.cache.get(chave) ?? null;
  }

  async gravarCache(chave: string, valor: string): Promise<void> {
    this.cache.set(chave, valor);
  }

  async listarAcoes(): Promise<AcaoPendente[]> {
    // Devolve cópias para evitar mutação externa do estado interno.
    return this.acoes.map((a) => ({ ...a }));
  }

  async salvarAcoes(acoes: readonly AcaoPendente[]): Promise<void> {
    this.acoes = acoes.map((a) => ({ ...a }));
  }

  async limpar(): Promise<void> {
    this.cache.clear();
    this.acoes = [];
  }
}

/** Nome do arquivo do banco SQLite local. */
export const NOME_BANCO = 'stokcenter-offline.db';

/**
 * Implementação SQLite (produção) via `expo-sqlite`. Usa duas tabelas:
 *  - `cache_leitura(chave TEXT PRIMARY KEY, valor TEXT)`
 *  - `acoes_pendentes(id TEXT PRIMARY KEY, tipo TEXT, payload TEXT,
 *     criada_em INTEGER, entidade_id TEXT)`
 *
 * A criação do banco/tabelas é feita por `abrirPersistenciaSqlite`.
 */
export class PersistenciaSqlite implements PersistenciaOffline {
  constructor(private readonly db: SQLiteDatabase) {}

  async lerCache(chave: string): Promise<string | null> {
    const linha = await this.db.getFirstAsync<{ valor: string }>(
      'SELECT valor FROM cache_leitura WHERE chave = ?',
      [chave],
    );
    return linha?.valor ?? null;
  }

  async gravarCache(chave: string, valor: string): Promise<void> {
    await this.db.runAsync(
      'INSERT OR REPLACE INTO cache_leitura (chave, valor) VALUES (?, ?)',
      [chave, valor],
    );
  }

  async listarAcoes(): Promise<AcaoPendente[]> {
    const linhas = await this.db.getAllAsync<{
      id: string;
      tipo: string;
      payload: string;
      criada_em: number;
      entidade_id: string;
    }>(
      'SELECT id, tipo, payload, criada_em, entidade_id FROM acoes_pendentes ORDER BY criada_em ASC',
    );
    return linhas.map((l) => ({
      id: l.id,
      tipo: l.tipo as AcaoPendente['tipo'],
      payload: JSON.parse(l.payload),
      criadaEm: l.criada_em,
      entidadeId: l.entidade_id,
    }));
  }

  async salvarAcoes(acoes: readonly AcaoPendente[]): Promise<void> {
    // Reescreve a fila inteira de forma transacional para manter consistência.
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('DELETE FROM acoes_pendentes');
      for (const a of acoes) {
        await this.db.runAsync(
          'INSERT INTO acoes_pendentes (id, tipo, payload, criada_em, entidade_id) VALUES (?, ?, ?, ?, ?)',
          [a.id, a.tipo, JSON.stringify(a.payload), a.criadaEm, a.entidadeId],
        );
      }
    });
  }

  async limpar(): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('DELETE FROM cache_leitura');
      await this.db.runAsync('DELETE FROM acoes_pendentes');
    });
  }
}

/**
 * Abre (ou cria) o banco SQLite local e garante o schema, retornando uma
 * `PersistenciaSqlite` pronta para uso. Deve ser chamada na inicialização do
 * app, em um dispositivo/emulador com o runtime do Expo.
 */
export async function abrirPersistenciaSqlite(): Promise<PersistenciaSqlite> {
  // Em web não existe o módulo nativo de SQLite. Lançamos cedo (antes de
  // qualquer require de `expo-sqlite`) para que o módulo nativo NUNCA seja
  // avaliado no bundle web — caso contrário, o app quebra com
  // "Cannot find native module 'ExpoSQLite'" e fica com a tela branca.
  // O OfflineProvider captura este erro e mantém a persistência em memória.
  if (Platform.OS === 'web') {
    throw new Error(
      'SQLite local indisponível na web; usando persistência em memória.',
    );
  }
  // Import perezoso via require: o módulo nativo só é carregado em runtime
  // nativo (nunca avaliado no bundle web).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { openDatabaseAsync } = require('expo-sqlite') as typeof import('expo-sqlite');
  const db = await openDatabaseAsync(NOME_BANCO);
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS cache_leitura (
      chave TEXT PRIMARY KEY NOT NULL,
      valor TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS acoes_pendentes (
      id TEXT PRIMARY KEY NOT NULL,
      tipo TEXT NOT NULL,
      payload TEXT NOT NULL,
      criada_em INTEGER NOT NULL,
      entidade_id TEXT NOT NULL
    );
  `);
  return new PersistenciaSqlite(db);
}
