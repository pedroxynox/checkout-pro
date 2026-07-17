/**
 * Tipos do subsistema de cache offline e sincronização (Req 3.1.1, 4.1.1,
 * 4.1.2).
 *
 * O app mantém localmente (SQLite) dois conjuntos de dados:
 *  - um **cache de leitura** de telas de consulta (indicadores, escala,
 *    históricos), para operação offline;
 *  - uma **fila de ações pendentes** (leitura de fardo, alteração de status do
 *    fiscal) realizadas sem conexão, sincronizadas ao reconectar.
 *
 * A resolução de conflito de status do fiscal é "última alteração vence"
 * (last-write-wins), comparada pelo instante `criadaEm` de cada ação.
 */

/** Tipos de ação que podem ser enfileiradas para sincronização posterior. */
export type TipoAcao =
  | 'RETIRADA_FARDO'
  | 'ALTERACAO_STATUS_FISCAL'
  | 'REGISTRO_BATIDA';

/** Status possíveis de um fiscal (espelha o backend). */
export type StatusFiscalOffline =
  | 'DISPONIVEL'
  | 'INTERVALO'
  | 'FORA_EXPEDIENTE';

/** Carga de uma retirada de fardo por leitura de código de barras. */
export interface PayloadRetiradaFardo {
  codigoBarras: string;
  insumoId: string;
  destino?: string;
}

/** Carga de uma alteração de status de um fiscal. */
export interface PayloadAlteracaoStatus {
  fiscalId: string;
  status: StatusFiscalOffline;
}

/**
 * Carga de um registro de batida (Relógio Ponto) feito sem conexão. Guarda a
 * HORA DO COMPROVANTE (`hora`) e a `data` do dia, que são enviadas tal como
 * capturadas — a sincronização posterior NÃO as substitui pela hora de envio.
 * A idempotência usa o `id` da ação como `clienteId` no backend, então um
 * reenvio não duplica a batida.
 */
export interface PayloadRegistroBatida {
  /**
   * Chave de idempotência, gerada no cliente ANTES da primeira tentativa
   * (online). Reusada no reenvio pela fila: se o servidor chegou a gravar a
   * batida na tentativa online mas a resposta se perdeu (timeout/queda), o
   * reenvio com o mesmo `clienteId` NÃO cria duplicata.
   */
  clienteId: string;
  pessoaId: string;
  tipoPessoa?: 'FISCAL' | 'OPERADOR';
  colaboradorId?: string | null;
  /** Dia da batida (ISO yyyy-mm-dd). */
  data: string;
  /** Hora do comprovante (ISO), preservada no envio posterior. */
  hora: string;
  origem?: 'MANUAL' | 'LEITOR' | 'EDITADO';
  nomeLido?: string;
  confianca?: number;
}

/** Mapeia cada tipo de ação à sua carga. */
export interface PayloadPorTipo {
  RETIRADA_FARDO: PayloadRetiradaFardo;
  ALTERACAO_STATUS_FISCAL: PayloadAlteracaoStatus;
  REGISTRO_BATIDA: PayloadRegistroBatida;
}

/** Uma ação pendente genérica na fila offline. */
export interface AcaoPendente<T extends TipoAcao = TipoAcao> {
  /** Identificador único da ação (gerado no cliente). */
  id: string;
  tipo: T;
  payload: PayloadPorTipo[T];
  /**
   * Instante (epoch ms) em que a ação foi criada no dispositivo. É a base da
   * ordenação de sincronização e da resolução "última alteração vence".
   */
  criadaEm: number;
  /**
   * Chave da entidade afetada, usada para resolver conflitos (ex.: o
   * `fiscalId` no caso de alteração de status).
   */
  entidadeId: string;
}

/** Resultado de uma rodada de sincronização da fila. */
export interface ResultadoSincronizacao {
  /** Ações efetivamente enviadas ao backend com sucesso. */
  sincronizadas: number;
  /**
   * Ações descartadas por terem sido superadas por uma alteração mais recente
   * da mesma entidade (last-write-wins).
   */
  descartadas: number;
  /** Ações que permaneceram na fila (falha de envio ou offline). */
  pendentes: number;
  /**
   * Ações removidas por rejeição definitiva do backend (erro de validação/
   * negócio 4xx — ex.: dia de folga, limite de batidas). Não são reenviadas
   * para não travar a fila; ficam registradas apenas na contagem.
   */
  rejeitadas: number;
  /** Indica se a sincronização foi pulada por estar offline. */
  offline: boolean;
}
