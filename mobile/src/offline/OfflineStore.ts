/**
 * `OfflineStore`: fachada de alto nível sobre a `PersistenciaOffline`.
 *
 * Combina o cache de leitura (telas de consulta — indicadores, escala,
 * históricos) com a fila de ações pendentes, delegando as decisões puras de
 * ordenação/conflito a `fila.ts` e a persistência a `PersistenciaOffline`.
 *
 * Estratégia de leitura offline (`lerComCache`): tenta buscar online; em caso
 * de sucesso, atualiza o cache e o devolve; em caso de falha (ex.: offline),
 * devolve o último valor cacheado, se houver.
 */
import { adicionarAcao } from './fila';
import { PersistenciaOffline } from './persistencia';
import { AcaoPendente, PayloadPorTipo, TipoAcao } from './tipos';

/** Gera um identificador único simples para uma ação (sem dependências). */
function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class OfflineStore {
  constructor(
    private readonly persistencia: PersistenciaOffline,
    private readonly agora: () => number = () => Date.now(),
  ) {}

  /** Lê do cache local uma entrada previamente salva (JSON desserializado). */
  async lerCache<T>(chave: string): Promise<T | null> {
    const bruto = await this.persistencia.lerCache(chave);
    if (bruto === null) {
      return null;
    }
    try {
      return JSON.parse(bruto) as T;
    } catch {
      return null;
    }
  }

  /** Grava no cache local uma entrada serializável. */
  async gravarCache<T>(chave: string, valor: T): Promise<void> {
    await this.persistencia.gravarCache(chave, JSON.stringify(valor));
  }

  /**
   * Busca dados de consulta com suporte a cache offline: tenta `buscar()`
   * (online); ao obter sucesso, atualiza o cache e o retorna; em caso de erro,
   * devolve o último valor cacheado (operação offline), ou relança o erro se
   * não houver cache.
   */
  async lerComCache<T>(chave: string, buscar: () => Promise<T>): Promise<T> {
    try {
      const dados = await buscar();
      await this.gravarCache(chave, dados);
      return dados;
    } catch (erro) {
      const cacheado = await this.lerCache<T>(chave);
      if (cacheado !== null) {
        return cacheado;
      }
      throw erro;
    }
  }

  /** Lista as ações pendentes atualmente na fila. */
  async acoesPendentes(): Promise<AcaoPendente[]> {
    return this.persistencia.listarAcoes();
  }

  /** Quantidade de ações pendentes na fila. */
  async quantidadePendente(): Promise<number> {
    return (await this.persistencia.listarAcoes()).length;
  }

  /**
   * Enfileira uma nova ação pendente (leitura de fardo / alteração de status),
   * carimbando o instante de criação. Retorna a ação criada.
   */
  async enfileirar<T extends TipoAcao>(
    tipo: T,
    payload: PayloadPorTipo[T],
    entidadeId: string,
  ): Promise<AcaoPendente<T>> {
    const acao: AcaoPendente<T> = {
      id: gerarId(),
      tipo,
      payload,
      criadaEm: this.agora(),
      entidadeId,
    };
    const fila = await this.persistencia.listarAcoes();
    await this.persistencia.salvarAcoes(adicionarAcao(fila, acao));
    return acao;
  }

  /** Substitui a fila inteira (uso interno da sincronização). */
  async substituirFila(acoes: readonly AcaoPendente[]): Promise<void> {
    await this.persistencia.salvarAcoes(acoes);
  }
}
