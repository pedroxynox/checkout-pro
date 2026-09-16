/**
 * Lógica pura do indicador **SACOLAS** — quanto a loja vende, em R$, por sacola
 * que **entra** no estoque (ADR 0022).
 *
 * ## A conta
 *
 * ```
 *   indicador = venda do mês (R$) ÷ sacolas que entraram no mês
 * ```
 *
 * Com 200 fardos (200.000 sacolas) e R$ 3.000.000 de venda: **R$ 15,00 por
 * sacola**. `MAIOR_MELHOR` com a meta como **piso**: vender mais por sacola
 * significa usar menos sacolas para o mesmo faturamento. Passar da meta nunca é
 * problema; o lado ruim é ficar abaixo dela.
 *
 * ## Por que a ENTRADA, e não o consumo
 *
 * A entrada é **um evento único e auditável**: a mercadoria chega e alguém
 * registra "200 fardos". O consumo depende de cada fiscal lançar cada saída,
 * todos os dias — e qualquer lançamento esquecido reduz o denominador,
 * **melhorando** o indicador artificialmente. Medir pela entrada é medir pelo que
 * a loja comprovadamente pagou.
 *
 * ## O que este indicador NÃO consegue ser
 *
 * **Não existe versão diária.** As sacolas entram em lote (um caminhão traz
 * 200 fardos de uma vez) enquanto as vendas acontecem todos os dias: no dia da
 * entrega o denominador é 200.000 e em todos os outros é **zero**. Por isso o
 * período mínimo é o mês, e mesmo o mês precisa das defesas abaixo
 * (`EstadoIndicadorSacolas` e a contagem de entregas).
 *
 * Sem efeitos colaterais — testável sem banco.
 */
import { arredondar } from '../common/numeros';
import {
  EvolucaoMes,
  NivelIndicador,
  SentidoIndicador,
  cumpriuMeta,
  evolucaoDoMes,
  nivelDoMes,
  variacaoMensal,
} from '../arrecadacao/historico-indicadores.domain';

/**
 * Origens de entrada que **não** contam no denominador.
 *
 * `ESTOQUE_INICIAL` são as sacolas lançadas na implantação do sistema (migração
 * `9i_estoque_inicial` e `prisma/seed.ts`): 200.000 unidades que **nunca foram
 * uma compra** — é o saldo de abertura. Somá-las daria ao mês da implantação um
 * lote inteiro que não existiu como entrega, cortando o indicador pela metade.
 * E seria um erro invisível: o número resultante é plausível.
 */
export const ORIGENS_FORA_DO_INDICADOR: readonly string[] = ['ESTOQUE_INICIAL'];

/**
 * O indicador de sacolas é sempre "maior é melhor" (a meta é um piso).
 *
 * Tipado como o literal, e não como `SentidoIndicador`, para o compilador
 * garantir que ninguém o afrouxe: se este indicador virar "menor é melhor" por
 * engano, o semáforo passa a premiar o desperdício.
 */
export const SENTIDO_SACOLAS = 'MAIOR_MELHOR' as const satisfies SentidoIndicador;

/**
 * Por que o indicador do mês pode não existir.
 *
 * - `OK` — dá para calcular.
 * - `SEM_ENTRADA` — nenhuma sacola entrou no mês. **Não é zero**: é o caminhão
 *   que não veio. Mostrar "R$ 0,00 por sacola" diria "catástrofe" onde a verdade
 *   é "não houve entrega neste mês".
 * - `SEM_VENDA` — entraram sacolas mas não há venda registrada. Quase sempre
 *   significa que os arquivos de venda do mês ainda não foram enviados, não que
 *   a loja não vendeu.
 */
export type EstadoIndicadorSacolas = 'OK' | 'SEM_ENTRADA' | 'SEM_VENDA';

