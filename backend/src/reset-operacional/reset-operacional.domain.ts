/**
 * Lógica de domínio **pura** do Modulo_ResetOperacional.
 *
 * Concentra o "plano de reinício" (quais entidades apagar, em que ordem, e onde
 * apenas zerar o saldo de insumos), a partição apagar/conservar e um modelo
 * puro de execução (reduce sobre contagens) — tudo sem qualquer dependência do
 * Prisma ou do Nest, de modo a ser testável de forma determinística (incluindo
 * por testes de propriedade).
 *
 * Requisitos: 2.1–2.7 (escopo do que apagar), 3.1–3.5 (o que conservar),
 * 4.3/4.4 (idempotência e resumo), 8.1 (domínio puro testável).
 */

/** Ação de um passo do plano de reinício. */
export type AcaoReset = 'APAGAR' | 'ZERAR_SALDO_INSUMOS';

/** Um passo do plano: entidade (nome `@@map`), ação e ordem de execução. */
export interface PassoReset {
  /** Nome da tabela conforme `@@map` no schema Prisma. */
  entidade: string;
  acao: AcaoReset;
  /** Menor primeiro; a ordem respeita as dependências (FK filho→pai). */
  ordem: number;
}

/**
 * Plano ordenado de reinício. A ordem garante que filhos (FK) sejam apagados
 * antes dos pais e que o estoque em movimento seja apagado antes de zerar o
 * `saldo` dos insumos (que são conservados). `Object.freeze` impede mutações.
 */
export const PLANO_REINICIO: readonly PassoReset[] = Object.freeze([
  // 1) Sacolas APAE: movimentos antes do lote (FK loteId, onDelete Cascade).
  { entidade: 'movimentos_lote_apae', acao: 'APAGAR', ordem: 10 },
  { entidade: 'lotes_apae', acao: 'APAGAR', ordem: 11 },
  // 2) Estoque em movimento antes de zerar o saldo dos insumos (conservados).
  { entidade: 'movimentos_estoque', acao: 'APAGAR', ordem: 20 },
  { entidade: 'requisicoes', acao: 'APAGAR', ordem: 21 },
  { entidade: 'sugestoes_pedido', acao: 'APAGAR', ordem: 22 },
  { entidade: 'insumos', acao: 'ZERAR_SALDO_INSUMOS', ordem: 23 },
  // 3) Fluxo legado: registros antes das importações (FK importacaoId).
  { entidade: 'registros_operacionais', acao: 'APAGAR', ordem: 30 },
  { entidade: 'registros_importacao', acao: 'APAGAR', ordem: 31 },
  // 4) Jornada / escala por data (FK apenas para entidades conservadas).
  { entidade: 'registros_ponto_fiscal', acao: 'APAGAR', ordem: 40 },
  { entidade: 'ausencias', acao: 'APAGAR', ordem: 41 },
  { entidade: 'incidencias_escala', acao: 'APAGAR', ordem: 42 },
  // 5) Vendas.
  { entidade: 'vendas_diarias', acao: 'APAGAR', ordem: 50 },
  { entidade: 'vendas_hora', acao: 'APAGAR', ordem: 51 },
  // 6) Arrecadação.
  { entidade: 'registros_arrecadacao', acao: 'APAGAR', ordem: 60 },
  { entidade: 'arrecadacao_sem_movimento', acao: 'APAGAR', ordem: 61 },
  // 7) Avisos / assistente / fechamento / checklists.
  { entidade: 'notificacoes', acao: 'APAGAR', ordem: 70 },
  { entidade: 'mensagens_assistente', acao: 'APAGAR', ordem: 71 },
  { entidade: 'fechamentos_concluidos', acao: 'APAGAR', ordem: 72 },
  { entidade: 'checklists', acao: 'APAGAR', ordem: 73 },
]);

/**
 * As 18 entidades de `Dados_de_Movimento` que o reinício DEVE apagar
 * (Requisitos 2.1–2.7). Usada como referência de cobertura exata nos testes.
 */
export const ENTIDADES_MOVIMENTO_ESPERADAS: readonly string[] = Object.freeze([
  'vendas_diarias',
  'vendas_hora',
  'registros_arrecadacao',
  'arrecadacao_sem_movimento',
  'movimentos_estoque',
  'requisicoes',
  'sugestoes_pedido',
  'movimentos_lote_apae',
  'lotes_apae',
  'registros_ponto_fiscal',
  'ausencias',
  'incidencias_escala',
  'notificacoes',
  'mensagens_assistente',
  'fechamentos_concluidos',
  'checklists',
  'registros_operacionais',
  'registros_importacao',
]);

