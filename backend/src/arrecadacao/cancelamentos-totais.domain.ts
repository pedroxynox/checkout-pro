/**
 * Domínio **puro** do indicador `CANCELAMENTOS_TOTAIS`.
 *
 * O indicador é a soma de **Cancelamento de Itens + Cancelamento de Cupom**
 * sobre as vendas da loja, com meta própria (padrão 0,75%) editável por mês em
 * Centro de Controle ▸ Metas e o mesmo semáforo do Cancelamento de Itens
 * (`MENOR_MELHOR`: dentro da meta = OK, até 1,5× a meta = ATENÇÃO, acima = FORA).
 *
 * ## Por que ele é CALCULADO e não um sexto arquivo
 *
 * Ele **não** entra em `TIPOS_ARRECADACAO`. Aquela lista é o contrato do
 * fechamento do dia: `fechamento.service.ts` só considera o dia completo quando
 * **todos** os tipos dela foram enviados ou marcados como "sem movimento", e
 * `ImportacoesScreen` transforma a lista na sequência numerada de arquivos a
 * carregar. Um tipo novo ali passaria a exigir um arquivo que não existe — o
 * fechamento nunca mais concluiria e o fiscal veria para sempre um passo
 * pendente. O indicador vive então como **derivação** dos dois tipos que já são
 * importados: nenhum arquivo novo, nenhuma mudança de rotina na loja.
 *
 * ## O que este domínio faz além de somar
 *
 * A soma é a parte trivial. O valor da tela está em responder **o que está
 * empurrando o número** e **o que fazer**, e é isso que as funções abaixo
 * calculam de forma determinística: composição (qual das duas partes manda),
 * excedente em R$ (o percentual em dinheiro), concentração (é gente ou é
 * processo?), simulação (o que bastaria resolver para fechar dentro), perfil do
 * dano (muitos pequenos ou poucos grandes), motivos e autorizadores.
 *
 * Sem efeitos colaterais: nem Prisma, nem Nest, nem relógio. Testável.
 */
import { arredondar } from '../common/numeros';
import type { TipoArrecadacao } from './arrecadacao.domain';
import {
  EvolucaoMes,
  NivelIndicador,
  SentidoIndicador,
  cumpriuMeta,
  evolucaoDoMes,
  nivelDoMes,
  variacaoMensal,
} from './historico-indicadores.domain';

/** Identificador do indicador (não é um `TipoArrecadacao` — ver o cabeçalho). */
export const TIPO_CANCELAMENTOS_TOTAIS = 'CANCELAMENTOS_TOTAIS' as const;

/** Título exibido ao usuário. */
export const TITULO_CANCELAMENTOS_TOTAIS = 'Cancelamentos Totais';

/**
 * Os dois tipos importados que compõem o indicador, nesta ordem.
 *
 * Tipado como `TipoArrecadacao[]` de propósito: se um dos nomes for renomeado no
 * domínio da arrecadação, o compilador quebra aqui em vez de o indicador passar
 * a somar silenciosamente um tipo só.
 */
export const TIPOS_DO_TOTAL: readonly TipoArrecadacao[] = [
  'CANCELAMENTO_ITENS',
  'CANCELAMENTO_CUPOM',
];

/**
 * Cancelar menos é sempre melhor: a meta é um **teto**.
 *
 * Tipado como o literal (e não como `SentidoIndicador`) para o compilador
 * impedir que alguém o afrouxe: invertido, o semáforo passaria a premiar o mês
 * que mais cancelou.
 */
export const SENTIDO_CANCELAMENTOS = 'MENOR_MELHOR' as const satisfies SentidoIndicador;

/**
 * Meta padrão: 0,75% das vendas — a mesma do Cancelamento de Itens, por decisão
 * do dono do projeto. É só o **padrão**: o valor de cada mês vive em
 * `metas_mensais` e é editável em Centro de Controle ▸ Metas.
 *
 * Note que ela **não** é a soma das metas das duas partes (0,75 + 0,5 = 1,25):
 * é um teto global independente e mais exigente. A consequência é intencional e
 * precisa estar escrita na tela — as duas partes podem estar verdes e o total,
 * amarelo.
 */
export const META_PADRAO_CANCELAMENTOS_TOTAIS = 0.75;

