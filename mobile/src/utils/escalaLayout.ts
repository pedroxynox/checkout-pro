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
 * Largura da escala da SEMANA: paisagem (4K cheio).
 *
 * A semana é uma grade de 7 colunas; em retrato as colunas ficariam estreitas
 * demais para caber "07:00–15:20" sem apertar a fonte.
 */
export const LARGURA_SEMANA = 3840;

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

/** Rótulo curto do turno do cadastro. */
const TITULO_TURNO: Record<string, string> = {
  ABERTURA: 'Abertura',
  INTERMEDIARIO: 'Intermediário',
  FECHAMENTO: 'Fechamento',
  APOIO: 'Apoio',
};

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
  const maxChars = Math.floor(larguraMax / (tamanhoFonte * 0.52));
  if (texto.length <= maxChars) return texto;
  return `${texto.slice(0, Math.max(1, maxChars - 1))}…`;
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
): { svg: string; altura: number } {
  const partes: string[] = [linhaH(margem, largura - margem, y, COR.borda, 3)];
  let cursor = y + 60;

  if (logo) {
    const larguraLogo = Math.min(760, largura - margem * 2);
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
  return { svg: partes.join(''), altura: cursor + 26 + 40 - y };
}

/** Envelope do SVG com fundo branco. */
function envelope(largura: number, altura: number, conteudo: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}">${retangulo(0, 0, largura, altura, COR.branco)}${conteudo}</svg>`;
}

/* ------------------------------------------------------------------ */
/* Escala do DIA (retrato)                                             */
/* ------------------------------------------------------------------ */

const MARGEM_DIA = 90;
const ALTURA_LINHA_DIA = 104;
const ALTURA_TITULO_SECAO = 78;

