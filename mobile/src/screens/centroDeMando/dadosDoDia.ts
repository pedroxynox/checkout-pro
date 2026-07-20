/**
 * Dados do dia da Home — fonte ÚNICA e compartilhada.
 *
 * Reúne, de forma DEFENSIVA e por REGRAS (sem IA), os sinais que a Home usa:
 *  - o Resumo do Dia (briefing) e
 *  - as contagens de pendências por módulo (selos nos acessos, aba Tarefas e
 *    selo da barra de abas).
 *
 * Três ganhos de desempenho concentrados aqui:
 *  1. **Uma só busca compartilhada** (`buscaCompartilhada`): pedidos iguais em
 *     andamento ou recentes (< TTL) reaproveitam a MESMA Promise, eliminando as
 *     chamadas duplicadas que a Home, a barra de abas e a aba Tarefas faziam.
 *  2. **Carga progressiva** (`useDadosDaHome`): cada campo tem seu próprio
 *     estado de carregando, então o Resumo do Dia mostra cada cartão assim que o
 *     dado chega, em vez de esperar TODOS.
 *  3. **Caminho rápido de vendas** (`painelResumo`): a Home consome o resumo
 *     leve do painel, sem varrer ~90 dias (curva/heatmap).
 */
import React from 'react';
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
  Perfil,
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

// --------------------------- Temas por perfil ----------------------------

/** Temas que compõem a saúde; quais aparecem depende do perfil. */
export type Tema =
  | 'checklist'
  | 'insumos'
  | 'indicadores'
  | 'faltas'
  | 'cobertura'
  | 'carga'
  | 'ventas'
  | 'metaVendas';

/**
 * Conjunto de temas relevantes para cada perfil. O briefing e a nota de saúde
 * são iguais para todos os perfis de gestão/operação; o IMPORTADOR vê só a
 * carga do dia.
 */
