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


// ---------------------------------------------------------------------------
// O TETO DE SACOLAS — o indicador lido de trás para frente
//
// A intenção do dono do projeto: "no final do mês, não desperdiçar sacolas e
// vender o que diz a meta, ou mais, por sacola". Isso muda a pergunta útil.
//
// Enquanto o mês corre, saber que o indicador está em R$ 22 não diz o que fazer.
// O que diz é a conta invertida:
//
//     indicador = venda ÷ sacolas ≥ meta     ⟺     sacolas ≤ venda ÷ meta
//
// Ou seja: **existe um teto de sacolas** que o mês suporta sem furar a meta. Com
// R$ 3.000.000 esperados e meta de R$ 28, o teto é 107.142 sacolas (107 fardos).
// Se 100 fardos já entraram, ainda cabem 7.
//
// Isto transforma o indicador de um boletim (que só se lê no fim) numa **régua
// de compra** (que serve durante o mês).
//
// ⚠️ **A direção é contraintuitiva e precisa estar escrita na tela:** receber
// MENOS sacolas MELHORA o indicador. Isso nunca deve ser lido como "compre
// menos" — a loja precisa de sacolas para operar. O teto é uma **linha de
// aviso**: passar dela significa que, com a venda esperada, o mês fecha abaixo
// da meta. A saída pode ser vender mais, e não necessariamente comprar menos.
// ---------------------------------------------------------------------------

/** De onde veio a venda esperada do mês. */
export type FonteVendaEsperada = 'ESTIMATIVA' | 'RUN_RATE' | 'REALIZADO';

/** Venda que se espera para o mês inteiro, e o quanto dela já é fato. */
export interface VendaEsperadaMes {
  valor: number;
  fonte: FonteVendaEsperada;
  /** Quanto do valor já foi realizado (0..1). 1 = mês fechado. */
  fracaoRealizada: number;
  realizado: number;
}

/**
 * Venda esperada do mês: **fato para o passado, previsão para o futuro**.
 *
 * Ordem de confiança:
 * 1. `ESTIMATIVA` — realizado até hoje **mais** as estimativas dos dias que
 *    faltam. É a melhor: usa fatos onde há fatos e a previsão da própria gestão
 *    onde ainda não há. As estimativas diárias já existem (Central de Vendas) e
 *    são o número que o dono do projeto pediu para considerar.
 * 2. `RUN_RATE` — sem estimativas para os dias que faltam, cai na projeção por
 *    ritmo (`projecaoFechamento` do painel de vendas).
 * 3. `REALIZADO` — mês fechado, ou sem nada em que se apoiar: vale o que
 *    aconteceu.
 *
 * `fracaoRealizada` existe porque o teto calculado no dia 2 é quase todo
 * previsão e no dia 30 é quase todo fato — e a tela precisa dizer isso, ou o
 * gestor confia num número frágil como se fosse certo.
 */
export function vendaEsperadaDoMes(
  realizado: number,
  estimativasFuturas: readonly number[],
  projecaoRunRate: number,
): VendaEsperadaMes {
  const real = Number.isFinite(realizado) && realizado > 0 ? realizado : 0;
  const somaFuturas = estimativasFuturas
    .filter((v) => Number.isFinite(v) && v > 0)
    .reduce((s, v) => s + v, 0);

  let valor = real;
  let fonte: FonteVendaEsperada = 'REALIZADO';
  if (somaFuturas > 0) {
    valor = arredondar(real + somaFuturas);
    fonte = 'ESTIMATIVA';
  } else if (Number.isFinite(projecaoRunRate) && projecaoRunRate > real) {
    valor = arredondar(projecaoRunRate);
    fonte = 'RUN_RATE';
  }

  return {
    valor,
    fonte,
    fracaoRealizada: valor > 0 ? Math.min(1, arredondar(real / valor)) : 0,
    realizado: real,
  };
}

/** O teto e o que ele significa para o mês em curso. */
export interface TetoSacolas {
  /** Máximo de sacolas que o mês suporta sem furar a meta. */
  tetoSacolas: number;
  /** O mesmo teto em fardos (arredondado para BAIXO — 107,9 fardos é 107). */
  tetoFardos: number;
  /** Quantas sacolas ainda cabem. Zero quando o teto já foi passado. */
  podemEntrarSacolas: number;
  podemEntrarFardos: number;
  /** true quando já entrou mais do que o teto. */
  tetoEstourado: boolean;
  /**
   * Venda que o mês precisaria alcançar para as sacolas JÁ recebidas ficarem
   * dentro da meta. É a pergunta espelho, e a saída que não passa por comprar
   * menos: vender mais.
   */
  vendaNecessaria: number;
  /** Quanto falta de venda para chegar lá. Zero quando já está dentro. */
  vendaFaltante: number;
}

/**
 * Calcula o teto de sacolas do mês.
 *
 * O teto em **fardos é truncado para baixo** de propósito: com teto de 107.142
 * sacolas e fardos de 1.000, o 108º fardo furaria a meta. Arredondar para cima
 * daria um número que não se pode usar.
 */