/**
 * Por que o percentual do mês pode não existir.
 *
 * - `OK` — há venda registrada, dá para dividir.
 * - `SEM_VENDA` — houve cancelamento, mas nenhuma venda no mês. Quase sempre
 *   significa que o arquivo de vendas ainda não foi enviado.
 * - `SEM_MOVIMENTO` — mês sem cancelamento **e** sem venda: não há nada a dizer.
 *
 * Zero cancelamento com venda registrada **não** é um destes estados: é um mês
 * legítimo de 0%, e verde. A distinção importa porque a implementação antiga dos
 * outros indicadores devolve `percentual = 0` quando as vendas são zero, o que
 * pinta de **verde** um mês em que só falta importar o arquivo de vendas. Aqui o
 * valor vem `null` e o mês fica **sem semáforo**, como já faz o indicador de
 * Sacolas (ADR 0022): não afirmar nada é melhor do que afirmar o oposto.
 */
export type EstadoCancelamentos = 'OK' | 'SEM_VENDA' | 'SEM_MOVIMENTO';

/** Estado do indicador a partir dos ingredientes do mês. */
export function estadoDoIndicador(
  vendas: number,
  lancamentos: number,
): EstadoCancelamentos {
  if (Number.isFinite(vendas) && vendas > 0) return 'OK';
  return Number.isFinite(lancamentos) && lancamentos > 0
    ? 'SEM_VENDA'
    : 'SEM_MOVIMENTO';
}

/**
 * Percentual dos cancelamentos sobre as vendas, ou `null` quando não há
 * denominador. Devolve `null` (e não 0) de propósito — ver `EstadoCancelamentos`.
 */
export function percentualSobreVendas(
  total: number,
  vendas: number,
): number | null {
  if (!Number.isFinite(vendas) || vendas <= 0) return null;
  return arredondar((total / vendas) * 100);
}

/** Distância até o teto, com sinal. */
export interface DesvioTeto {
  /** `valor − meta`, em pontos percentuais. Negativo = abaixo do teto (bom). */
  absoluto: number;
  /** O mesmo desvio como % da meta. */
  percentual: number;
  /** true quando está dentro do teto (no limite ou abaixo). */
  dentro: boolean;
}

/**
 * Desvio do percentual em relação à meta.
 *
 * O desvio acompanha **sempre** o valor na tela, como no indicador de Sacolas:
 * ver "1,10%" é informação; ver "+0,35 p.p. acima do teto de 0,75%" é conclusão.
 */
export function desvioDoTeto(
  valor: number | null,
  meta: number,
): DesvioTeto | null {
  if (valor == null || !Number.isFinite(meta) || meta <= 0) return null;
  const absoluto = arredondar(valor - meta);
  return {
    absoluto,
    percentual: arredondar((absoluto / meta) * 100),
    dentro: valor <= meta,
  };
}

/**
 * O teto da meta traduzido em dinheiro: quanto a loja **poderia** cancelar no
 * mês sem furar a meta. `null` sem vendas.
 */
export function limiteEmReais(vendas: number, meta: number): number | null {
  if (!Number.isFinite(vendas) || vendas <= 0) return null;
  if (!Number.isFinite(meta) || meta < 0) return null;
  return arredondar((meta / 100) * vendas);
}

/**
 * Quanto passou do teto, em R$ (0 quando está dentro). É o número mais acionável
 * do indicador: um percentual não se discute numa reunião, R$ 4.200 sim.
 */
export function excedenteEmReais(
  total: number,
  vendas: number,
  meta: number,
): number | null {
  const limite = limiteEmReais(vendas, meta);
  if (limite == null) return null;
  return arredondar(Math.max(0, total - limite));
}

/** Avaliação completa de um mês. */
export interface AvaliacaoCancelamentos {
  /** % sobre as vendas, ou `null` quando não dá para calcular. */
  valor: number | null;
  estado: EstadoCancelamentos;
  meta: number;
  nivel: NivelIndicador | null;
  cumpriu: boolean | null;
  desvio: DesvioTeto | null;
  limiteReais: number | null;
  excedente: number | null;
}

/**
 * Avalia o mês: percentual, estado, semáforo, desvio e o teto em dinheiro.
 *
 * O semáforo sai de `nivelDoMes` — a **fonte única** da regra —, chamada com
 * `MENOR_MELHOR`, exatamente como o Cancelamento de Itens. Nada é recalculado
 * aqui: se o limiar de atenção mudar, muda para os dois juntos.
 *
 * Sem percentual não há semáforo (`nivel`/`cumpriu` em `null`).
 */
