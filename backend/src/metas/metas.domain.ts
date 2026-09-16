/**
 * Domínio das Metas mensais (Centro de Controle ▸ Metas).
 *
 * Define os indicadores cuja meta é acompanhada **por mês** (período mensal):
 *  - VENDAS: faturamento alvo do mês (R$). **Meta derivada** — não se digita:
 *    é a soma das estimativas diárias do mês (Central de Vendas). Ver
 *    `ehMetaDerivada` e a ADR 0017.
 *  - RECARGAS_CELULAR: arrecadação de recargas no mês (R$).
 *  - CANCELAMENTO_ITENS / CANCELAMENTO_CUPOM / DEVOLUCOES: limite em % sobre as
 *    vendas (menor é melhor).
 *  - SACOLAS: quanto a loja vende, em R$, por sacola que ENTRA no estoque
 *    (maior é melhor). É a primeira meta de **razão** do sistema — nem um valor
 *    absoluto nem um percentual sobre as vendas. Ver a ADR 0022.
 *
 * As quatro metas que não são VENDAS seguem **digitadas** pelo gestor, com
 * valor padrão quando o mês ainda não foi definido.
 *
 * Observação: TROCO_SOLIDARIO NÃO é gerido aqui (segue com a meta global de
 * MetaIndicador/CONFIG_ARRECADACAO).
 */
import { arredondar } from '../common/numeros';

/** Tipos de meta configuráveis por mês. */
export const TIPOS_META = [
  'VENDAS',
  'RECARGAS_CELULAR',
  'CANCELAMENTO_ITENS',
  'CANCELAMENTO_CUPOM',
  'DEVOLUCOES',
  'SACOLAS',
] as const;

export type TipoMeta = (typeof TIPOS_META)[number];

/**
 * Unidade do valor da meta.
 *
 * `REAIS_POR_UNIDADE` é uma **razão** (R$ por sacola, por bobina, por metro…) e
 * existe porque nem `REAIS` nem `PERCENTUAL` a descrevem: um valor absoluto
 * responde "quanto arrecadou", um percentual responde "que fatia das vendas", e
 * uma razão responde "quanto de venda cada unidade sustenta". Sem unidade própria
 * a tela de Metas escreveria "28,00%" onde o certo é "R$ 28,00 por sacola".
 */
export type UnidadeMeta = 'REAIS' | 'PERCENTUAL' | 'REAIS_POR_UNIDADE';

/** Configuração (rótulo, unidade, sentido e valor padrão) de cada meta. */
export interface ConfigMeta {
  tipo: TipoMeta;
  titulo: string;
  unidade: UnidadeMeta;
  /** MAIOR_MELHOR (arrecadar mais) ou MENOR_MELHOR (cancelar/devolver menos). */
  sentido: 'MAIOR_MELHOR' | 'MENOR_MELHOR';
  /** Valor padrão usado quando não há meta definida para o mês. */
  valorPadrao: number;
}

export const CONFIG_METAS: Record<TipoMeta, ConfigMeta> = {
  VENDAS: {
    tipo: 'VENDAS',
    titulo: 'Vendas',
    unidade: 'REAIS',
    sentido: 'MAIOR_MELHOR',
    // Não é um padrão digitável: a meta de VENDAS é derivada das estimativas
    // diárias. 0 significa "mês sem estimativas cadastradas".
    valorPadrao: 0,
  },
  RECARGAS_CELULAR: {
    tipo: 'RECARGAS_CELULAR',
    titulo: 'Recarga de Celular',
    unidade: 'REAIS',
    sentido: 'MAIOR_MELHOR',
    valorPadrao: 2000,
  },
  CANCELAMENTO_ITENS: {
    tipo: 'CANCELAMENTO_ITENS',
    titulo: 'Cancelamento de Itens',
    unidade: 'PERCENTUAL',
    sentido: 'MENOR_MELHOR',
    valorPadrao: 0.75,
  },
  CANCELAMENTO_CUPOM: {
    tipo: 'CANCELAMENTO_CUPOM',
    titulo: 'Cancelamento de Cupom',
    unidade: 'PERCENTUAL',
    sentido: 'MENOR_MELHOR',
    valorPadrao: 0.5,
  },
  DEVOLUCOES: {
    tipo: 'DEVOLUCOES',
    titulo: 'Devoluções',
    unidade: 'PERCENTUAL',
    sentido: 'MENOR_MELHOR',
    valorPadrao: 0.05,
  },
  SACOLAS: {
    tipo: 'SACOLAS',
    titulo: 'Sacolas',
    unidade: 'REAIS_POR_UNIDADE',
    // MAIOR_MELHOR com a meta como PISO: vender mais por sacola significa usar
    // menos sacolas para o mesmo faturamento. Passar da meta nunca é problema —
    // o lado ruim é ficar abaixo dela (desperdício). Ver a ADR 0022, item 9.
    sentido: 'MAIOR_MELHOR',
    valorPadrao: 28,
  },
};

/** Verdadeiro se a string é um tipo de meta válido. */
export function ehTipoMeta(valor: string): valor is TipoMeta {
  return (TIPOS_META as readonly string[]).includes(valor);
}

/**
 * Tipos cuja meta é **derivada** de outro dado do sistema, e portanto não pode
 * ser digitada pelo gestor. Hoje só VENDAS: a meta do mês é a soma das
 * estimativas diárias cadastradas na Central de Vendas.
 */
export const TIPOS_META_DERIVADA: readonly TipoMeta[] = ['VENDAS'];

/**
 * Verdadeiro se a meta do tipo é derivada (calculada) em vez de digitada.
 * Quem edita metas deve tratar estes tipos como somente leitura.
 */
export function ehMetaDerivada(tipo: TipoMeta): boolean {
  return TIPOS_META_DERIVADA.includes(tipo);
}

/** Período mensal válido no formato "AAAA-MM" (ex.: "2026-06"). */
const RE_ANO_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export function ehAnoMesValido(valor: string): boolean {
  return RE_ANO_MES.test(valor);
}

/**
 * Período mensal ("AAAA-MM") da data informada, em UTC (consistente com o
 * restante do sistema, que trata os dias como dia-calendário em UTC).
 */
export function anoMesDe(data: Date): string {
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}

/**
 * Intervalo `[inicio, fim)` que cobre o período mensal, em UTC. `fim` é o
 * primeiro instante do mês seguinte (exclusivo), pronto para um `where` do
 * Prisma. Lança se o período não estiver no formato "AAAA-MM".
 */
export function intervaloDoMes(anoMes: string): { inicio: Date; fim: Date } {
  if (!ehAnoMesValido(anoMes)) {
    throw new RangeError(`Período mensal inválido: "${anoMes}".`);
  }
  const [ano, mes] = anoMes.split('-').map(Number);
  return {
    inicio: new Date(Date.UTC(ano, mes - 1, 1)),
    fim: new Date(Date.UTC(ano, mes, 1)),
  };
}

/**
 * Meta de VENDAS a partir das estimativas diárias do mês: a soma delas,
 * arredondada em 2 casas. Função pura — a leitura no banco fica no serviço.
 *
 * Um mês sem estimativas cadastradas soma 0, que o sistema interpreta como
 * "meta ainda não definida" (o Painel de Vendas mostra só o faturamento e a
 * projeção, sem comparação).
 */
export function metaDeEstimativas(valores: readonly number[]): number {
  const soma = valores.reduce(
    (total, valor) => total + (Number.isFinite(valor) ? valor : 0),
    0,
  );
  return arredondar(soma > 0 ? soma : 0);
}
