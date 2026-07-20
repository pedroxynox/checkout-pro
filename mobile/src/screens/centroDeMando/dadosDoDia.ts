/**
 * Dados do dia da Home — fonte ÚNICA e compartilhada.
 *
 * Reúne, de forma DEFENSIVA e por REGRAS (sem IA), as contagens de pendências
 * por módulo (os "selos" nos acessos, na aba Tarefas e na barra de abas).
 *
 * Dois ganhos de desempenho concentrados aqui:
 *  1. **Uma só busca compartilhada** (`buscaCompartilhada`): pedidos iguais em
 *     andamento ou recentes (< TTL) reaproveitam a MESMA Promise, eliminando as
 *     chamadas duplicadas que a Home, a barra de abas e a aba Tarefas faziam.
 *  2. **Caminho rápido de vendas** (`painelResumo`): consome o resumo leve do
 *     painel, sem varrer ~90 dias (curva/heatmap).
 */
import {
  arrecadacaoService,
  checklistService,
  insumosService,
  operadoresService,
  vendasService,
} from '../../api/services';
import {
  DiaOperadores,
  InsumoProativo,
  PainelAtencao,
  PainelVendasResumo,
  StatusArrecadacao,
  StatusChecklist,
  StatusVendas,
  TipoArrecadacao,
} from '../../api/types';
import { hojeISO } from '../../utils/formato';

/** Queda (%) de vendas considerada relevante para virar pendência. */
export const QUEDA_VENDAS_RELEVANTE = 10;

