/**
 * Fila de correção das marcações inválidas (lógica pura, sem I/O).
 *
 * O relatório de marcações inválidas e o Relógio Ponto precisam concordar sobre
 * duas coisas: **quais** itens estão em jogo (os filtros que o gestor aplicou na
 * lista) e em **que ordem** eles são atacados. Se cada tela decidisse por conta,
 * o botão "próxima pendência" levaria a um item que a lista nem estava
 * mostrando — e o gestor perderia a referência do trabalho que estava fazendo.
 *
 * A decisão de **quais marcações faltam** continua sendo do servidor; aqui só se
 * filtra, ordena e caminha pela fila.
 */
import type {
  MarcacaoCanonica,
  MarcacaoInvalidaItem,
} from '../../api/services/centralJornada';

/** Filtros da lista de trabalho: busca por pessoa + marcação que falta. */
export interface FiltrosFila {
  /** Trecho do nome da pessoa; vazio ou ausente não filtra. */
  nome?: string;
  /** Marcação que falta; ausente não filtra (equivale a "Todas"). */
  tipo?: MarcacaoCanonica;
}

/** Identidade mínima de um item, para comparar posições na fila. */
export interface PosicaoFila {
  colaboradorId: string;
  data: string;
  nome: string;
}

/**
 * Só o dia (`yyyy-mm-dd`).
 *
 * O relatório manda a data como ISO do início do dia e o Relógio Ponto trabalha
 * em `yyyy-mm-dd`; comparar as duas formas cruas faria o mesmo dia parecer dois.
 */
function dia(data: string): string {
  return data.slice(0, 10);
}

/**
 * Identidade de um item da fila.
 *
 * O relatório é **derivado** do ciclo e não tem id próprio: a chave natural é a
 * pessoa somada ao dia.
 */
export function chaveFila(item: {
  colaboradorId: string;
  data: string;
}): string {
  return `${item.colaboradorId}-${dia(item.data)}`;
}

/** Aplica os filtros da lista de trabalho (mesma semântica nas duas telas). */
export function filtrarFila(
  itens: MarcacaoInvalidaItem[],
  filtros: FiltrosFila = {},
): MarcacaoInvalidaItem[] {
  const alvo = (filtros.nome ?? '').trim().toLowerCase();
  const tipo = filtros.tipo;
  return itens.filter((i) => {
    const casaNome = alvo ? i.nome.toLowerCase().includes(alvo) : true;
    const casaTipo = tipo ? i.tiposFaltantes.includes(tipo) : true;
    return casaNome && casaTipo;
  });
}

/**
 * Ordem de trabalho: dia mais recente primeiro e, dentro do dia, as pessoas em
 * ordem alfabética — a mesma ordem em que a lista agrupa os dias, para que
 * "próxima" seja o item logo abaixo do que o gestor acabou de resolver.
 */
export function ordenarFila(
  itens: MarcacaoInvalidaItem[],
): MarcacaoInvalidaItem[] {
  return itens
    .slice()
    .sort(
      (a, b) =>
        dia(b.data).localeCompare(dia(a.data)) || a.nome.localeCompare(b.nome),
    );
}

/** `true` quando `item` vem depois de `referencia` na ordem de trabalho. */
function vemDepois(item: PosicaoFila, referencia: PosicaoFila): boolean {
  if (dia(item.data) !== dia(referencia.data)) {
    return dia(item.data) < dia(referencia.data);
  }
  return item.nome.localeCompare(referencia.nome) > 0;
}

/**
 * O que ajustar depois de mexer no item `atual`.
 *
 * Regras, em ordem:
 *  1. Se o **próprio** item continua na lista, ele é devolvido de novo: um dia
 *     com duas marcações faltando não se resolve com uma batida, e mandar o
 *     gestor para outra pessoa deixaria o dia pela metade.
 *  2. Senão, anda para o item seguinte na ordem de trabalho.
 *  3. Se não houver seguinte, volta ao topo da fila — assim nada fica para trás
 *     quando o gestor começou pelo meio da lista. Como cada item resolvido sai
 *     do relatório, a volta ao topo não gera laço infinito.
 *
 * Devolve `null` quando não há mais nada a ajustar (fim do trabalho).
 */
export function proximaPendencia(
  itens: MarcacaoInvalidaItem[],
  filtros: FiltrosFila,
  atual: PosicaoFila,
): MarcacaoInvalidaItem | null {
  const fila = ordenarFila(filtrarFila(itens, filtros));
  const chaveAtual = chaveFila(atual);
  const mesmoItem = fila.find((i) => chaveFila(i) === chaveAtual);
  if (mesmoItem) return mesmoItem;
  return fila.find((i) => vemDepois(i, atual)) ?? fila[0] ?? null;
}
