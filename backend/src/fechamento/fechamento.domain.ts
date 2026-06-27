import {
  CONFIG_ARRECADACAO,
  TIPOS_ARRECADACAO,
  TipoArrecadacao,
} from '../arrecadacao/arrecadacao.domain';

/**
 * Lógica pura do "resumo inteligente" do Fechamento do dia (Fase 1).
 *
 * A partir do estado bruto (arrecadações, vendas e checklists do dia), monta um
 * resumo legível para o gestor: o que já está resolvido, o que falta e alertas
 * de consistência (ex.: tudo marcado como "sem movimento", vendas enviadas mas
 * arrecadações faltando, dia encerrado com pendências). Sem efeitos colaterais
 * — testável sem banco.
 */

/** Status já resolvido (OK/sem movimento) ou faltante (pendente/não enviado). */
export type StatusItemFechamento =
  | 'OK'
  | 'SEM_MOVIMENTO'
  | 'PENDENTE'
  | 'NAO_ENVIADO';

export type CategoriaFechamento = 'ARRECADACAO' | 'VENDAS' | 'CHECKLIST';

export interface ItemFechamento {
  id: string;
  titulo: string;
  categoria: CategoriaFechamento;
  status: StatusItemFechamento;
}

export type StatusArrecadacaoBruto = 'ENVIADO' | 'SEM_MOVIMENTO' | 'PENDENTE';
export type StatusChecklistBruto = 'FEITO' | 'PENDENTE';

export interface EntradaResumoFechamento {
  arrecadacao: Record<TipoArrecadacao, StatusArrecadacaoBruto>;
  vendasEnviado: boolean;
  checklistAbertura: StatusChecklistBruto;
  checklistFechamento: StatusChecklistBruto;
  /** A data de referência já passou (anterior a hoje)? */
  diaPassou: boolean;
}

export interface ResumoFechamento {
  /** Arquivos (5 arrecadações + vendas) resolvidos — espelha `estaCompleto`. */
  completoArquivos: boolean;
  /** Tudo pronto (arquivos + os 2 checklists). */
  tudoPronto: boolean;
  totalItens: number;
  concluidos: number;
  itens: ItemFechamento[];
  /** Títulos do que ainda falta. */
  pendentes: string[];
  /** Mensagens inteligentes (consistência/atenção). */
  alertas: string[];
}

/** Um item está resolvido se foi enviado ou marcado como sem movimento. */
function resolvido(status: StatusItemFechamento): boolean {
  return status === 'OK' || status === 'SEM_MOVIMENTO';
}

/** Deriva o status de um item "enviável" (vendas/checklist) ainda não feito. */
function statusFaltante(diaPassou: boolean): StatusItemFechamento {
  return diaPassou ? 'NAO_ENVIADO' : 'PENDENTE';
}

/** Monta o resumo inteligente do fechamento a partir do estado bruto do dia. */
export function montarResumoFechamento(
  entrada: EntradaResumoFechamento,
): ResumoFechamento {
  const itens: ItemFechamento[] = [];

  // 5 arrecadações.
  for (const tipo of TIPOS_ARRECADACAO) {
    const bruto = entrada.arrecadacao[tipo] ?? 'PENDENTE';
    const status: StatusItemFechamento =
      bruto === 'ENVIADO'
        ? 'OK'
        : bruto === 'SEM_MOVIMENTO'
          ? 'SEM_MOVIMENTO'
          : statusFaltante(entrada.diaPassou);
    itens.push({
      id: tipo,
      titulo: CONFIG_ARRECADACAO[tipo].titulo,
      categoria: 'ARRECADACAO',
      status,
    });
  }

  // Vendas por hora.
  itens.push({
    id: 'VENDAS',
    titulo: 'Vendas por hora',
    categoria: 'VENDAS',
    status: entrada.vendasEnviado ? 'OK' : statusFaltante(entrada.diaPassou),
  });

  // Checklists de abertura e fechamento.
  itens.push({
    id: 'CHECKLIST_ABERTURA',
    titulo: 'Checklist de abertura',
    categoria: 'CHECKLIST',
    status:
      entrada.checklistAbertura === 'FEITO'
        ? 'OK'
        : statusFaltante(entrada.diaPassou),
  });
  itens.push({
    id: 'CHECKLIST_FECHAMENTO',
    titulo: 'Checklist de fechamento',
    categoria: 'CHECKLIST',
    status:
      entrada.checklistFechamento === 'FEITO'
        ? 'OK'
        : statusFaltante(entrada.diaPassou),
  });

  const arquivos = itens.filter(
    (i) => i.categoria === 'ARRECADACAO' || i.categoria === 'VENDAS',
  );
  const completoArquivos = arquivos.every((i) => resolvido(i.status));
  const tudoPronto = itens.every((i) => resolvido(i.status));
  const concluidos = itens.filter((i) => resolvido(i.status)).length;
  const pendentes = itens
    .filter((i) => !resolvido(i.status))
    .map((i) => i.titulo);

  const alertas = montarAlertas(entrada, itens, pendentes);

  return {
    completoArquivos,
    tudoPronto,
    totalItens: itens.length,
    concluidos,
    itens,
    pendentes,
    alertas,
  };
}

/** Alertas de consistência/atenção a partir do estado e dos itens. */
function montarAlertas(
  entrada: EntradaResumoFechamento,
  itens: readonly ItemFechamento[],
  pendentes: readonly string[],
): string[] {
  const alertas: string[] = [];

  // Todas as 5 arrecadações marcadas como "sem movimento" é incomum.
  const todasSemMovimento = TIPOS_ARRECADACAO.every(
    (t) => entrada.arrecadacao[t] === 'SEM_MOVIMENTO',
  );
  if (todasSemMovimento) {
    alertas.push(
      'As 5 arrecadações foram marcadas como "sem movimento". Confirme se está ' +
        'correto — um dia sem nenhum troco, recarga, cancelamento ou devolução ' +
        'é incomum.',
    );
  }

  // Vendas já entraram, mas faltam arrecadações.
  const arrecadacaoFaltando = itens
    .filter(
      (i) =>
        i.categoria === 'ARRECADACAO' &&
        i.status !== 'OK' &&
        i.status !== 'SEM_MOVIMENTO',
    )
    .map((i) => i.titulo);
  if (entrada.vendasEnviado && arrecadacaoFaltando.length > 0) {
    alertas.push(
      `As vendas já entraram, mas ainda faltam: ${arrecadacaoFaltando.join(', ')}.`,
    );
  }

  // Dia encerrado com pendências.
  if (entrada.diaPassou && pendentes.length > 0) {
    alertas.push(
      `O dia já passou e ficaram itens não enviados: ${pendentes.join(', ')}.`,
    );
  }

  return alertas;
}