export function avaliarMes(
  total: number,
  vendas: number,
  lancamentos: number,
  meta: number,
): AvaliacaoCancelamentos {
  const estado = estadoDoIndicador(vendas, lancamentos);
  const valor = percentualSobreVendas(total, vendas);
  if (valor == null || !Number.isFinite(meta) || meta <= 0) {
    return {
      valor,
      estado,
      meta,
      nivel: null,
      cumpriu: null,
      desvio: null,
      limiteReais: limiteEmReais(vendas, meta),
      excedente: null,
    };
  }
  return {
    valor,
    estado,
    meta,
    nivel: nivelDoMes(SENTIDO_CANCELAMENTOS, valor, meta),
    cumpriu: cumpriuMeta(SENTIDO_CANCELAMENTOS, valor, meta),
    desvio: desvioDoTeto(valor, meta),
    limiteReais: limiteEmReais(vendas, meta),
    excedente: excedenteEmReais(total, vendas, meta),
  };
}

/** Comparação com o mês anterior, já lida pelo sentido do indicador. */
export interface ComparacaoCancelamentos {
  valorAnterior: number | null;
  variacao: number | null;
  evolucao: EvolucaoMes | null;
}

/**
 * Compara com o mês anterior reaproveitando `variacaoMensal`/`evolucaoDoMes`,
 * as mesmas funções dos outros indicadores — para "melhorou" significar a mesma
 * coisa em todas as telas. Aqui, **cair é melhorar**.
 */
export function compararComAnterior(
  valorAtual: number | null,
  valorAnterior: number | null,
): ComparacaoCancelamentos {
  if (valorAtual == null || valorAnterior == null) {
    return { valorAnterior, variacao: null, evolucao: null };
  }
  const variacao = variacaoMensal(valorAtual, valorAnterior);
  return {
    valorAnterior,
    variacao: variacao === null ? null : arredondar(variacao),
    evolucao: evolucaoDoMes(
      SENTIDO_CANCELAMENTOS,
      variacao === null ? null : arredondar(variacao),
    ),
  };
}

/* ----------------------- o que está impactando ---------------------------- */

/**
 * A partir de que fatia uma das duas partes é considerada a **dominante**.
 * Abaixo disso o problema é dos dois lados, e tratar apenas um não resolve.
 */
export const LIMIAR_DOMINANCIA_PCT = 60;

/** Composição do total: quanto vem de cada parte. */
export interface ComposicaoCancelamentos {
  totalItens: number;
  totalCupom: number;
  /** Fatia de cada parte no total (%). Somam 100 quando há total. */
  participacaoItens: number;
  participacaoCupom: number;
  /** % de cada parte sobre as vendas — comparável com a meta do total. */
  percentualItens: number | null;
  percentualCupom: number | null;
  dominante: 'ITENS' | 'CUPOM' | 'EQUILIBRADO';
}

/**
 * Decompõe o total nas duas partes.
 *
 * É a primeira pergunta que o gestor faz e a mais barata de responder: "1,10% =
 * 0,80% de itens + 0,30% de cupom" já indica onde atuar. Um total isolado não
 * aponta para nenhuma ação.
 */
export function composicaoDe(
  totalItens: number,
  totalCupom: number,
  vendas: number,
): ComposicaoCancelamentos {
  const total = totalItens + totalCupom;
  const fatia = (parte: number): number =>
    total > 0 ? arredondar((parte / total) * 100) : 0;
  const participacaoItens = fatia(totalItens);
  const participacaoCupom = fatia(totalCupom);
  let dominante: ComposicaoCancelamentos['dominante'] = 'EQUILIBRADO';
  if (participacaoItens >= LIMIAR_DOMINANCIA_PCT) dominante = 'ITENS';
  else if (participacaoCupom >= LIMIAR_DOMINANCIA_PCT) dominante = 'CUPOM';
  return {
    totalItens: arredondar(totalItens),
    totalCupom: arredondar(totalCupom),
    participacaoItens,
    participacaoCupom,
    percentualItens: percentualSobreVendas(totalItens, vendas),
    percentualCupom: percentualSobreVendas(totalCupom, vendas),
    dominante,
  };
}

