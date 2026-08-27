/**
 * Desenho **puro** da escala publicada (dia e semana) como SVG.
 *
 * Uma única fonte de layout para os dois formatos de entrega: o **PDF** embute
 * este SVG numa folha e a **imagem 4K** rasteriza o mesmo SVG. Se cada saída
 * tivesse o seu próprio desenho, as duas iriam divergindo — e a equipe receberia
 * duas escalas parecidas mas diferentes, que é pior do que receber uma só.
 *
 * Por que SVG e não HTML/CSS: aqui o tamanho final em pixels é um requisito (a
 * imagem precisa sair nítida em 4K), e SVG permite dizer exatamente quantos
 * pixels tem cada coisa. Como consequência, as posições são calculadas à mão —
 * daí o "cursor" `y` que desce conforme os blocos são empilhados.
 *
 * Sem dependências de React Native: recebe dados e devolve string, então é
 * coberto por testes.
 */
// Só tipos: o desenho é puro e não deve arrastar o cliente HTTP para dentro
// dele (nem para dentro dos seus testes).
import type {
  EscalaDiaPublicada,
  EscalaSemanaPublicada,
  LinhaEscala,
  StatusEscala,
} from '../api/services/escalaExportacao';
import { LOGO_ESCALA_DATA_URI, LOGO_ESCALA_PROPORCAO } from './logoEscala';

/**
 * Largura da escala do DIA: retrato.
 *
 * 2160 px é o lado curto do 4K — em retrato é o que dá nitidez ao ampliar no
 * celular, que é onde a equipe lê. A altura cresce com o número de pessoas.
 */
export const LARGURA_DIA = 2160;

/**
 * Altura da escala do DIA: 3840 px — o 4K retrato exato (2160 × 3840).
 *
 * A folha tem tamanho **fixo** e o conteúdo se ajusta a ela: a altura das linhas
 * e o tamanho das fontes são calculados para preencher a página. Antes a folha
 * crescia com o número de pessoas, e uma equipe pequena produzia uma imagem baixa
 * e larga, com o texto pequeno perdido no meio de muito branco.
 *
 * Só é ultrapassada quando há gente demais para caber com fonte legível — aí é
 * melhor uma folha mais longa do que um texto que ninguém lê (ver `METRICAS`).
 */
export const ALTURA_DIA = 3840;

/**
 * Largura da escala da SEMANA: paisagem (4K cheio).
 *
 * A semana é uma grade de 7 colunas; em retrato as colunas ficariam estreitas
 * demais para caber "07:00–15:20" sem apertar a fonte.
 */
export const LARGURA_SEMANA = 3840;

/** Altura da escala da SEMANA: 2160 px — o 4K paisagem exato (3840 × 2160). */
export const ALTURA_SEMANA = 2160;

/** Cores da escala impressa (espelho do tema do app). */
const COR = {
  primaria: '#0F4C81',
  primariaEscura: '#0A3459',
  primariaClara: '#E8EFF7',
  texto: '#111827',
  textoSec: '#6B7280',
  borda: '#D7DEE7',
  divisor: '#EDF1F6',
  zebra: '#F7FAFC',
  branco: '#FFFFFF',
  verde: '#0F7B4F',
  azul: '#1D6FA5',
  vermelho: '#C0392B',
  roxo: '#6D3D9B',
  amarelo: '#B7791F',
} as const;

/** Nome completo do dia da semana (0 = domingo). */
const DIAS_SEMANA = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

/** Abreviação do dia da semana, para o cabeçalho da grade. */
const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Título de cada seção da escala. */
const TITULO_FUNCAO: Record<string, string> = {
  SUPERVISOR: 'Supervisão',
  FISCAL: 'Fiscais',
  OPERADOR: 'Operadores de caixa',
};

// O rótulo do turno (Abertura/Intermediário/Fechamento/Apoio) foi REMOVIDO da
// folha de propósito: é uma classificação interna de gestão, e quem lê a escala
// quer saber a que hora entra — o horário já responde isso. Tirá-lo deixou cada
// pessoa numa linha só, o que liberou o espaço para as fontes maiores.

/** Como cada estado aparece na escala (palavra e cor). */
const APARENCIA_STATUS: Record<StatusEscala, { rotulo: string; cor: string }> = {
  TRABALHA: { rotulo: '', cor: COR.texto },
  FOLGA: { rotulo: 'Folga', cor: COR.textoSec },
  FALTA: { rotulo: 'Falta', cor: COR.vermelho },
  ATESTADO: { rotulo: 'Atestado', cor: COR.azul },
  FERIAS: { rotulo: 'Férias', cor: COR.roxo },
};

/** Rótulo curto do estado, para a célula estreita da grade semanal. */
const STATUS_CURTO: Record<StatusEscala, string> = {
  TRABALHA: '',
  FOLGA: 'Folga',
  FALTA: 'Falta',
  ATESTADO: 'Atest.',
  FERIAS: 'Férias',
};