export function temasDoPerfil(perfil: Perfil | null): Set<Tema> {
  if (perfil === 'IMPORTADOR') {
    return new Set<Tema>(['carga']);
  }
  return new Set<Tema>([
    'checklist',
    'insumos',
    'indicadores',
    'faltas',
    'cobertura',
    'carga',
    'ventas',
    'metaVendas',
  ]);
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

// ----------------------- Hook: dados da Home (progressivo) ----------------

/** Um campo com seu dado e se ainda está carregando. */
export interface CampoHome<T> {
  dado: T;
  carregando: boolean;
}

/** Campos que o Resumo do Dia (briefing) consome. */
export interface CamposHome {
  arrecOntem: CampoHome<StatusArrecadacao | null>;
  vendaStatusOntem: CampoHome<StatusVendas | null>;
  painelOntem: CampoHome<PainelVendasResumo | null>;
  painelHoje: CampoHome<PainelVendasResumo | null>;
  statusVendasHoje: CampoHome<StatusVendas | null>;
  insumos: CampoHome<InsumoProativo[]>;
  atencao: CampoHome<PainelAtencao | null>;
  ckAb: CampoHome<{ status: StatusChecklist } | null>;
  ckFe: CampoHome<{ status: StatusChecklist } | null>;
  opDia: CampoHome<DiaOperadores | null>;
}

interface EstadoInterno extends CamposHome {
  /** Só para as contagens (não vai para o briefing). */
  arrecHoje: CampoHome<StatusArrecadacao | null>;
  vendaStatusHoje: CampoHome<StatusVendas | null>;
}

function campo<T>(dado: T, carregando: boolean): CampoHome<T> {
  return { dado, carregando };
}

export interface DadosDaHome {
  campos: CamposHome;
  pendenciasPorModulo: Record<string, number>;
  totalPendencias: number;
  recarregar: () => void;
}

/**
 * Busca todos os sinais do dia UMA vez (compartilhado e deduplicado), com
 * estado de carregando POR CAMPO para o briefing aparecer de forma progressiva.
 * Só busca o que o perfil precisa (briefing) ou o que o usuário pode acessar
 * (contagens), evitando chamadas desnecessárias.
 */
export function useDadosDaHome(
  perfil: Perfil | null,
  podeAcessar: (funcionalidade: string) => boolean,
): DadosDaHome {
  const [estado, setEstado] = React.useState<EstadoInterno>(() => ({
    arrecOntem: campo(null, true),
    vendaStatusOntem: campo(null, true),
    painelOntem: campo(null, true),
    painelHoje: campo(null, true),
    statusVendasHoje: campo(null, true),
    insumos: campo([], true),
    atencao: campo(null, true),
    ckAb: campo(null, true),
    ckFe: campo(null, true),
    opDia: campo(null, true),
    arrecHoje: campo(null, true),
    vendaStatusHoje: campo(null, true),
  }));
  const [nonce, setNonce] = React.useState(0);
  const podeRef = React.useRef(podeAcessar);
  podeRef.current = podeAcessar;

  React.useEffect(() => {
    let vivo = true;
    const pode = podeRef.current;
    const t = temasDoPerfil(perfil);
    const temVendas = t.has('ventas') || t.has('metaVendas');
    const hoje = hojeISO();
    const ontem = ontemISO();

    const gates = {
      arrecOntem: t.has('carga'),
      vendaStatusOntem: t.has('carga'),
      painelOntem: temVendas || pode('PAINEL_VENDAS_VISUALIZAR'),
      painelHoje: temVendas,
      statusVendasHoje: temVendas || pode('IMPORTACOES'),
      insumos: t.has('insumos') || pode('INSUMOS'),
      atencao: t.has('indicadores') || pode('INDICADORES_VISUALIZAR'),
      ckAb: t.has('checklist') || pode('CHECKLIST'),
      ckFe: t.has('checklist') || pode('CHECKLIST'),
      opDia:
        t.has('faltas') || t.has('cobertura') || pode('OPERADORES_AUSENCIAS'),
      arrecHoje: pode('IMPORTACOES'),
      vendaStatusHoje: temVendas || pode('IMPORTACOES'),
    };

    // Campos com gate aberto começam "carregando"; os fechados já ficam prontos
    // (com valor neutro), então nunca mostram esqueleto à toa.
    setEstado({
      arrecOntem: campo(null, gates.arrecOntem),
      vendaStatusOntem: campo(null, gates.vendaStatusOntem),
      painelOntem: campo(null, gates.painelOntem),
      painelHoje: campo(null, gates.painelHoje),
      statusVendasHoje: campo(null, gates.statusVendasHoje),
      insumos: campo([], gates.insumos),
      atencao: campo(null, gates.atencao),
      ckAb: campo(null, gates.ckAb),
      ckFe: campo(null, gates.ckFe),
      opDia: campo(null, gates.opDia),
      arrecHoje: campo(null, gates.arrecHoje),
      vendaStatusHoje: campo(null, gates.vendaStatusHoje),
    });

    if (gates.arrecOntem) {
      void buscarArrecStatus(ontem).then((v) => {
        if (vivo) setEstado((s) => ({ ...s, arrecOntem: campo(v, false) }));
      });
    }
    if (gates.vendaStatusOntem) {
      void buscarVendaStatus(ontem).then((v) => {
        if (vivo) {
          setEstado((s) => ({ ...s, vendaStatusOntem: campo(v, false) }));
        }
      });
    }
    if (gates.painelOntem) {
      void buscarPainelResumo(ontem).then((v) => {
        if (vivo) setEstado((s) => ({ ...s, painelOntem: campo(v, false) }));
      });
    }
    if (gates.painelHoje) {
      void buscarPainelResumo(hoje).then((v) => {
        if (vivo) setEstado((s) => ({ ...s, painelHoje: campo(v, false) }));
      });
    }
    if (gates.statusVendasHoje) {
      void buscarVendaStatus(hoje).then((v) => {
        if (vivo) {
          setEstado((s) => ({ ...s, statusVendasHoje: campo(v, false) }));
        }
      });
    }
    if (gates.insumos) {
      void buscarInsumos().then((v) => {
        if (vivo) setEstado((s) => ({ ...s, insumos: campo(v, false) }));
      });
    }
    if (gates.atencao) {
      void buscarAtencao(hoje).then((v) => {
        if (vivo) setEstado((s) => ({ ...s, atencao: campo(v, false) }));
      });
    }
    if (gates.ckAb) {
      void buscarChecklist('ABERTURA', hoje).then((v) => {
        if (vivo) setEstado((s) => ({ ...s, ckAb: campo(v, false) }));
      });
    }
    if (gates.ckFe) {
      void buscarChecklist('FECHAMENTO', hoje).then((v) => {
        if (vivo) setEstado((s) => ({ ...s, ckFe: campo(v, false) }));
      });
    }
    if (gates.opDia) {
      void buscarOperadoresDia(hoje).then((v) => {
        if (vivo) setEstado((s) => ({ ...s, opDia: campo(v, false) }));
      });
    }
    if (gates.arrecHoje) {
      void buscarArrecStatus(hoje).then((v) => {
        if (vivo) setEstado((s) => ({ ...s, arrecHoje: campo(v, false) }));
      });
    }
    if (gates.vendaStatusHoje) {
      void buscarVendaStatus(hoje).then((v) => {
        if (vivo) {
          setEstado((s) => ({ ...s, vendaStatusHoje: campo(v, false) }));
        }
      });
    }

    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil, nonce]);

  const recarregar = React.useCallback(() => {
    limparCacheDadosDoDia();
    setNonce((n) => n + 1);
  }, []);

  const pendenciasPorModulo = calcularPendencias(
    {
      arrecHoje: estado.arrecHoje.dado,
      vendaStatusHoje: estado.vendaStatusHoje.dado,
      painelOntem: estado.painelOntem.dado,
      insumos: estado.insumos.dado,
      atencao: estado.atencao.dado,
      ckAb: estado.ckAb.dado,
      ckFe: estado.ckFe.dado,
      opDia: estado.opDia.dado,
    },
    podeAcessar,
  );
  const totalPendencias = Object.values(pendenciasPorModulo).reduce(
    (soma, n) => soma + n,
    0,
  );

  const campos: CamposHome = {
    arrecOntem: estado.arrecOntem,
    vendaStatusOntem: estado.vendaStatusOntem,
    painelOntem: estado.painelOntem,
    painelHoje: estado.painelHoje,
    statusVendasHoje: estado.statusVendasHoje,
    insumos: estado.insumos,
    atencao: estado.atencao,
    ckAb: estado.ckAb,
    ckFe: estado.ckFe,
    opDia: estado.opDia,
  };

  return { campos, pendenciasPorModulo, totalPendencias, recarregar };
}