/** Uma pessoa no ranking combinado dos dois cancelamentos. */
export interface OfensorCancelamentos {
  nome: string;
  total: number;
  totalItens: number;
  totalCupom: number;
  /** Fatia da pessoa no total do mês (%). */
  participacao: number;
  /** % da pessoa sobre as vendas da loja — na mesma régua da meta. */
  percentualVendas: number | null;
}

/**
 * Funde os rankings dos dois tipos numa lista única, ordenada pelo maior valor.
 *
 * A fusão é por **nome canônico**: os dois rankings vêm de
 * `ArrecadacaoService.ranking`, que já resolve o nome pelo cadastro unificado, e
 * portanto a mesma pessoa chega com exatamente o mesmo nome nos dois. Quem não
 * tem cadastro não aparece em nenhum dos dois (fica em "não reconhecidos"), mas
 * **soma no total** — é a regra já documentada do módulo, e é por isso que a
 * soma das linhas pode ser menor que o total do indicador.
 */
export function fundirOfensores(
  itens: readonly { nome: string; total: number }[],
  cupom: readonly { nome: string; total: number }[],
  vendas: number,
): OfensorCancelamentos[] {
  const mapa = new Map<string, { totalItens: number; totalCupom: number }>();
  const acumular = (
    lista: readonly { nome: string; total: number }[],
    campo: 'totalItens' | 'totalCupom',
  ): void => {
    for (const r of lista) {
      const chave = r.nome.trim();
      if (chave === '') continue;
      const atual = mapa.get(chave) ?? { totalItens: 0, totalCupom: 0 };
      atual[campo] += r.total;
      mapa.set(chave, atual);
    }
  };
  acumular(itens, 'totalItens');
  acumular(cupom, 'totalCupom');

  const totalGeral = [...mapa.values()].reduce(
    (s, v) => s + v.totalItens + v.totalCupom,
    0,
  );
  return [...mapa.entries()]
    .map(([nome, v]) => {
      const total = v.totalItens + v.totalCupom;
      return {
        nome,
        total: arredondar(total),
        totalItens: arredondar(v.totalItens),
        totalCupom: arredondar(v.totalCupom),
        participacao:
          totalGeral > 0 ? arredondar((total / totalGeral) * 100) : 0,
        percentualVendas: percentualSobreVendas(total, vendas),
      };
    })
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
}

/**
 * A partir de que fatia dos três maiores o problema é considerado **concentrado**
 * em pessoas, e não espalhado pelo processo.
 */
export const LIMIAR_CONCENTRACAO_PCT = 50;

/** Quantas pessoas explicam o número. */
export interface ConcentracaoCancelamentos {
  pessoas: number;
  /** Fatia dos três maiores no total das pessoas cadastradas (%). */
  participacaoTop3: number;
  /** Quantas pessoas, somadas de cima para baixo, chegam à metade do valor. */
  pessoasParaMetade: number;
  /** true quando o valor está espalhado — é processo, não caso individual. */
  espalhado: boolean;
}

/**
 * Mede a concentração do valor entre as pessoas.
 *
 * É a distinção que muda a ação do dia seguinte: se três pessoas concentram mais
 * da metade, a conversa é individual; se está espalhado por vinte, é rotina de
 * frente de caixa e cobrar um indivíduo não resolve nada.
 */
export function concentracaoDe(
  ofensores: readonly OfensorCancelamentos[],
): ConcentracaoCancelamentos {
  const total = ofensores.reduce((s, o) => s + o.total, 0);
  const top3 = ofensores.slice(0, 3).reduce((s, o) => s + o.total, 0);
  const participacaoTop3 = total > 0 ? arredondar((top3 / total) * 100) : 0;
  let acumulado = 0;
  let pessoasParaMetade = 0;
  for (const o of ofensores) {
    if (total <= 0 || acumulado >= total / 2) break;
    acumulado += o.total;
    pessoasParaMetade++;
  }
  return {
    pessoas: ofensores.length,
    participacaoTop3,
    pessoasParaMetade,
    espalhado: participacaoTop3 < LIMIAR_CONCENTRACAO_PCT,
  };
}

/** Quantos maiores a simulação retira, por padrão. */
export const SIMULACAO_MAIORES_PADRAO = 3;

/** "E se os maiores fossem resolvidos?" */
export interface SimulacaoCancelamentos {
  quantos: number;
  nomes: string[];
  /** Valor que sairia do total (R$). */
  valorRemovido: number;
  /** Percentual que o mês teria sem eles. */
  percentualSimulado: number;
  /** true se, sem eles, o mês fecharia dentro da meta. */
  ficariaDentro: boolean;
}