/**
 * Entidades explicitamente CONSERVADAS (Dados_de_Cadastro + configuração/metas
 * + a própria Data_Inicial_Sistema). `insumos` aparece aqui porque a LINHA é
 * conservada — apenas o campo `saldo` é zerado (passo `ZERAR_SALDO_INSUMOS`).
 *
 * Requisitos 3.1–3.5.
 */
export const ENTIDADES_CONSERVADAS: readonly string[] = Object.freeze([
  'usuarios',
  'colaboradores',
  'colaborador_identificadores',
  'operadores',
  'fiscais',
  'escala_entries',
  'operador_turnos',
  'insumos',
  'fardos',
  'pedidos_recorrentes',
  'config_apae',
  'config_vendas',
  'metas_indicador',
  'metas_mensais',
  'config_sistema',
]);

/**
 * Pares `[filho, pai]`: no plano, o filho DEVE ser apagado antes do pai (para
 * respeitar as chaves estrangeiras).
 */
export const DEPENDENCIAS_FK: ReadonlyArray<readonly [string, string]> =
  Object.freeze([
    ['movimentos_lote_apae', 'lotes_apae'],
    ['registros_operacionais', 'registros_importacao'],
  ] as const);

/** Contagem de registros por entidade (chave = nome `@@map`). */
export type ContagensPorEntidade = Record<string, number>;

/** Resumo do reinício: registros apagados por entidade (Req 4.4). */
export type ResumoDeReinicio = Record<string, number>;

/** Conjunto de entidades que o plano APAGA (sem duplicatas). */
export function entidadesApagadas(
  plano: readonly PassoReset[] = PLANO_REINICIO,
): Set<string> {
  return new Set(
    plano.filter((p) => p.acao === 'APAGAR').map((p) => p.entidade),
  );
}

/**
 * Verdadeiro se apagadas e conservadas não têm interseção (partição válida):
 * nenhuma entidade conservada é apagada.
 */
export function planoEhParticaoValida(
  plano: readonly PassoReset[] = PLANO_REINICIO,
  conservadas: readonly string[] = ENTIDADES_CONSERVADAS,
): boolean {
  const apagar = entidadesApagadas(plano);
  return conservadas.every((c) => !apagar.has(c));
}

/**
 * Verdadeiro se a ordem do plano respeita as dependências informadas, ou seja,
 * `ordem(filho) < ordem(pai)` para cada par `[filho, pai]`. Se algum dos dois
 * não estiver no plano, o par é considerado não violado.
 */
export function ordemRespeitaDependencias(
  plano: readonly PassoReset[] = PLANO_REINICIO,
  dependencias: ReadonlyArray<readonly [string, string]> = DEPENDENCIAS_FK,
): boolean {
  const ordemDe = new Map(plano.map((p) => [p.entidade, p.ordem]));
  return dependencias.every(([filho, pai]) => {
    const oFilho = ordemDe.get(filho);
    const oPai = ordemDe.get(pai);
    if (oFilho === undefined || oPai === undefined) return true;
    return oFilho < oPai;
  });
}

/** Resultado da execução pura do plano sobre um estado de contagens. */
export interface ResultadoExecucaoPura {
  /** Estado final das contagens (entidades apagadas ficam em 0). */
  estadoFinal: ContagensPorEntidade;
  /** Resumo com a contagem apagada por entidade (Req 4.4). */
  resumo: ResumoDeReinicio;
}

/**
 * Modelo **puro** de execução do reinício sobre um mapa de contagens por
 * entidade (sem banco de dados). Para cada passo `APAGAR`, registra no resumo a
 * contagem existente e zera a entidade no estado final; o passo
 * `ZERAR_SALDO_INSUMOS` não apaga linhas (não entra no resumo). Base para
 * testar a idempotência (Property 3) e a cobertura do resumo (Property 4).
 */
export function executarPlanoPuro(
  estado: ContagensPorEntidade,
  plano: readonly PassoReset[] = PLANO_REINICIO,
): ResultadoExecucaoPura {
  const estadoFinal: ContagensPorEntidade = { ...estado };
  const resumo: ResumoDeReinicio = {};
  for (const passo of plano) {
    if (passo.acao === 'APAGAR') {
      resumo[passo.entidade] = estadoFinal[passo.entidade] ?? 0;
      estadoFinal[passo.entidade] = 0;
    }
  }
  return { estadoFinal, resumo };
}