/** Escapa texto para uso seguro em XML/SVG. */
function esc(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Corta o texto que não caberia na largura disponível.
 *
 * SVG não quebra nem corta texto sozinho: sem isto, um nome comprido invadiria a
 * coluna do horário e as duas informações ficariam ilegíveis. A largura média do
 * caractere (0,52 do tamanho da fonte) é aproximada de propósito — erra por
 * pouco e sempre para o lado seguro.
 */
function encurtar(texto: string, larguraMax: number, tamanhoFonte: number): string {
  const maxChars = Math.floor(larguraMax / (tamanhoFonte * LARGURA_MEDIA_CARACTERE));
  if (texto.length <= maxChars) return texto;
  return `${texto.slice(0, Math.max(1, maxChars - 1))}…`;
}

/**
 * Largura média de um caractere como fração do tamanho da fonte.
 *
 * Aproximação deliberada: SVG não mede texto, e medir de verdade exigiria uma
 * tabela de métricas da fonte. Erra por pouco e sempre para o lado seguro
 * (superestima), então o texto é cortado um pouco antes em vez de invadir a
 * coluna vizinha.
 */
const LARGURA_MEDIA_CARACTERE = 0.52;

/** Largura aproximada de um texto num tamanho de fonte. */
function larguraEstimada(texto: string, tamanhoFonte: number): number {
  return texto.length * tamanhoFonte * LARGURA_MEDIA_CARACTERE;
}

/** Mantém um valor dentro de um intervalo. */
function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

/** Fonte usada no SVG: só famílias do sistema, que existem na conversão. */
const FONTE = "'Helvetica Neue', Helvetica, Arial, sans-serif";

interface OpcoesTexto {
  tamanho?: number;
  cor?: string;
  peso?: '400' | '600' | '700';
  ancora?: 'start' | 'middle' | 'end';
  /** Espaçamento entre letras (usado nos rótulos em caixa alta). */
  espacamento?: number;
}

/** Um `<text>` do SVG. */
function texto(x: number, y: number, conteudo: string, op: OpcoesTexto = {}): string {
  const {
    tamanho = 40,
    cor = COR.texto,
    peso = '400',
    ancora = 'start',
    espacamento,
  } = op;
  const extra = espacamento != null ? ` letter-spacing="${espacamento}"` : '';
  return `<text x="${x}" y="${y}" font-family="${FONTE}" font-size="${tamanho}" font-weight="${peso}" fill="${cor}" text-anchor="${ancora}"${extra}>${esc(conteudo)}</text>`;
}

/** Um retângulo (fundo, faixa, selo). */
function retangulo(
  x: number,
  y: number,
  largura: number,
  altura: number,
  preenchimento: string,
  raio = 0,
): string {
  const r = raio > 0 ? ` rx="${raio}" ry="${raio}"` : '';
  return `<rect x="${x}" y="${y}" width="${largura}" height="${altura}" fill="${preenchimento}"${r}/>`;
}

/** Uma linha horizontal (separador). */
function linhaH(x1: number, x2: number, y: number, cor: string, espessura = 2): string {
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${cor}" stroke-width="${espessura}"/>`;
}

/** Uma linha vertical (separador de coluna). */
function linhaV(x: number, y1: number, y2: number, cor: string, espessura = 2): string {
  return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${cor}" stroke-width="${espessura}"/>`;
}

/** Selo arredondado com texto (feriado, grupo do domingo, turno). */
function selo(
  x: number,
  y: number,
  rotulo: string,
  cor: string,
  fundo: string,
  tamanho = 30,
): { svg: string; largura: number } {
  const paddingH = tamanho * 0.6;
  const largura = rotulo.length * tamanho * 0.56 + paddingH * 2;
  const altura = tamanho * 1.8;
  return {
    svg:
      retangulo(x, y, largura, altura, fundo, altura / 2) +
      texto(x + largura / 2, y + altura * 0.68, rotulo, {
        tamanho,
        cor,
        peso: '700',
        ancora: 'middle',
      }),
    largura,
  };
}

/** Uma imagem SVG pronta, com as dimensões que ela declara. */
export interface ImagemEscala {
  svg: string;
  largura: number;
  altura: number;
  /**
   * Orientação da folha, declarada pelo desenho — **não** deduzida da proporção.
   *
   * A altura depende de quantas pessoas há na escala: num dia de equipe pequena o
   * desenho retrato fica mais largo do que alto, e adivinhar pela proporção
   * imprimiria a escala do dia em paisagem.
   */
  orientacao: 'retrato' | 'paisagem';
}

/** Opções de apresentação da escala. */
export interface OpcoesEscala {
  /** Nome da loja, no topo. */
  loja?: string;
  /** Logo do rodapé como data URI; null mostra só o texto. */
  logoDataUri?: string | null;
  /** Momento da geração (vai no rodapé). */
  geradoEm?: Date;
}

const LOJA_PADRAO = 'Comercial Zaffari · Stok Center';

/** `dd/mm/aaaa` a partir de `yyyy-mm-dd`. */
function dataBR(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** `dd/mm` a partir de `yyyy-mm-dd`. */
function dataCurtaBR(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}

/** `dd/mm/aaaa HH:mm` do momento da geração. */
function momentoBR(data: Date): string {
  const dois = (n: number): string => String(n).padStart(2, '0');
  return `${dois(data.getDate())}/${dois(data.getMonth() + 1)}/${data.getFullYear()} ${dois(data.getHours())}:${dois(data.getMinutes())}`;
}

/** Faixa de identidade no topo + nome da loja. */
function cabecalhoTopo(largura: number, loja: string): { svg: string; altura: number } {
  const alturaFaixa = 16;
  const svg =
    retangulo(0, 0, largura, alturaFaixa, COR.primaria) +
    texto(largura / 2, alturaFaixa + 62, loja.toUpperCase(), {
      tamanho: 34,
      cor: COR.textoSec,
      peso: '700',
      ancora: 'middle',
      espacamento: 4,
    });
  return { svg, altura: alturaFaixa + 92 };
}

/**
 * Rodapé: logos + momento da geração.
 *
 * A data/hora não é decoração: sem ela, uma escala reenviada dias depois parece
 * a de hoje, e alguém aparece no turno errado confiando na imagem antiga.
 */
function rodape(
  largura: number,
  margem: number,
  y: number,
  logo: string | null,
  geradoEm: Date,
  loja: string,
): string {
  const partes: string[] = [linhaH(margem, largura - margem, y, COR.borda, 3)];
  let cursor = y + 60;

  if (logo) {
    const larguraLogo = larguraDoLogo(largura, margem);
    const alturaLogo = larguraLogo / LOGO_ESCALA_PROPORCAO;
    partes.push(
      `<image x="${(largura - larguraLogo) / 2}" y="${cursor}" width="${larguraLogo}" height="${alturaLogo}" href="${logo}" preserveAspectRatio="xMidYMid meet"/>`,
    );
    cursor += alturaLogo + 40;
  } else {
    partes.push(
      texto(largura / 2, cursor + 34, loja, {
        tamanho: 38,
        cor: COR.primaria,
        peso: '700',
        ancora: 'middle',
      }),
    );
    cursor += 76;
  }

  partes.push(
    texto(largura / 2, cursor + 26, `Escala gerada em ${momentoBR(geradoEm)}`, {
      tamanho: 28,
      cor: COR.textoSec,
      ancora: 'middle',
    }),
  );
  return partes.join('');
}

/** Largura do logo no rodapé. */
function larguraDoLogo(largura: number, margem: number): number {
  return Math.min(760, largura - margem * 2);
}

/**
 * Altura que o rodapé vai ocupar — calculada **antes** de desenhar.
 *
 * É o que permite ancorar o rodapé no fim da folha e distribuir o espaço restante
 * entre as linhas: sem saber a altura do rodapé de antemão, ou ele flutuaria no
 * meio da página ou sobraria uma faixa branca embaixo dele.
 */
function alturaRodape(
  largura: number,
  margem: number,
  logo: string | null,
): number {
  const alturaMarca = logo
    ? larguraDoLogo(largura, margem) / LOGO_ESCALA_PROPORCAO + 40
    : 76;
  return 60 + alturaMarca + 26 + 40;
}

/** Envelope do SVG com fundo branco. */
function envelope(largura: number, altura: number, conteudo: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}">${retangulo(0, 0, largura, altura, COR.branco)}${conteudo}</svg>`;
}

/* ------------------------------------------------------------------ */
/* Escala do DIA (retrato)                                             */
/* ------------------------------------------------------------------ */

const MARGEM_DIA = 90;

/* Medidas de referência (fator de preenchimento = 1). */
const ALTURA_LINHA_BASE = 104;
const ALTURA_SECAO_BASE = 78;
const ESPACO_ANTES_SECAO_BASE = 56;
const FONTE_NOME_BASE = 46;

/**
 * Limites do fator de preenchimento.
 *
 * - **Mínimo:** abaixo disto a fonte fica pequena para ler no celular; em vez de
 *   encolher mais, a folha cresce (equipe muito grande).
 * - **Máximo:** acima disto as linhas ficariam absurdamente altas numa equipe
 *   pequena. O espaço que sobra vai para os intervalos entre as seções, que é
 *   respiro proposital em vez de um bloco de branco no fim da página.
 */
const FATOR_MINIMO = 0.62;
const FATOR_MAXIMO = 1.9;

/** Respiro extra máximo por seção quando sobra espaço (evita o "buraco"). */
const EXTRA_MAXIMO_ENTRE_SECOES = 140;

/** O fator ideal saiu dos limites? (equipe pequena ou grande demais). */
function ehFatorLimitado(fatorIdeal: number): boolean {
  return fatorIdeal < FATOR_MINIMO || fatorIdeal > FATOR_MAXIMO;
}

/** Tamanhos calculados para preencher a folha do dia. */
interface MetricasDia {
  alturaLinha: number;
  alturaSecao: number;
  espacoAntesSecao: number;
  fonteNome: number;
  fonteHorario: number;
  fonteEstado: number;
  fonteSecundaria: number;
  fonteTituloSecao: number;
  /** Altura final da folha (só passa de `ALTURA_DIA` se não couber). */
  alturaFolha: number;
}

/**
 * Resolve as medidas para que o conteúdo **preencha** a folha.
 *
 * A conta é direta: mede-se o conteúdo com as medidas de referência, compara-se
 * com o espaço livre entre cabeçalho e rodapé, e o resultado é o fator que
 * multiplica alturas e fontes. Como o fator é **um só**, tudo cresce junto e a
 * imagem não distorce — é diferente de esticar o desenho, que deformaria as
 * letras.
 */
function metricasDia(
  linhas: number,
  secoes: number,
  alturaTopo: number,
  alturaRodape: number,
): MetricasDia {
  const conteudoBase =
    secoes * (ALTURA_SECAO_BASE + ESPACO_ANTES_SECAO_BASE + 8) +
    linhas * ALTURA_LINHA_BASE;
  const disponivel = ALTURA_DIA - alturaTopo - alturaRodape;
  const fatorIdeal = conteudoBase > 0 ? disponivel / conteudoBase : 1;
  const fator = limitar(fatorIdeal, FATOR_MINIMO, FATOR_MAXIMO);

  const alturaLinha = Math.round(ALTURA_LINHA_BASE * fator);
  const alturaSecao = Math.round(ALTURA_SECAO_BASE * fator);
  const conteudoReal = secoes * (alturaSecao + 8) + linhas * alturaLinha;

  // Sobra (equipe pequena): parte vira respiro entre as seções, com **limite**.
  // Sem o limite, uma equipe de quatro pessoas empurrava a primeira seção mil
  // pixels para baixo — deixava de ser respiro e virava um buraco.
  const sobra = disponivel - conteudoReal - secoes * ESPACO_ANTES_SECAO_BASE;
  const extraPorSecao =
    sobra > 0 && secoes > 0
      ? Math.min(Math.floor(sobra / secoes), EXTRA_MAXIMO_ENTRE_SECOES)
      : 0;
  const espacoAntesSecao =
    sobra > 0
      ? ESPACO_ANTES_SECAO_BASE + extraPorSecao
      : Math.round(ESPACO_ANTES_SECAO_BASE * fator);
  const alturaConteudo = conteudoReal + secoes * espacoAntesSecao;

  // A folha acompanha o conteúdo: fica com 3840 no caso normal (o fator resolve
  // exatamente o espaço), mais CURTA quando a equipe é pequena demais para
  // preencher sem linhas absurdas, e mais LONGA quando é grande demais para
  // caber com fonte legível. Em nenhum dos casos sobra faixa branca.
  //
  // Quando o fator NÃO foi limitado, a folha é exatamente 4K: os poucos pixels
  // perdidos ao arredondar as alturas viram um fio de espaço acima do rodapé, em
  // vez de deixar a imagem com 3839 px.
  const alturaFolha = ehFatorLimitado(fatorIdeal)
    ? alturaTopo + alturaConteudo + alturaRodape
    : ALTURA_DIA;

  const fonteNome = Math.round(limitar(FONTE_NOME_BASE * fator, 30, 76));
  return {
    alturaLinha,
    alturaSecao,
    espacoAntesSecao,
    fonteNome,
    fonteHorario: fonteNome,
    fonteEstado: Math.round(fonteNome * 0.92),
    fonteSecundaria: Math.round(limitar(fonteNome * 0.62, 22, 44)),
    fonteTituloSecao: Math.round(limitar(fonteNome * 0.92, 30, 64)),
    alturaFolha,
  };
}

/**
 * Uma linha de pessoa na escala do dia: **nome à esquerda, horário à direita**.
 *
 * O turno do cadastro (Abertura/Intermediário/Fechamento/Apoio) **não** aparece:
 * quem lê a escala quer saber a que hora entra, e o horário já diz isso. O rótulo
 * do turno era uma classificação interna de gestão — na folha só roubava a linha
 * de baixo de cada pessoa e obrigava a fonte a ser menor.
 *
 * Com isso a linha é de **uma só linha de texto**, o que permite fontes bem
 * maiores e é o que faz a escala preencher a folha.
 */
function linhaPessoaDia(
  largura: number,
  y: number,
  linha: LinhaEscala,
  zebra: boolean,
  m: MetricasDia,
): string {
  const partes: string[] = [];
  const x = MARGEM_DIA;
  const fim = largura - MARGEM_DIA;
  if (zebra) {
    // Recuado 3 px no topo de propósito: o fundo começa exatamente onde está o
    // separador da linha ANTERIOR e, sendo pintado depois, o apagaria — as
    // linhas entre nomes desapareceriam em toda linha zebrada.
    partes.push(retangulo(x, y + 3, fim - x, m.alturaLinha - 3, COR.zebra));
  }

  const baseTexto = y + m.alturaLinha * 0.66;
  const aparencia = APARENCIA_STATUS[linha.status];
  const trabalha = linha.status === 'TRABALHA';

  // Coluna da direita: o horário é a informação que a pessoa procura, então fica
  // alinhada à direita, sempre na mesma posição, para o olho descer em coluna.
  const horario =
    linha.entrada && linha.saida
      ? `${linha.entrada} – ${linha.saida}`
      : linha.entrada
        ? `A partir de ${linha.entrada}`
        : '';

  // Largura que a direita ocupa — usada para cortar o nome antes de invadi-la.
  let larguraDireita = 0;

  if (trabalha) {
    partes.push(
      texto(fim, baseTexto, horario, {
        tamanho: m.fonteHorario,
        peso: '700',
        cor: COR.texto,
        ancora: 'end',
      }),
    );
    larguraDireita = larguraEstimada(horario, m.fonteHorario);
  } else {
    // Estado e horário previsto na MESMA linha: o horário diz qual turno ficou
    // descoberto, e empilhá-los obrigaria a linha a ser mais alta só por causa
    // dos poucos casos de falta.
    partes.push(
      texto(fim, baseTexto, aparencia.rotulo, {
        tamanho: m.fonteEstado,
        peso: '700',
        cor: aparencia.cor,
        ancora: 'end',
      }),
    );
    larguraDireita = larguraEstimada(aparencia.rotulo, m.fonteEstado);
    if (horario) {
      const recuo = larguraDireita + m.fonteEstado * 0.6;
      partes.push(
        texto(fim - recuo, baseTexto, horario, {
          tamanho: m.fonteSecundaria,
          cor: COR.textoSec,
          ancora: 'end',
        }),
      );
      larguraDireita = recuo + larguraEstimada(horario, m.fonteSecundaria);
    }
  }

  // Coluna da esquerda: só o nome (e a marca de exceção, quando houver).
  const larguraNome = fim - x - larguraDireita - m.fonteNome;
  partes.push(
    texto(x + 8, baseTexto, encurtar(linha.nome, larguraNome, m.fonteNome), {
      tamanho: m.fonteNome,
      peso: '600',
      cor: trabalha ? COR.texto : COR.textoSec,
    }),
  );
  // "Horário especial" fica ao lado do nome, não abaixo: é raro e não deve
  // mudar a altura da linha (o que quebraria o ritmo de toda a folha).
  if (linha.horarioEspecial) {
    const depoisDoNome =
      x + 8 + larguraEstimada(encurtar(linha.nome, larguraNome, m.fonteNome), m.fonteNome);
    // Folga generosa: a largura do nome é estimada, e quando a estimativa erra
    // para baixo o rótulo cola na última letra e parece parte do nome.
    partes.push(
      texto(depoisDoNome + m.fonteSecundaria * 1.2, baseTexto, '• especial', {
        tamanho: m.fonteSecundaria,
        cor: COR.primaria,
        peso: '600',
      }),
    );
  }

  // Separador em `borda`, não em `divisor`: a linha entre nomes é um pedido
  // explícito do documento, e no tom mais claro ela praticamente não aparecia.
  partes.push(linhaH(x, fim, y + m.alturaLinha, COR.borda, 2));
  return partes.join('');
}

/**
 * Escala de um dia, em retrato.
 *
 * Ordem do desenho: identidade da loja → dia em destaque → contagens → pessoas
 * por função → rodapé. É a ordem em que a pergunta aparece: "que dia é?", "quem
 * trabalha?", "a que hora?".
 */
export function svgEscalaDia(
  escala: EscalaDiaPublicada,
  opcoes: OpcoesEscala = {},
): ImagemEscala {
  const largura = LARGURA_DIA;
  const loja = opcoes.loja ?? LOJA_PADRAO;
  const logo = opcoes.logoDataUri ?? LOGO_ESCALA_DATA_URI;
  const geradoEm = opcoes.geradoEm ?? new Date();
  const partes: string[] = [];

  const topo = cabecalhoTopo(largura, loja);
  partes.push(topo.svg);
  let y = topo.altura;

  // Bloco do dia: o que precisa ser lido de longe.
  partes.push(
    texto(MARGEM_DIA, y + 40, 'ESCALA DO DIA', {
      tamanho: 32,
      cor: COR.primaria,
      peso: '700',
      espacamento: 6,
    }),
  );
  // Espaço suficiente para a subida das letras do dia da semana (fonte 96) não
  // invadir o rótulo acima.
  y += 152;
  partes.push(
    texto(MARGEM_DIA, y, DIAS_SEMANA[escala.diaSemana], {
      tamanho: 96,
      peso: '700',
      cor: COR.primariaEscura,
    }),
  );
  partes.push(
    texto(largura - MARGEM_DIA, y, dataBR(escala.dataISO), {
      tamanho: 72,
      peso: '700',
      cor: COR.texto,
      ancora: 'end',
    }),
  );
  y += 40;

  // Selos de contexto (feriado / rodízio do domingo).
  const selos: { rotulo: string; cor: string; fundo: string }[] = [];
  if (escala.ehFeriado) {
    selos.push({
      rotulo: escala.nomeFeriado
        ? `Feriado · ${escala.nomeFeriado}`
        : 'Feriado',
      cor: COR.vermelho,
      fundo: '#FDECEA',
    });
  }
  if (escala.diaSemana === 0 && escala.grupoFolgaDomingo) {
    selos.push({
      rotulo: `Domingo · folga ${escala.grupoFolgaDomingo}`,
      cor: COR.azul,
      fundo: '#E7F1F8',
    });
  }
  if (selos.length > 0) {
    y += 34;
    let x = MARGEM_DIA;
    for (const s of selos) {
      const desenhado = selo(x, y, s.rotulo, s.cor, s.fundo, 32);
      partes.push(desenhado.svg);
      x += desenhado.largura + 20;
    }
    y += 32 * 1.8;
  }

  // Contagens do dia.
  y += 66;
  const t = escala.totais;
  const resumo = [
    `${t.trabalhando} trabalhando`,
    t.folgas > 0 ? `${t.folgas} de folga` : null,
    t.faltas > 0 ? `${t.faltas} falta${t.faltas === 1 ? '' : 's'}` : null,
    t.atestados > 0 ? `${t.atestados} atestado${t.atestados === 1 ? '' : 's'}` : null,
    t.ferias > 0 ? `${t.ferias} de férias` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');
  partes.push(
    texto(MARGEM_DIA, y, resumo, { tamanho: 38, cor: COR.textoSec, peso: '600' }),
  );
  y += 40;

  // Aqui termina o cabeçalho. Com a altura dele e a do rodapé já conhecidas, as
  // medidas do corpo são resolvidas para PREENCHER a folha.
  const alturaTopo = y;
  const alturaPe = alturaRodape(largura, MARGEM_DIA, logo);
  const totalLinhas = escala.secoes.reduce((s, sec) => s + sec.linhas.length, 0);
  const m = metricasDia(
    totalLinhas,
    escala.secoes.length,
    alturaTopo,
    alturaPe,
  );

  // Seções por função.
  for (const secao of escala.secoes) {
    y += m.espacoAntesSecao;
    partes.push(
      retangulo(
        MARGEM_DIA,
        y,
        largura - MARGEM_DIA * 2,
        m.alturaSecao,
        COR.primariaClara,
        12,
      ),
    );
    partes.push(
      texto(
        MARGEM_DIA + 26,
        y + m.alturaSecao * 0.66,
        TITULO_FUNCAO[secao.funcao] ?? secao.funcao,
        { tamanho: m.fonteTituloSecao, peso: '700', cor: COR.primariaEscura },
      ),
    );
    partes.push(
      texto(
        largura - MARGEM_DIA - 26,
        y + m.alturaSecao * 0.66,
        `${secao.linhas.length} pessoa${secao.linhas.length === 1 ? '' : 's'}`,
        {
          tamanho: m.fonteSecundaria,
          cor: COR.primaria,
          peso: '600',
          ancora: 'end',
        },
      ),
    );
    y += m.alturaSecao + 8;

    secao.linhas.forEach((linha, i) => {
      partes.push(linhaPessoaDia(largura, y, linha, i % 2 === 1, m));
      y += m.alturaLinha;
    });
  }

  // Rodapé ancorado no FIM da folha: é o que garante que não sobre uma faixa
  // branca embaixo (nem que ele flutue no meio quando a equipe é pequena).
  const altura = m.alturaFolha;
  partes.push(
    rodape(largura, MARGEM_DIA, altura - alturaPe, logo, geradoEm, loja),
  );

  return {
    svg: envelope(largura, altura, partes.join('')),
    largura,
    altura,
    orientacao: 'retrato',
  };
}

/* ------------------------------------------------------------------ */
/* Escala da SEMANA (paisagem)                                         */
/* ------------------------------------------------------------------ */

const MARGEM_SEMANA = 100;
const LARGURA_NOME_SEMANA = 820;
const ALTURA_CABECALHO_GRADE = 130;

/* Medidas de referência da semana (fator de preenchimento = 1). */
const ALTURA_LINHA_SEMANA_BASE = 124;
const ALTURA_FAIXA_BASE = 66;
const FONTE_NOME_SEMANA_BASE = 42;

/** Tamanhos calculados para preencher a folha da semana. */
interface MetricasSemana {
  alturaLinha: number;
  alturaFaixa: number;
  fonteNome: number;
  fonteFaixa: number;
  fonteHora: number;
  fonteHoraSaida: number;
  alturaFolha: number;
}

/**
 * Mesma ideia da escala do dia, aplicada à grade: um **único** fator escala as
 * alturas e as fontes até o conteúdo ocupar a folha de 3840 × 2160.
 *
 * Aqui não há sobra para distribuir entre seções (a grade é contínua e uma faixa
 * de função enorme ficaria estranha), então quando a equipe é pequena a linha
 * simplesmente fica mais alta — o que é exatamente o que preenche a página.
 */
function metricasSemana(
  pessoas: number,
  secoes: number,
  alturaTopo: number,
  alturaPe: number,
): MetricasSemana {
  const conteudoBase =
    secoes * ALTURA_FAIXA_BASE + pessoas * ALTURA_LINHA_SEMANA_BASE;
  const disponivel = ALTURA_SEMANA - alturaTopo - alturaPe;
  const fatorIdeal = conteudoBase > 0 ? disponivel / conteudoBase : 1;
  const fator = limitar(fatorIdeal, FATOR_MINIMO, FATOR_MAXIMO);

  const alturaLinha = Math.round(ALTURA_LINHA_SEMANA_BASE * fator);
  const alturaFaixa = Math.round(ALTURA_FAIXA_BASE * fator);
  // Como no dia: a folha acompanha o conteúdo, sem faixa branca sobrando, e é
  // exatamente 4K quando o fator não precisou ser limitado.
  const alturaFolha = ehFatorLimitado(fatorIdeal)
    ? alturaTopo + secoes * alturaFaixa + pessoas * alturaLinha + alturaPe
    : ALTURA_SEMANA;

  const fonteNome = Math.round(limitar(FONTE_NOME_SEMANA_BASE * fator, 28, 68));
  return {
    alturaLinha,
    alturaFaixa,
    fonteNome,
    fonteFaixa: Math.round(limitar(fonteNome * 0.72, 24, 44)),
    fonteHora: Math.round(limitar(fonteNome * 0.9, 26, 60)),
    fonteHoraSaida: Math.round(limitar(fonteNome * 0.8, 24, 52)),
    alturaFolha,
  };
}

/**
 * Escala da semana como grade: pessoas nas linhas, os sete dias nas colunas.
 *
 * A pessoa procura a **sua linha** e lê a semana inteira de uma vez — por isso a
 * ordem é alfabética dentro de cada função, e não por horário (que mudaria de
 * coluna para coluna e deixaria a lista sem ordem estável).
 */
export function svgEscalaSemana(
  escala: EscalaSemanaPublicada,
  opcoes: OpcoesEscala = {},
): ImagemEscala {
  const largura = LARGURA_SEMANA;
  const loja = opcoes.loja ?? LOJA_PADRAO;
  const logo = opcoes.logoDataUri ?? LOGO_ESCALA_DATA_URI;
  const geradoEm = opcoes.geradoEm ?? new Date();
  const partes: string[] = [];

  const xInicio = MARGEM_SEMANA;
  const xFim = largura - MARGEM_SEMANA;
  const larguraDia = (xFim - xInicio - LARGURA_NOME_SEMANA) / 7;
  const xDia = (i: number): number => xInicio + LARGURA_NOME_SEMANA + larguraDia * i;

  const topo = cabecalhoTopo(largura, loja);
  partes.push(topo.svg);
  let y = topo.altura;

  partes.push(
    texto(xInicio, y + 40, 'ESCALA DA SEMANA', {
      tamanho: 32,
      cor: COR.primaria,
      peso: '700',
      espacamento: 6,
    }),
  );
  y += 108;
  partes.push(
    texto(
      xInicio,
      y,
      `${dataBR(escala.inicioISO)} a ${dataBR(escala.fimISO)}`,
      { tamanho: 82, peso: '700', cor: COR.primariaEscura },
    ),
  );
  y += 70;

  // Cabeçalho da grade: dia da semana + data, com o feriado marcado.
  partes.push(
    retangulo(xInicio, y, xFim - xInicio, ALTURA_CABECALHO_GRADE, COR.primariaClara, 12),
  );
  partes.push(
    texto(xInicio + 26, y + ALTURA_CABECALHO_GRADE * 0.6, 'Colaborador', {
      tamanho: 40,
      peso: '700',
      cor: COR.primariaEscura,
    }),
  );
  escala.dias.forEach((dia, i) => {
    const centro = xDia(i) + larguraDia / 2;
    partes.push(
      texto(centro, y + 52, DIAS_CURTOS[dia.diaSemana], {
        tamanho: 38,
        peso: '700',
        cor: COR.primariaEscura,
        ancora: 'middle',
      }),
    );
    partes.push(
      texto(centro, y + 96, dataCurtaBR(dia.dataISO), {
        tamanho: 32,
        cor: dia.ehFeriado ? COR.vermelho : COR.primaria,
        peso: dia.ehFeriado ? '700' : '400',
        ancora: 'middle',
      }),
    );
    if (i > 0) {
      partes.push(linhaV(xDia(i), y, y + ALTURA_CABECALHO_GRADE, COR.branco, 2));
    }
  });
  y += ALTURA_CABECALHO_GRADE;

  const yGradeInicio = y;

  // Medidas do corpo resolvidas para preencher a folha (mesma ideia do dia).
  const alturaPe = alturaRodape(largura, MARGEM_SEMANA, logo);
  const totalPessoas = escala.secoes.reduce((s, sec) => s + sec.pessoas.length, 0);
  const m = metricasSemana(
    totalPessoas,
    escala.secoes.length,
    yGradeInicio,
    alturaPe,
  );

  for (const secao of escala.secoes) {
    // Faixa da função dentro da grade.
    partes.push(retangulo(xInicio, y, xFim - xInicio, m.alturaFaixa, COR.divisor));
    partes.push(
      texto(
        xInicio + 26,
        y + m.alturaFaixa * 0.7,
        (TITULO_FUNCAO[secao.funcao] ?? secao.funcao).toUpperCase(),
        {
          tamanho: m.fonteFaixa,
          peso: '700',
          cor: COR.primaria,
          espacamento: 4,
        },
      ),
    );
    y += m.alturaFaixa;

    secao.pessoas.forEach((pessoa, idx) => {
      if (idx % 2 === 1) {
        // Recuado no topo pelo mesmo motivo da escala do dia: sem isso o fundo
        // apaga o separador da linha anterior.
        partes.push(
          retangulo(xInicio, y + 3, xFim - xInicio, m.alturaLinha - 3, COR.zebra),
        );
      }
      // Só o nome: o turno do cadastro saiu da folha (o horário de cada dia já
      // diz o que a pessoa precisa saber), e a linha passou a ser de uma linha
      // só — é o que libera espaço para as fontes maiores.
      partes.push(
        texto(
          xInicio + 26,
          y + m.alturaLinha * 0.63,
          encurtar(pessoa.nome, LARGURA_NOME_SEMANA - 52, m.fonteNome),
          { tamanho: m.fonteNome, peso: '600' },
        ),
      );

      pessoa.celulas.forEach((celula, i) => {
        const centro = xDia(i) + larguraDia / 2;
        if (celula.status === 'TRABALHA' && celula.entrada) {
          // Entrada em cima e saída embaixo, ambas centradas na coluna: é a
          // leitura natural de "de … até …" num espaço estreito.
          partes.push(
            texto(centro, y + m.alturaLinha * 0.45, celula.entrada, {
              tamanho: m.fonteHora,
              peso: '700',
              ancora: 'middle',
            }),
          );
          if (celula.saida) {
            partes.push(
              texto(centro, y + m.alturaLinha * 0.84, celula.saida, {
                tamanho: m.fonteHoraSaida,
                cor: COR.textoSec,
                ancora: 'middle',
              }),
            );
          }
        } else {
          const aparencia = APARENCIA_STATUS[celula.status];
          partes.push(
            texto(centro, y + m.alturaLinha * 0.63, STATUS_CURTO[celula.status], {
              tamanho: m.fonteHoraSaida,
              peso: '600',
              cor: aparencia.cor,
              ancora: 'middle',
            }),
          );
        }
      });

      partes.push(linhaH(xInicio, xFim, y + m.alturaLinha, COR.borda, 2));
      y += m.alturaLinha;
    });
  }

  // Grade vertical por cima das linhas, para as colunas ficarem evidentes.
  for (let i = 0; i <= 7; i++) {
    partes.push(linhaV(xDia(i), yGradeInicio, y, COR.borda, 2));
  }
  partes.push(linhaH(xInicio, xFim, yGradeInicio, COR.borda, 2));

  // Rodapé ancorado no fim da folha (ver a escala do dia).
  const altura = m.alturaFolha;
  partes.push(
    rodape(largura, MARGEM_SEMANA, altura - alturaPe, logo, geradoEm, loja),
  );

  return {
    svg: envelope(largura, altura, partes.join('')),
    largura,
    altura,
    orientacao: 'paisagem',
  };
}

/* ------------------------------------------------------------------ */
/* Saídas                                                              */
/* ------------------------------------------------------------------ */

/**
 * Documento HTML de uma página para impressão/PDF, com o SVG ocupando a folha.
 *
 * A folha acompanha a orientação do desenho (retrato no dia, paisagem na
 * semana), e a altura é livre: a escala é um documento contínuo, então forçá-la
 * em A4 cortaria pessoas no meio.
 */
export function htmlDeImpressao(imagem: ImagemEscala, titulo: string): string {
  const paisagem = imagem.orientacao === 'paisagem';
  // Folha proporcional ao desenho, em milímetros, para não sobrar margem morta.
  const larguraMm = paisagem ? 297 : 210;
  const alturaMm = Math.max(
    paisagem ? 210 : 297,
    Math.round((imagem.altura / imagem.largura) * larguraMm),
  );
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>${esc(titulo)}</title>
<style>
  @page { size: ${larguraMm}mm ${alturaMm}mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #FFFFFF; }
  svg { display: block; width: 100%; height: auto; }
</style>
</head>
<body>${imagem.svg}</body>
</html>`;
}

/** Nome de arquivo previsível para a escala baixada. */
export function nomeArquivoEscala(
  tipo: 'dia' | 'semana',
  referenciaISO: string,
  extensao: 'png' | 'pdf',
): string {
  return `escala-${tipo}-${referenciaISO.slice(0, 10)}.${extensao}`;
}
