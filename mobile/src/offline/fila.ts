/**
 * Lógica **pura** da fila de ações pendentes (offline) — sem dependência de
 * persistência ou rede, portanto totalmente testável.
 *
 * Responsabilidades:
 *  - acrescentar ações preservando a ordem cronológica de criação;
 *  - ordenar as ações para sincronização (mais antiga primeiro);
 *  - resolver conflitos de status do fiscal por "última alteração vence"
 *    (last-write-wins): para cada fiscal, apenas a alteração de status mais
 *    recente é mantida; as anteriores são descartadas (Req 4.1.2).
 */
import { AcaoPendente } from './tipos';

/** Ordena as ações da mais antiga para a mais recente (ordem de envio). */
export function ordenarParaEnvio(
  acoes: readonly AcaoPendente[],
): AcaoPendente[] {
  return [...acoes].sort((a, b) => a.criadaEm - b.criadaEm);
}

/** Acrescenta uma ação à fila, mantendo-a ordenada cronologicamente. */
export function adicionarAcao(
  fila: readonly AcaoPendente[],
  acao: AcaoPendente,
): AcaoPendente[] {
  return ordenarParaEnvio([...fila, acao]);
}

/**
 * Resolve conflitos de alteração de status por entidade (fiscal), aplicando
 * "última alteração vence". Para cada `entidadeId` de ações do tipo
 * `ALTERACAO_STATUS_FISCAL`, mantém apenas a ação com maior `criadaEm`
 * (desempate pela ordem de chegada — a última prevalece). Ações de outros
 * tipos (ex.: retirada de fardo) são preservadas integralmente, pois cada
 * leitura é um evento de estoque independente.
 *
 * Retorna a lista de ações a manter e a lista descartada (superadas).
 */
export function resolverConflitos(acoes: readonly AcaoPendente[]): {
  mantidas: AcaoPendente[];
  descartadas: AcaoPendente[];
} {
  const ordenadas = ordenarParaEnvio(acoes);

  // Para cada fiscal, descobre o instante da alteração de status vencedora.
  const vencedoraPorFiscal = new Map<string, AcaoPendente>();
  for (const acao of ordenadas) {
    if (acao.tipo !== 'ALTERACAO_STATUS_FISCAL') {
      continue;
    }
    const atual = vencedoraPorFiscal.get(acao.entidadeId);
    if (!atual || acao.criadaEm >= atual.criadaEm) {
      vencedoraPorFiscal.set(acao.entidadeId, acao);
    }
  }

  const mantidas: AcaoPendente[] = [];
  const descartadas: AcaoPendente[] = [];
  for (const acao of ordenadas) {
    if (acao.tipo !== 'ALTERACAO_STATUS_FISCAL') {
      mantidas.push(acao);
      continue;
    }
    const vencedora = vencedoraPorFiscal.get(acao.entidadeId);
    if (vencedora && vencedora.id === acao.id) {
      mantidas.push(acao);
    } else {
      descartadas.push(acao);
    }
  }

  return { mantidas, descartadas };
}

/** Remove da fila as ações cujos ids estão no conjunto informado. */
export function removerAcoes(
  fila: readonly AcaoPendente[],
  ids: ReadonlySet<string>,
): AcaoPendente[] {
  return fila.filter((a) => !ids.has(a.id));
}