/** Uma linha de pessoa na escala do dia. */
function linhaPessoaDia(
  largura: number,
  y: number,
  linha: LinhaEscala,
  zebra: boolean,
): string {
  const partes: string[] = [];
  const x = MARGEM_DIA;
  const fim = largura - MARGEM_DIA;
  if (zebra) {
    // Recuado 3 px no topo de propósito: o fundo começa exatamente onde está o
    // separador da linha ANTERIOR e, sendo pintado depois, o apagaria — as
    // linhas entre nomes desapareceriam em toda linha zebrada.
    partes.push(retangulo(x, y + 3, fim - x, ALTURA_LINHA_DIA - 3, COR.zebra));
  }

  const baseTexto = y + ALTURA_LINHA_DIA * 0.62;
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
  const larguraHorario = 460;

  if (trabalha) {
    partes.push(
      texto(fim, baseTexto, horario, {
        tamanho: 46,
        peso: '700',
        cor: COR.texto,
        ancora: 'end',
      }),
    );
  } else {
    partes.push(
      texto(fim, baseTexto - (horario ? 18 : 0), aparencia.rotulo, {
        tamanho: 42,
        peso: '700',
        cor: aparencia.cor,
        ancora: 'end',
      }),
    );
    // Numa falta/atestado o turno previsto continua visível: é o que diz qual
    // horário ficou descoberto.
    if (horario) {
      partes.push(
        texto(fim, baseTexto + 26, horario, {
          tamanho: 30,
          cor: COR.textoSec,
          ancora: 'end',
        }),
      );
    }
  }

  // Coluna da esquerda: nome e, abaixo, o turno do cadastro.
  const larguraNome = fim - x - larguraHorario - 40;
  const turnoRotulo = linha.turno ? TITULO_TURNO[linha.turno] ?? linha.turno : null;
  const complemento = [turnoRotulo, linha.horarioEspecial ? 'Horário especial' : null]
    .filter(Boolean)
    .join(' · ');
  partes.push(
    texto(x + 8, baseTexto - (complemento ? 18 : 0), encurtar(linha.nome, larguraNome, 46), {
      tamanho: 46,
      peso: '600',
      cor: trabalha ? COR.texto : COR.textoSec,
    }),
  );
  if (complemento) {
    // +26 (e não mais): a descida das letras precisa terminar acima do separador,
    // senão o "g" de "Fechamento" encosta na linha da próxima pessoa.
    partes.push(
      texto(x + 8, baseTexto + 26, complemento, {
        tamanho: 28,
        cor: COR.textoSec,
      }),
    );
  }

  // Separador em `borda`, não em `divisor`: a linha entre nomes é um pedido
  // explícito do documento, e no tom mais claro ela praticamente não aparecia.
  partes.push(linhaH(x, fim, y + ALTURA_LINHA_DIA, COR.borda, 2));
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

  // Seções por função.
  for (const secao of escala.secoes) {
    y += 56;
    partes.push(
      retangulo(MARGEM_DIA, y, largura - MARGEM_DIA * 2, ALTURA_TITULO_SECAO, COR.primariaClara, 12),
    );
    partes.push(
      texto(
        MARGEM_DIA + 26,
        y + ALTURA_TITULO_SECAO * 0.66,
        TITULO_FUNCAO[secao.funcao] ?? secao.funcao,
        { tamanho: 42, peso: '700', cor: COR.primariaEscura },
      ),
    );
    partes.push(
      texto(
        largura - MARGEM_DIA - 26,
        y + ALTURA_TITULO_SECAO * 0.66,
        `${secao.linhas.length} pessoa${secao.linhas.length === 1 ? '' : 's'}`,
        { tamanho: 32, cor: COR.primaria, peso: '600', ancora: 'end' },
      ),
    );
    y += ALTURA_TITULO_SECAO + 8;

    secao.linhas.forEach((linha, i) => {
      partes.push(linhaPessoaDia(largura, y, linha, i % 2 === 1));
      y += ALTURA_LINHA_DIA;
    });
  }

  y += 70;
  const pe = rodape(largura, MARGEM_DIA, y, logo, geradoEm, loja);
  partes.push(pe.svg);
  const altura = y + pe.altura;

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
const ALTURA_LINHA_SEMANA = 124;
const ALTURA_CABECALHO_GRADE = 130;

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

  for (const secao of escala.secoes) {
    // Faixa da função dentro da grade.
    partes.push(retangulo(xInicio, y, xFim - xInicio, 66, COR.divisor));
    partes.push(
      texto(xInicio + 26, y + 46, (TITULO_FUNCAO[secao.funcao] ?? secao.funcao).toUpperCase(), {
        tamanho: 30,
        peso: '700',
        cor: COR.primaria,
        espacamento: 4,
      }),
    );
    y += 66;

    secao.pessoas.forEach((pessoa, idx) => {
      if (idx % 2 === 1) {
        // Recuado no topo pelo mesmo motivo da escala do dia: sem isso o fundo
        // apaga o separador da linha anterior.
        partes.push(
          retangulo(xInicio, y + 3, xFim - xInicio, ALTURA_LINHA_SEMANA - 3, COR.zebra),
        );
      }
      const turnoRotulo = pessoa.turno
        ? (TITULO_TURNO[pessoa.turno] ?? pessoa.turno)
        : null;
      partes.push(
        texto(
          xInicio + 26,
          y + (turnoRotulo ? 56 : ALTURA_LINHA_SEMANA * 0.62),
          encurtar(pessoa.nome, LARGURA_NOME_SEMANA - 52, 42),
          { tamanho: 42, peso: '600' },
        ),
      );
      if (turnoRotulo) {
        partes.push(
          texto(xInicio + 26, y + 96, turnoRotulo, {
            tamanho: 28,
            cor: COR.textoSec,
          }),
        );
      }

      pessoa.celulas.forEach((celula, i) => {
        const centro = xDia(i) + larguraDia / 2;
        if (celula.status === 'TRABALHA' && celula.entrada) {
          partes.push(
            texto(centro, y + 52, celula.entrada, {
              tamanho: 38,
              peso: '700',
              ancora: 'middle',
            }),
          );
          if (celula.saida) {
            partes.push(
              texto(centro, y + 96, celula.saida, {
                tamanho: 34,
                cor: COR.textoSec,
                ancora: 'middle',
              }),
            );
          }
        } else {
          const aparencia = APARENCIA_STATUS[celula.status];
          partes.push(
            texto(centro, y + ALTURA_LINHA_SEMANA * 0.6, STATUS_CURTO[celula.status], {
              tamanho: 34,
              peso: '600',
              cor: aparencia.cor,
              ancora: 'middle',
            }),
          );
        }
      });

      partes.push(linhaH(xInicio, xFim, y + ALTURA_LINHA_SEMANA, COR.borda, 2));
      y += ALTURA_LINHA_SEMANA;
    });
  }

  // Grade vertical por cima das linhas, para as colunas ficarem evidentes.
  for (let i = 0; i <= 7; i++) {
    partes.push(linhaV(xDia(i), yGradeInicio, y, COR.borda, 2));
  }
  partes.push(linhaH(xInicio, xFim, yGradeInicio, COR.borda, 2));

  y += 70;
  const pe = rodape(largura, MARGEM_SEMANA, y, logo, geradoEm, loja);
  partes.push(pe.svg);
  const altura = y + pe.altura;

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