/** Estado do indicador a partir dos dois ingredientes. */
export function estadoDoIndicador(
  vendaMes: number,
  sacolasRecebidas: number,
): EstadoIndicadorSacolas {
  if (!Number.isFinite(sacolasRecebidas) || sacolasRecebidas <= 0) {
    return 'SEM_ENTRADA';
  }
  if (!Number.isFinite(vendaMes) || vendaMes <= 0) return 'SEM_VENDA';
  return 'OK';
}

/**
 * Venda em R$ por sacola recebida, ou `null` quando não há o que calcular.
 *
 * Devolve `null` (e não 0) sempre que um dos dois lados falta: um zero seria
 * indistinguível de um mês realmente ruim, e é justamente a distinção que o
 * gestor precisa fazer.
 */
export function vendaPorSacola(
  vendaMes: number,
  sacolasRecebidas: number,
): number | null {
  if (estadoDoIndicador(vendaMes, sacolasRecebidas) !== 'OK') return null;
  return arredondar(vendaMes / sacolasRecebidas);
}

/** Sacolas convertidas em fardos, para exibição (1 fardo = `fator` sacolas). */
export function emFardos(sacolas: number, fatorEmbalagem: number): number {
  if (!Number.isFinite(fatorEmbalagem) || fatorEmbalagem <= 0) return 0;
  return Math.round(sacolas / fatorEmbalagem);
}

/** Distância até a meta, com sinal. */
export interface DesvioMeta {
  /** `valor − meta`. Positivo = acima do piso. */
  absoluto: number;
  /** O mesmo desvio em % da meta. */
  percentual: number;
  /** true quando está no piso ou acima dele. */
  noPiso: boolean;
}

/**
 * Desvio do valor em relação à meta.
 *
 * O desvio **acompanha sempre** o indicador na tela, e não só a cor do semáforo:
 * foi a forma pedida pelo dono do projeto ("a meta como referência, com 28 de
 * piso"). Ver R$ 34,00 é uma informação; ver "+R$ 6,00 acima da meta" é uma
 * conclusão.
 */
export function desvioDaMeta(
  valor: number | null,
  meta: number,
): DesvioMeta | null {
  if (valor == null || !Number.isFinite(meta) || meta <= 0) return null;
  const absoluto = arredondar(valor - meta);
  return {
    absoluto,
    percentual: arredondar((absoluto / meta) * 100),
    noPiso: valor >= meta,
  };
}

/** Avaliação de um mês do indicador. */
export interface AvaliacaoSacolas {
  /** R$ por sacola, ou `null` quando não dá para calcular. */
  valor: number | null;
  estado: EstadoIndicadorSacolas;
  meta: number;
  nivel: NivelIndicador | null;
  cumpriu: boolean | null;
  desvio: DesvioMeta | null;
}

/**
 * Avalia um mês: valor, estado, semáforo e desvio.
 *
 * O semáforo vem de `nivelDoMes`, a **fonte única** da regra, chamada com
 * `MAIOR_MELHOR`. É exatamente por causa deste indicador que aquela função passou
 * a decidir pelo sentido e não pela base (ADR 0022, item 3): com a regra antiga,
 * R$ 22,00 por sacola sairia **verde** — o mês de maior desperdício seria
 * premiado.
 *
 * Sem valor não há semáforo: `nivel` e `cumpriu` ficam `null`, porque pintar de
 * vermelho um mês sem entrega seria acusar a loja de algo que não aconteceu.
 */
export function avaliarMes(
  vendaMes: number,
  sacolasRecebidas: number,
  meta: number,
): AvaliacaoSacolas {
  const estado = estadoDoIndicador(vendaMes, sacolasRecebidas);
  const valor = vendaPorSacola(vendaMes, sacolasRecebidas);
  if (valor == null || meta <= 0) {
    return { valor, estado, meta, nivel: null, cumpriu: null, desvio: null };
  }
  return {
    valor,
    estado,
    meta,
    nivel: nivelDoMes(SENTIDO_SACOLAS, valor, meta),
    cumpriu: cumpriuMeta(SENTIDO_SACOLAS, valor, meta),
    desvio: desvioDaMeta(valor, meta),
  };
}