export function calcularTeto(
  vendaEsperada: number,
  sacolasRecebidas: number,
  meta: number,
  fatorEmbalagem: number,
): TetoSacolas | null {
  if (!Number.isFinite(meta) || meta <= 0) return null;
  if (!Number.isFinite(vendaEsperada) || vendaEsperada <= 0) return null;
  const fator = Number.isFinite(fatorEmbalagem) && fatorEmbalagem > 0 ? fatorEmbalagem : 1;

  const tetoSacolas = Math.floor(vendaEsperada / meta);
  const recebidas = Math.max(0, sacolasRecebidas);
  const restam = Math.max(0, tetoSacolas - recebidas);
  const vendaNecessaria = arredondar(recebidas * meta);

  return {
    tetoSacolas,
    tetoFardos: Math.floor(tetoSacolas / fator),
    podemEntrarSacolas: restam,
    podemEntrarFardos: Math.floor(restam / fator),
    tetoEstourado: recebidas > tetoSacolas,
    vendaNecessaria,
    vendaFaltante: Math.max(0, arredondar(vendaNecessaria - vendaEsperada)),
  };
}

/**
 * Onde o mês vai fechar, se nada mudar.
 *
 * `sacolasPrevistas` é informado por quem chama (e não deduzido aqui) porque
 * depende de uma **suposição** — quantas entregas ainda cabem no mês, pelo ciclo
 * quinzenal — e uma suposição precisa estar visível no ponto onde é feita, não
 * escondida numa função pura.
 */
export function projecaoDoFechamento(
  vendaEsperada: number,
  sacolasRecebidas: number,
  sacolasPrevistas: number,
  meta: number,
): { valor: number | null; cumprira: boolean | null; sacolasNoFechamento: number } {
  const sacolasNoFechamento =
    Math.max(0, sacolasRecebidas) + Math.max(0, sacolasPrevistas);
  if (sacolasNoFechamento <= 0 || vendaEsperada <= 0 || meta <= 0) {
    return { valor: null, cumprira: null, sacolasNoFechamento };
  }
  const valor = arredondar(vendaEsperada / sacolasNoFechamento);
  return { valor, cumprira: valor >= meta, sacolasNoFechamento };
}

/**
 * Compara o indicador oficial (pela ENTRADA) com o uso real (pelo CONSUMO).
 *
 * ## Por que os dois números existem
 *
 * O indicador oficial mede pela entrada, porque a entrada é auditável. Mas o
 * estoque é um **amortecedor**: num mês a loja pode receber 200 fardos e usar
 * 150. Nesse mês o indicador oficial parece pior do que o uso real — e a
 * diferença não é desperdício, é **estoque que subiu** (e que vai aparecer como
 * indicador melhor no mês seguinte, quando receber menos).
 *
 * Distinguir as duas coisas é exatamente o que a intenção do dono do projeto
 * exige: *não desperdiçar sacolas*. Desperdício aparece no **consumo** alto em
 * relação à venda; acúmulo aparece na **entrada** alta em relação ao consumo.
 * Sem os dois lado a lado, um mês de reposição maior seria lido como desperdício.
 */
export interface ConsumoVsEntrada {
  sacolasRecebidas: number;
  sacolasConsumidas: number;
  /** Recebidas − consumidas. Positivo = estoque subiu no mês. */
  variacaoEstoque: number;
  /** Indicador oficial (venda ÷ recebidas). */
  porEntrada: number | null;
  /** Referência de uso real (venda ÷ consumidas). */
  porConsumo: number | null;
  /** Frase que explica a diferença, ou `null` quando não há diferença relevante. */
  leitura: string | null;
}

/** Diferença mínima (em fardos) para valer a pena comentar o desvio. */
export const FARDOS_DIFERENCA_RELEVANTE = 5;

export function compararConsumoEntrada(
  vendaMes: number,
  sacolasRecebidas: number,
  sacolasConsumidas: number,
  fatorEmbalagem: number,
): ConsumoVsEntrada {
  const fator = fatorEmbalagem > 0 ? fatorEmbalagem : 1;
  const porEntrada = vendaPorSacola(vendaMes, sacolasRecebidas);
  const porConsumo = vendaPorSacola(vendaMes, sacolasConsumidas);
  const variacaoEstoque = sacolasRecebidas - sacolasConsumidas;
  const diferencaFardos = Math.abs(variacaoEstoque) / fator;

  let leitura: string | null = null;
  if (
    porEntrada != null &&
    porConsumo != null &&
    diferencaFardos >= FARDOS_DIFERENCA_RELEVANTE
  ) {
    const fardos = Math.round(diferencaFardos);
    leitura =
      variacaoEstoque > 0
        ? `Entraram ${fardos} fardos mais do que se usou: o estoque subiu. ` +
          `O indicador oficial (${reaisPorSacola(porEntrada)}) fica abaixo do uso ` +
          `real (${reaisPorSacola(porConsumo)}) — não é desperdício, é reposição.`
        : `Usou-se ${fardos} fardos mais do que entrou: o estoque caiu. ` +
          `O indicador oficial (${reaisPorSacola(porEntrada)}) fica acima do uso ` +
          `real (${reaisPorSacola(porConsumo)}) — o mês consumiu estoque antigo.`;
  }

  return {
    sacolasRecebidas,
    sacolasConsumidas,
    variacaoEstoque,
    porEntrada,
    porConsumo,
    leitura,
  };
}