/** Data de ontem (ISO), a partir de "hoje". */
export function ontemISO(): string {
  const d = new Date(`${hojeISO()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ----------------------- Busca compartilhada (dedup) ----------------------

/** Janela em que uma busca resolvida é reaproveitada (evita rebuscas). */
const TTL_MS = 60_000;

interface EntradaCache {
  expira: number;
  promessa: Promise<unknown>;
}

const cache = new Map<string, EntradaCache>();

/**
 * Compartilha uma busca por CHAVE: chamadas iguais em andamento ou recentes
 * (< TTL) reaproveitam a mesma Promise. Erros NÃO ficam em cache — a chave é
 * removida quando a busca falha, então a próxima chamada tenta de novo.
 */
function buscaCompartilhada<T>(
  chave: string,
  criar: () => Promise<T>,
): Promise<T> {
  const agora = Date.now();
  const atual = cache.get(chave);
  if (atual && atual.expira > agora) {
    return atual.promessa as Promise<T>;
  }
  const promessa = criar().catch((erro) => {
    cache.delete(chave);
    throw erro;
  });
  cache.set(chave, { expira: agora + TTL_MS, promessa });
  return promessa;
}

/** Limpa a cache (usado ao recarregar a Home e nos testes). */
export function limparCacheDadosDoDia(): void {
  cache.clear();
}

// --------------------------- Buscadores (por chave) -----------------------
// Cada um compartilha a busca e é DEFENSIVO (cai num valor neutro se falhar).

export function buscarArrecStatus(
  data: string,
): Promise<StatusArrecadacao | null> {
  return buscaCompartilhada(`arrec-status:${data}`, () =>
    arrecadacaoService.status(data),
  ).catch(() => null);
}

export function buscarVendaStatus(data: string): Promise<StatusVendas | null> {
  return buscaCompartilhada(`venda-status:${data}`, () =>
    vendasService.status(data),
  ).catch(() => null);
}

export function buscarPainelResumo(
  data: string,
): Promise<PainelVendasResumo | null> {
  return buscaCompartilhada(`painel-resumo:${data}`, () =>
    vendasService.painelResumo(data),
  ).catch(() => null);
}

export function buscarInsumos(): Promise<InsumoProativo[]> {
  return buscaCompartilhada('insumos-proativo', () =>
    insumosService.listarProativo(),
  ).catch(() => [] as InsumoProativo[]);
}

export function buscarAtencao(data: string): Promise<PainelAtencao | null> {
  return buscaCompartilhada(`atencao:${data}`, () =>
    arrecadacaoService.painelAtencao(data),
  ).catch(() => null);
}

export function buscarChecklist(
  tipo: 'ABERTURA' | 'FECHAMENTO',
  data: string,
): Promise<{ status: StatusChecklist } | null> {
  return buscaCompartilhada(`ck:${tipo}:${data}`, () =>
    checklistService.status(tipo, data),
  ).catch(() => null);
}

export function buscarOperadoresDia(
  data: string,
): Promise<DiaOperadores | null> {
  return buscaCompartilhada(`op-dia:${data}`, () =>
    operadoresService.dia(data),
  ).catch(() => null);
}

// --------------------------- Pendências por módulo ------------------------

/** Dados brutos usados para contar as pendências por módulo. */
export interface DadosPulso {
  arrecHoje: StatusArrecadacao | null;
  vendaStatusHoje: StatusVendas | null;
  painelOntem: PainelVendasResumo | null;
  insumos: InsumoProativo[];
  atencao: PainelAtencao | null;
  ckAb: { status: StatusChecklist } | null;
  ckFe: { status: StatusChecklist } | null;
  opDia: DiaOperadores | null;
}

/**
 * Conta as pendências por módulo (mesmas regras de sempre). Cada módulo só é
 * considerado se o usuário tem acesso a ele (`podeAcessar`).
 */
export function calcularPendencias(
  d: DadosPulso,
  podeAcessar: (funcionalidade: string) => boolean,
): Record<string, number> {
  const pend: Record<string, number> = {};
  const horaAgora = new Date().getHours();

  // Importações: arquivos de arrecadação pendentes + vendas por hora.
  if (podeAcessar('IMPORTACOES')) {
    let carga = 0;
    if (d.arrecHoje) {
      for (const tipo of Object.keys(d.arrecHoje) as TipoArrecadacao[]) {
        if (d.arrecHoje[tipo] === 'PENDENTE') carga += 1;
      }
    }
    if (d.vendaStatusHoje && !d.vendaStatusHoje.enviado) carga += 1;
    if (carga > 0) pend.Importacoes = carga;
  }

  // Insumos críticos.
  if (podeAcessar('INSUMOS')) {
    const criticos = d.insumos.filter((i) => i.nivel === 'CRITICO').length;
    if (criticos > 0) pend.Insumos = criticos;
  }

  // Checklist não feito (com janela de horário, como no painel).
  if (podeAcessar('CHECKLIST')) {
    let checklist = 0;
    if (d.ckAb?.status === 'PENDENTE' && horaAgora >= 9) checklist += 1;
    if (d.ckFe?.status === 'PENDENTE' && horaAgora >= 14) checklist += 1;
    if (checklist > 0) pend.Checklist = checklist;
  }

  // Indicadores fora da meta.
  if (podeAcessar('INDICADORES_VISUALIZAR')) {
    const indicadores = d.atencao ? d.atencao.criticos + d.atencao.emAtencao : 0;
    if (indicadores > 0) pend.Indicadores = indicadores;
  }

  // Faltas de operadores.
  if (podeAcessar('OPERADORES_AUSENCIAS')) {
    const faltas = d.opDia?.faltas ?? 0;
    if (faltas > 0) pend.Operadores = faltas;
  }

  // Painel de Vendas: queda relevante de ontem e/ou projeção abaixo da meta.
  if (podeAcessar('PAINEL_VENDAS_VISUALIZAR') && d.painelOntem) {
    let vendas = 0;
    const variacao = d.painelOntem.comparativos?.dia?.variacao ?? null;
    if (variacao != null && variacao <= -QUEDA_VENDAS_RELEVANTE) vendas += 1;
    if (
      d.painelOntem.projecaoVsMeta != null &&
      d.painelOntem.projecaoVsMeta < 0
    ) {
      vendas += 1;
    }
    if (vendas > 0) pend.PainelVendas = vendas;
  }

  return pend;
}

// O hook `useDadosDaHome` (que também alimentava o "Resumo do Dia", removido)
// foi retirado: a Home usa `usePulsoDoDia` apenas para as contagens de
// pendência (os selos). As buscas exclusivas do briefing (arrecadação/vendas de
// ontem e painel de hoje) deixaram de ser feitas.
