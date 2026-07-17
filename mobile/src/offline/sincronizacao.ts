/**
 * Motor de sincronização da fila offline (Req 4.1.2, 3.1.1).
 *
 * Ao reconectar, drena a fila de ações pendentes do `OfflineStore`:
 *  1. aplica a resolução de conflito "última alteração vence" para o status do
 *     fiscal (descartando alterações superadas);
 *  2. envia ao backend, em ordem cronológica, as ações mantidas, usando os
 *     `ExecutoresSincronizacao` injetados (que encapsulam os serviços de API);
 *  3. remove da fila as ações enviadas com sucesso (e as descartadas),
 *     preservando as que falharem para uma próxima tentativa.
 *
 * Os executores são injetados para manter a lógica testável sem rede.
 */
import { ordenarParaEnvio, removerAcoes, resolverConflitos } from './fila';
import { OfflineStore } from './OfflineStore';
import {
  AcaoPendente,
  PayloadAlteracaoStatus,
  PayloadRegistroBatida,
  PayloadRetiradaFardo,
  ResultadoSincronizacao,
} from './tipos';

/** Executores que efetivam cada tipo de ação no backend. */
export interface ExecutoresSincronizacao {
  retirarFardo(payload: PayloadRetiradaFardo): Promise<void>;
  alterarStatusFiscal(payload: PayloadAlteracaoStatus): Promise<void>;
  /**
   * Registra uma batida no backend. O `clienteId` (chave de idempotência) já
   * vem no payload, gerado no cliente antes da primeira tentativa, para que um
   * reenvio não duplique a batida.
   */
  registrarBatida(payload: PayloadRegistroBatida): Promise<void>;
}

/**
 * Status HTTP em que a rejeição é DEFINITIVA (validação/negócio): reenviar não
 * resolve, então a ação é descartada para não travar a fila. Falhas de rede
 * (status 0), autenticação (401/403) e erros de servidor (5xx) NÃO entram aqui:
 * são transitórias e a ação é preservada para uma nova tentativa.
 */
const STATUS_REJEICAO_DEFINITIVA = new Set([400, 404, 409, 422]);

/** true quando o erro é uma rejeição definitiva do backend (não reenviar). */
function ehRejeicaoDefinitiva(erro: unknown): boolean {
  const status = (erro as { status?: number } | null)?.status;
  return typeof status === 'number' && STATUS_REJEICAO_DEFINITIVA.has(status);
}

/** Executa uma única ação por meio do executor correspondente. */
async function executarAcao(
  acao: AcaoPendente,
  executores: ExecutoresSincronizacao,
): Promise<void> {
  switch (acao.tipo) {
    case 'RETIRADA_FARDO':
      await executores.retirarFardo(acao.payload as PayloadRetiradaFardo);
      return;
    case 'ALTERACAO_STATUS_FISCAL':
      await executores.alterarStatusFiscal(
        acao.payload as PayloadAlteracaoStatus,
      );
      return;
    case 'REGISTRO_BATIDA':
      // O clienteId (idempotência) já está no payload, fixado na 1ª tentativa.
      await executores.registrarBatida(acao.payload as PayloadRegistroBatida);
      return;
    default: {
      // Tipo desconhecido: trata como sucesso para não travar a fila.
      return;
    }
  }
}

/**
 * Sincroniza a fila pendente. Quando `online` é falso, não faz nada e relata a
 * quantidade pendente. As ações enviadas com sucesso e as descartadas por
 * last-write-wins são removidas da fila; as que falharem permanecem.
 */
export async function sincronizar(
  store: OfflineStore,
  executores: ExecutoresSincronizacao,
  opcoes: { online: boolean },
): Promise<ResultadoSincronizacao> {
  const filaAtual = await store.acoesPendentes();

  if (!opcoes.online) {
    return {
      sincronizadas: 0,
      descartadas: 0,
      rejeitadas: 0,
      pendentes: filaAtual.length,
      offline: true,
    };
  }

  const { mantidas, descartadas } = resolverConflitos(filaAtual);
  const aEnviar = ordenarParaEnvio(mantidas);

  const idsResolvidos = new Set<string>(descartadas.map((a) => a.id));
  let sincronizadas = 0;
  let rejeitadas = 0;

  for (const acao of aEnviar) {
    try {
      await executarAcao(acao, executores);
      idsResolvidos.add(acao.id);
      sincronizadas += 1;
    } catch (erro) {
      // Rejeição definitiva (validação/negócio 4xx) — SÓ para batidas: reenviar
      // não resolve (ex.: dia de folga, limite), então descarta para não travar
      // a fila. Os demais tipos preservam o comportamento anterior (mantêm e
      // reenviam), evitando mudar a semântica dos fluxos já existentes.
      if (acao.tipo === 'REGISTRO_BATIDA' && ehRejeicaoDefinitiva(erro)) {
        idsResolvidos.add(acao.id);
        rejeitadas += 1;
        continue;
      }
      // Falha transitória (rede/servidor/sessão): interrompe para preservar a
      // ordem e tentar novamente depois.
      break;
    }
  }

  const novaFila = removerAcoes(filaAtual, idsResolvidos);
  await store.substituirFila(novaFila);

  return {
    sincronizadas,
    descartadas: descartadas.length,
    rejeitadas,
    pendentes: novaFila.length,
    offline: false,
  };
}

/**
 * Cria executores de produção a partir dos serviços de API. Importado de forma
 * tardia pelos consumidores para evitar acoplamento de teste.
 */
export function criarExecutoresApi(servicos: {
  retirarFardo: (
    codigoBarras: string,
    insumoId: string,
    destino?: string,
  ) => Promise<unknown>;
  alterarStatus: (
    fiscalId: string,
    status: PayloadAlteracaoStatus['status'],
  ) => Promise<unknown>;
  registrarBatida: (input: PayloadRegistroBatida) => Promise<unknown>;
}): ExecutoresSincronizacao {
  return {
    async retirarFardo(payload) {
      await servicos.retirarFardo(
        payload.codigoBarras,
        payload.insumoId,
        payload.destino,
      );
    },
    async alterarStatusFiscal(payload) {
      await servicos.alterarStatus(payload.fiscalId, payload.status);
    },
    async registrarBatida(payload) {
      await servicos.registrarBatida(payload);
    },
  };
}