/** Comparação com o mês anterior, já lida pelo sentido do indicador. */
export interface ComparacaoSacolas {
  valorAnterior: number | null;
  variacao: number | null;
  evolucao: EvolucaoMes | null;
}

/**
 * Compara com o mês anterior. Reaproveita `variacaoMensal`/`evolucaoDoMes` — as
 * mesmas funções que os outros indicadores usam, para "melhorou" significar a
 * mesma coisa em todas as telas.
 */
export function compararComAnterior(
  valorAtual: number | null,
  valorAnterior: number | null,
): ComparacaoSacolas {
  if (valorAtual == null || valorAnterior == null) {
    return { valorAnterior, variacao: null, evolucao: null };
  }
  const variacao = variacaoMensal(valorAtual, valorAnterior);
  return {
    valorAnterior,
    variacao,
    evolucao: evolucaoDoMes(SENTIDO_SACOLAS, variacao),
  };
}

/**
 * Aviso sobre a quantidade de entregas do mês, ou `null` quando não há o que
 * dizer.
 *
 * É a defesa contra o efeito de calendário: as sacolas seguem um ciclo
 * **quinzenal**, então o mês típico recebe 2 entregas. Um mês com 1 entrega
 * infla o indicador e um mês com 3 o derruba — **sem que nada tenha mudado na
 * operação**, só porque o caminhão atravessou a virada do mês. Dizer isso na
 * tela é a diferença entre um número que se entende e um número em que não se
 * confia.
 */
export function avisoDeEntregas(entregas: number): string | null {
  if (entregas <= 0) return null;
  if (entregas === 1) {
    return (
      'Só 1 entrega neste mês (o normal são 2, pelo ciclo quinzenal). ' +
      'O indicador tende a ficar mais alto do que a operação real.'
    );
  }
  if (entregas >= 3) {
    return (
      `${entregas} entregas neste mês (o normal são 2). O indicador cai por ` +
      'causa disso, não necessariamente por desperdício.'
    );
  }
  return null;
}

/** "R$ 15,00" com vírgula decimal (pt-BR), para as frases do indicador. */
export function reaisPorSacola(valor: number): string {
  return `R$ ${valor.toFixed(2).replace('.', ',')}`;
}

/**
 * Frase que resume o mês, pronta para a tela e para o resumo diário.
 *
 * A frase mora aqui — e não na tela — para o app, o aviso diário e um relatório
 * futuro dizerem exatamente a mesma coisa sobre o mesmo mês.
 */
export function textoDoMes(
  avaliacao: AvaliacaoSacolas,
  sacolasRecebidas: number,
  fardosRecebidos: number,
): string {
  if (avaliacao.estado === 'SEM_ENTRADA') {
    return 'Nenhuma sacola entrou no estoque neste mês — sem entrega, não há o que calcular.';
  }
  if (avaliacao.estado === 'SEM_VENDA') {
    return (
      `Entraram ${fardosRecebidos} fardos (${sacolasRecebidas} sacolas), mas ` +
      'não há venda registrada no mês. Envie os arquivos de venda para o ' +
      'indicador fechar.'
    );
  }
  const valor = avaliacao.valor as number;
  const base =
    `${reaisPorSacola(valor)} de venda por sacola — ` +
    `${fardosRecebidos} fardos (${sacolasRecebidas} sacolas) recebidos no mês.`;
  if (!avaliacao.desvio) return base;
  const { absoluto, noPiso } = avaliacao.desvio;
  const distancia = reaisPorSacola(Math.abs(absoluto));
  return noPiso
    ? `${base} Está ${distancia} acima da meta de ${reaisPorSacola(avaliacao.meta)}.`
    : `${base} Está ${distancia} abaixo da meta de ${reaisPorSacola(avaliacao.meta)}.`;
}