/**
 * Simula o mês sem os N maiores ofensores.
 *
 * É a função que transforma o indicador num plano: em vez de dizer "está acima
 * da meta", diz "resolvendo estes três, fecha dentro". Sem isso o gestor sabe
 * que tem um problema mas não sabe onde começar — e o indicador vira relatório.
 *
 * Devolve `null` quando não há como simular (sem vendas ou sem ninguém
 * cadastrado no ranking).
 */
export function simularSemMaiores(
  ofensores: readonly OfensorCancelamentos[],
  total: number,
  vendas: number,
  meta: number,
  quantos: number = SIMULACAO_MAIORES_PADRAO,
): SimulacaoCancelamentos | null {
  if (!Number.isFinite(vendas) || vendas <= 0) return null;
  const alvo = ofensores.slice(0, Math.max(0, Math.floor(quantos)));
  if (alvo.length === 0) return null;
  const valorRemovido = arredondar(alvo.reduce((s, o) => s + o.total, 0));
  const restante = Math.max(0, total - valorRemovido);
  const percentualSimulado = arredondar((restante / vendas) * 100);
  return {
    quantos: alvo.length,
    nomes: alvo.map((o) => o.nome),
    valorRemovido,
    percentualSimulado,
    ficariaDentro: percentualSimulado <= meta,
  };
}

/**
 * Limiares do perfil do dano, em % do valor concentrado nos 10% maiores
 * lançamentos. Numa distribuição uniforme os 10% maiores levariam ~10%; daí
 * "espalhado" ficar em 25% e "concentrado" em 50%.
 */
export const LIMIAR_POUCOS_GRANDES_PCT = 50;
export const LIMIAR_MUITOS_PEQUENOS_PCT = 25;

/** Forma do dano: muitos lançamentos pequenos ou poucos grandes. */
export interface PerfilDanoCancelamentos {
  lancamentos: number;
  /** Valor médio de um lançamento (R$). */
  ticketMedio: number;
  /** Quantos lançamentos formam os "10% maiores" considerados. */
  maioresConsiderados: number;
  /** Fatia do valor que está nesses 10% maiores. */
  participacaoMaiores: number;
  perfil: 'POUCOS_GRANDES' | 'MUITOS_PEQUENOS' | 'MISTO';
}

/**
 * Classifica a forma do dano a partir dos valores individuais.
 *
 * Dois meses com o mesmo total pedem ações opostas: 800 cancelamentos de R$ 12
 * é rotina de frente de caixa (escaneamento, preço na gôndola, treinamento); 6
 * cancelamentos de R$ 1.600 é exceção operacional, que se resolve olhando os
 * seis casos. Como não existe um "ticket normal" de referência no sistema, a
 * classificação não usa número mágico: mede **onde o valor está**, comparando a
 * fatia dos 10% maiores com o que uma distribuição uniforme daria.
 */
export function perfilDoDano(
  valores: readonly number[],
): PerfilDanoCancelamentos {
  const positivos = valores.filter((v) => Number.isFinite(v) && v > 0);
  const lancamentos = positivos.length;
  const total = positivos.reduce((s, v) => s + v, 0);
  if (lancamentos === 0 || total <= 0) {
    return {
      lancamentos: 0,
      ticketMedio: 0,
      maioresConsiderados: 0,
      participacaoMaiores: 0,
      perfil: 'MISTO',
    };
  }
  const ordenados = [...positivos].sort((a, b) => b - a);
  const maioresConsiderados = Math.max(1, Math.ceil(lancamentos * 0.1));
  const somaMaiores = ordenados
    .slice(0, maioresConsiderados)
    .reduce((s, v) => s + v, 0);
  const participacaoMaiores = arredondar((somaMaiores / total) * 100);
  let perfil: PerfilDanoCancelamentos['perfil'] = 'MISTO';
  if (participacaoMaiores >= LIMIAR_POUCOS_GRANDES_PCT) perfil = 'POUCOS_GRANDES';
  else if (participacaoMaiores <= LIMIAR_MUITOS_PEQUENOS_PCT)
    perfil = 'MUITOS_PEQUENOS';
  return {
    lancamentos,
    ticketMedio: arredondar(total / lancamentos),
    maioresConsiderados,
    participacaoMaiores,
    perfil,
  };
}

/** Rótulo usado quando o arquivo não informou motivo/autorizador. */
export const ROTULO_NAO_INFORMADO = 'Não informado';

/** Uma fatia agrupada por texto (motivo, autorizador…). */
export interface FatiaCancelamentos {
  rotulo: string;
  total: number;
  lancamentos: number;
  /** Fatia no total do grupo (%). */
  participacao: number;
}

/**
 * Agrupa lançamentos por um texto livre (motivo ou quem autorizou), do maior
 * valor para o menor.
 *
 * Os dois campos só existem no arquivo de **cancelamento de cupom** — o de itens
 * não traz nem motivo nem autorizador. Por isso a tela precisa dizer que esta
 * leitura abrange apenas os cancelamentos de cupom: apresentá-la como se fosse do total
 * seria induzir o gestor a uma conclusão errada.
 *
 * Valores sem texto entram como "Não informado" em vez de serem descartados —
 * um arquivo que não traz motivo é, ele próprio, uma informação de gestão.
 */
export function agruparPorRotulo(
  itens: readonly { rotulo: string | null | undefined; valor: number }[],
  limite = 5,
): FatiaCancelamentos[] {
  const mapa = new Map<string, { total: number; lancamentos: number }>();
  let total = 0;
  for (const i of itens) {
    if (!Number.isFinite(i.valor)) continue;
    const bruto = (i.rotulo ?? '').trim();
    const chave = bruto === '' ? ROTULO_NAO_INFORMADO : bruto;
    const atual = mapa.get(chave) ?? { total: 0, lancamentos: 0 };
    atual.total += i.valor;
    atual.lancamentos += 1;
    mapa.set(chave, atual);
    total += i.valor;
  }
  return [...mapa.entries()]
    .map(([rotulo, v]) => ({
      rotulo,
      total: arredondar(v.total),
      lancamentos: v.lancamentos,
      participacao: total > 0 ? arredondar((v.total / total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo))
    .slice(0, Math.max(1, Math.floor(limite)));
}

/* ------------------------------ diagnóstico ------------------------------- */

/** Fatia mínima para um motivo/autorizador merecer virar causa. */
export const LIMIAR_MOTIVO_RELEVANTE_PCT = 30;
export const LIMIAR_AUTORIZADOR_RELEVANTE_PCT = 50;

/** Teto de causas e ações exibidas: uma lista longa não é lida. */
export const MAX_CAUSAS = 4;
export const MAX_ACOES = 4;

/** Uma causa identificada no mês. */
export interface CausaCancelamentos {
  titulo: string;
  detalhe: string;
}

/** Leitura do mês: o que está impactando e o que fazer. */
export interface DiagnosticoCancelamentos {
  resumo: string;
  causas: CausaCancelamentos[];
  acoes: string[];
}

/** Ingredientes do diagnóstico (tudo já calculado pelas funções acima). */
export interface EntradaDiagnostico {
  avaliacao: AvaliacaoCancelamentos;
  composicao: ComposicaoCancelamentos;
  concentracao: ConcentracaoCancelamentos;
  simulacao: SimulacaoCancelamentos | null;
  perfil: PerfilDanoCancelamentos;
  motivos: readonly FatiaCancelamentos[];
  autorizadores: readonly FatiaCancelamentos[];
  evolucao: EvolucaoMes | null;
  ofensores: readonly OfensorCancelamentos[];
}

/** "0,75%" com vírgula decimal, para as frases do indicador. */
export function pctTexto(valor: number, casas = 2): string {
  return `${valor.toFixed(casas).replace('.', ',')}%`;
}

/** "R$ 1.234,56" para as frases do indicador. */
export function reaisTexto(valor: number): string {
  const [inteiro, decimal] = Math.abs(valor).toFixed(2).split('.');
  const comPontos = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${valor < 0 ? '-' : ''}R$ ${comPontos},${decimal}`;
}

/** "p.p." com sinal explícito (ex.: "+0,35 p.p."). */
function ppTexto(valor: number): string {
  const sinal = valor >= 0 ? '+' : '−';
  return `${sinal}${Math.abs(valor).toFixed(2).replace('.', ',')} p.p.`;
}

/**
 * Monta o diagnóstico do mês: uma frase de resumo, as causas encontradas e as
 * ações recomendadas.
 *
 * As ações são **deduzidas** dos números, não fixas. Uma frase fixa ("revisar os
 * cancelamentos de maior valor") é decoração: serve para qualquer mês e por isso
 * não muda o comportamento de ninguém. Aqui, se o peso está em itens e espalhado
 * pela equipe, a recomendação fala de rotina de frente de caixa; se está em
 * cupom e concentrado em três pessoas, fala de critério de autorização e de
 * conversa individual. É a diferença entre relatar e orientar.
 *
 * Determinística: as mesmas entradas produzem sempre o mesmo texto, o que
 * permite testá-la e faz o app, o histórico e um relatório futuro contarem a
 * mesma história sobre o mesmo mês.
 */
export function diagnosticar(
  entrada: EntradaDiagnostico,
): DiagnosticoCancelamentos {
  const {
    avaliacao,
    composicao,
    concentracao,
    simulacao,
    perfil,
    motivos,
    autorizadores,
    evolucao,
    ofensores,
  } = entrada;

  // Sem número não há diagnóstico: dizer o que falta é a única conclusão
  // honesta possível.
  if (avaliacao.estado === 'SEM_MOVIMENTO') {
    return {
      resumo:
        'Nenhum cancelamento e nenhuma venda registrada neste mês — nada a analisar.',
      causas: [],
      acoes: ['Confirmar em Importações se os arquivos do mês foram enviados.'],
    };
  }
  if (avaliacao.estado === 'SEM_VENDA') {
    return {
      resumo:
        `Há ${reaisTexto(composicao.totalItens + composicao.totalCupom)} de ` +
        'cancelamentos, mas nenhuma venda registrada no mês: sem o arquivo de ' +
        'vendas não existe percentual para comparar com a meta.',
      causas: [],
      acoes: [
        'Enviar o arquivo de vendas por hora do mês em Importações — sem ele o indicador fica sem denominador.',
      ],
    };
  }

  const valor = avaliacao.valor ?? 0;
  const causas: CausaCancelamentos[] = [];
  const acoes: string[] = [];

  /* ---- resumo ---- */
  const dentro = avaliacao.cumpriu === true;
  let resumo: string;
  if (dentro) {
    resumo =
      `Dentro da meta: ${pctTexto(valor)} das vendas, com teto de ` +
      `${pctTexto(avaliacao.meta)}` +
      (avaliacao.desvio ? ` (${ppTexto(avaliacao.desvio.absoluto)})` : '') +
      '.';
  } else {
    const excedente =
      avaliacao.excedente != null && avaliacao.excedente > 0
        ? `, com ${reaisTexto(avaliacao.excedente)} acima do que a meta permitia`
        : '';
    resumo =
      `${pctTexto(valor)} das vendas, contra um teto de ` +
      `${pctTexto(avaliacao.meta)}${excedente}.`;
  }
  if (evolucao === 'PIOROU') {
    resumo += ' Piorou em relação ao mês anterior.';
  } else if (evolucao === 'MELHOROU') {
    resumo += ' Melhorou em relação ao mês anterior.';
  }

  /* ---- causa 1: qual parte manda ---- */
  if (composicao.dominante === 'ITENS') {
    causas.push({
      titulo: 'O peso está no cancelamento de itens',
      detalhe:
        `${pctTexto(composicao.participacaoItens, 0)} do valor vem de itens ` +
        `(${reaisTexto(composicao.totalItens)}), contra ` +
        `${reaisTexto(composicao.totalCupom)} de cupom.`,
    });
    acoes.push(
      'Os itens são cancelados durante o registro da compra: revisar o escaneamento e a marcação de preço na gôndola.',
    );
  } else if (composicao.dominante === 'CUPOM') {
    causas.push({
      titulo: 'O peso está no cancelamento de cupom',
      detalhe:
        `${pctTexto(composicao.participacaoCupom, 0)} do valor vem de cupons ` +
        `(${reaisTexto(composicao.totalCupom)}), contra ` +
        `${reaisTexto(composicao.totalItens)} de itens.`,
    });
    acoes.push(
      'O cancelamento de cupom passa por autorização: revisar o critério com os responsáveis.',
    );
  } else {
    causas.push({
      titulo: 'As duas partes pesam de forma semelhante',
      detalhe:
        `Itens ${pctTexto(composicao.participacaoItens, 0)} e cupom ` +
        `${pctTexto(composicao.participacaoCupom, 0)} do valor: tratar apenas ` +
        'um dos lados não resolve o total.',
    });
    acoes.push(
      'Atuar nos dois lados: escaneamento na frente de caixa e critério de autorização de cupom.',
    );
  }

  /* ---- causa 2: gente ou processo ---- */
  if (concentracao.pessoas > 0) {
    if (!concentracao.espalhado) {
      const nomes = ofensores
        .slice(0, 3)
        .map((o) => o.nome)
        .join(', ');
      causas.push({
        titulo: 'O valor está concentrado em poucas pessoas',
        detalhe:
          `Os 3 maiores respondem por ${pctTexto(concentracao.participacaoTop3, 0)} ` +
          `do valor das pessoas cadastradas: ${nomes}.`,
      });
      acoes.push(
        `Conversa individual com ${nomes}: neste caso o ganho é pontual, e não de campanha geral.`,
      );
    } else {
      causas.push({
        titulo: 'O valor está distribuído pela equipe',
        detalhe:
          `São ${concentracao.pessoas} pessoas com cancelamento, e são ` +
          `necessárias ${concentracao.pessoasParaMetade} delas para somar ` +
          'metade do valor: trata-se de comportamento de rotina, e não de ' +
          'exceção individual.',
      });
      acoes.push(
        'Tratar como processo (rotina e treinamento da frente de caixa): cobranças individuais não alteram um número distribuído.',
      );
    }
  }

  /* ---- causa 3: motivo mais caro (só cupom) ---- */
  const motivoTop = motivos[0];
  if (
    motivoTop &&
    motivoTop.rotulo !== ROTULO_NAO_INFORMADO &&
    motivoTop.participacao >= LIMIAR_MOTIVO_RELEVANTE_PCT
  ) {
    causas.push({
      titulo: `Motivo de maior custo: ${motivoTop.rotulo}`,
      detalhe:
        `${reaisTexto(motivoTop.total)} em ${motivoTop.lancamentos} ` +
        `${motivoTop.lancamentos === 1 ? 'cupom' : 'cupons'}, ` +
        `${pctTexto(motivoTop.participacao, 0)} do valor cancelado em cupom.`,
    });
    acoes.push(
      `Atuar sobre a causa de "${motivoTop.rotulo}": é o motivo de maior custo em cupom.`,
    );
  }

  /* ---- causa 4: autorização concentrada (só cupom) ---- */
  const autorizadorTop = autorizadores[0];
  if (
    autorizadorTop &&
    autorizadorTop.rotulo !== ROTULO_NAO_INFORMADO &&
    autorizadorTop.participacao >= LIMIAR_AUTORIZADOR_RELEVANTE_PCT &&
    autorizadorTop.lancamentos >= 3
  ) {
    causas.push({
      titulo: 'As autorizações de cupom estão concentradas',
      detalhe:
        `${autorizadorTop.rotulo} autorizou ${pctTexto(autorizadorTop.participacao, 0)} ` +
        `do valor em cupom (${autorizadorTop.lancamentos} cancelamentos).`,
    });
    acoes.push(
      `Alinhar o critério de autorização com ${autorizadorTop.rotulo}: a concentração pode decorrer do turno ou do critério aplicado.`,
    );
  }

  /* ---- ações extras: forma do dano e simulação ---- */
  if (perfil.lancamentos > 0) {
    if (perfil.perfil === 'POUCOS_GRANDES') {
      acoes.push(
        `Poucos lançamentos concentram ${pctTexto(perfil.participacaoMaiores, 0)} do valor (valor médio de ${reaisTexto(perfil.ticketMedio)}): revisar os maiores caso a caso.`,
      );
    } else if (perfil.perfil === 'MUITOS_PEQUENOS') {
      acoes.push(
        `São ${perfil.lancamentos} lançamentos de valor baixo (valor médio de ${reaisTexto(perfil.ticketMedio)}): o ganho vem da rotina, e não de casos isolados.`,
      );
    }
  }
  if (!dentro && simulacao?.ficariaDentro) {
    acoes.push(
      `Tratando os ${simulacao.quantos} maiores (${reaisTexto(simulacao.valorRemovido)}), o mês fecharia em ${pctTexto(simulacao.percentualSimulado)}, dentro da meta.`,
    );
  }

  return {
    resumo,
    causas: causas.slice(0, MAX_CAUSAS),
    acoes: acoes.slice(0, MAX_ACOES),
  };
}
