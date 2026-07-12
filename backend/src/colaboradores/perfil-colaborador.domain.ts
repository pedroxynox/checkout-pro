/**
 * Lógica de domínio **pura** do Perfil Inteligente do Colaborador.
 *
 * Concentra, sem depender do Nest nem do Prisma, as decisões que tornam o
 * perfil "inteligente" e determinístico (custo zero, sem IA):
 *  - cálculo do **Score de Saúde** (0–100 + semáforo) por papel;
 *  - geração do **resumo automático em linguagem natural** por regras;
 *  - geração de **insígnias/destaques** (gamificação);
 *  - utilitários de ranking, média e resolução de identificadores.
 *
 * Por serem puras, podem ser exercitadas por testes sem infraestrutura.
 */

import { normalizarLogin, normalizarMatricula } from './colaboradores.domain';

/** Sentido de um indicador: arrecadar mais ou cancelar/devolver menos. */
export type SentidoIndicador = 'MAIOR_MELHOR' | 'MENOR_MELHOR';

/** Formato de exibição do valor de um indicador. */
export type FormatoIndicador = 'MOEDA' | 'NUMERO';

/** Um ponto de série (mês) para os gráficos de evolução. */
export interface PontoSerie {
  rotulo: string;
  valor: number;
}

/** Indicador do perfil (com ranking, tendência e comparação à equipe). */
export interface IndicadorPerfil {
  /** Chave do indicador (ex.: TROCO_SOLIDARIO, CUPONS_AUTORIZADOS). */
  chave: string;
  titulo: string;
  /** Valor do colaborador no período (R$ ou contagem). */
  valor: number;
  formato: FormatoIndicador;
  /** Quantidade associada (ex.: itens/cupons), quando aplicável. */
  quantidade: number | null;
  sentido: SentidoIndicador;
  /** Posição no ranking (1 = primeiro por valor); null se ninguém pontuou. */
  posicao: number | null;
  /** Total de participantes com movimento neste indicador. */
  totalParticipantes: number;
  /** Variação vs. período anterior (valor atual − anterior). */
  tendencia: number;
  /** Média da equipe (entre participantes com movimento). */
  mediaEquipe: number;
  /** Evolução por mês (últimos meses) para o gráfico de barras. */
  serie: PontoSerie[];
}

/** Componente do score (sub-nota 0–100 com peso). */
export interface ComponenteScore {
  chave: string;
  rotulo: string;
  valor: number;
  peso: number;
}

export type NivelSaude = 'BOM' | 'ATENCAO' | 'CRITICO';

/** Score de Saúde do Colaborador (0–100 + semáforo). */
export interface ScoreSaude {
  valor: number;
  nivel: NivelSaude;
  componentes: ComponenteScore[];
}

/** Insígnia/destaque (gamificação). */
export interface Insignia {
  id: string;
  titulo: string;
  descricao: string;
  /** Nome do ícone Ionicons sugerido para o app. */
  icone: string;
}

/** Entrada para o cálculo do score (montada pelo serviço). */
export interface EntradaScore {
  /** Taxa de absenteísmo no período (0–100). */
  taxaFaltas: number;

  /**
   * Não-retornos do intervalo (ponderados pela justificativa) no período. Um
   * não-retorno é presença incompleta: além de pesar na Disciplina, reduz a
   * Assiduidade — nenhuma das duas fica perfeita quando há não-retorno.
   */
  naoRetornosPonderados?: number;

  /**
   * Operador — Contribuição (indicadores "maior é melhor"):
   * aporte real (troco + recargas) e a meta individual derivada do período.
   * `metaIndividualPeriodo` é calculada pelo serviço (ou pelo helper puro
   * `metaIndividualDerivada`) e pode ser `null` (indefinida → sub-nota neutra).
   */
  contribuicao?: {
    /** Soma de TROCO_SOLIDARIO + RECARGAS_CELULAR do operador no período. */
    aporteReal: number;
    /** Meta individual do período (R$); null = indefinida → sub-nota neutra. */
    metaIndividualPeriodo: number | null;
  };

  /**
   * Operador — Disciplina (indicadores "menor é melhor"):
   * cancelamentos (itens + cupom) vs. linha de base da equipe + não-retornos.
   */
  disciplina?: {
    /** Soma de CANCELAMENTO_ITENS + CANCELAMENTO_CUPOM do operador. */
    cancelamentos: number;
    /** Linha de base justa: soma das médias da equipe dos dois cancelamentos. */
    linhaBaseCancelamentos: number;
    /**
     * Soma **ponderada** das incidências disciplinares do operador no período
     * (não-retorno, atraso, saída antecipada, retorno tardio, advertência —
     * ver ADR 0010). Justificadas pesam menos (ADR 0009).
     */
    incidenciasDisciplinares: number;
  };

  /** Fiscal: atividade (devoluções + cupons autorizados) vs. média da equipe. */
  atividade?: { valor: number; media: number };
}

/**
 * Constantes de calibração do Score de Saúde. Ficam nomeadas para que o modelo
 * de pontuação seja transparente, determinístico e fácil de ajustar.
 */
/** Sub-nota neutra determinística usada quando faltam dados (ex.: meta indefinida). */
const NEUTRA = 50;
/** Peso do componente de Assiduidade na média ponderada. */
const PESO_ASSIDUIDADE = 0.4;
/** Peso do componente de Contribuição na média ponderada. */
const PESO_CONTRIBUICAO = 0.3;
/** Peso do componente de Disciplina na média ponderada. */
const PESO_DISCIPLINA = 0.3;
/** Peso do componente de Atividade (fiscal) na média ponderada. */
const PESO_ATIVIDADE = 0.4;
/** Sensibilidade da penalização de cancelamentos acima da linha de base. */
const FATOR_CANCELAMENTO = 50;
/** Pontos subtraídos da Disciplina por cada incidência disciplinar (ponderada). */
const PENAL_POR_INCIDENCIA = 20;
/**
 * Pontos subtraídos da Assiduidade por cada não-retorno do intervalo
 * (ponderado). Um não-retorno é presença incompleta: pesa (menos que na
 * Disciplina) também na Assiduidade — assim nenhuma das duas fica perfeita.
 */
const PENAL_ASSIDUIDADE_NAO_RETORNO = 8;

const NOMES_MES = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

/** Rótulo curto de mês (0=Jan..11=Dez). */
export function rotuloMes(mes: number): string {
  return NOMES_MES[((mes % 12) + 12) % 12];
}

/** Limita um número ao intervalo [min, max]. */
export function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Normaliza um nome para comparação (sem acentos, maiúsculas, sem espaços
 * extras). Usado para casar o autorizador de cupom (que vem só por nome) com o
 * fiscal cadastrado.
 */
export function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve a quem pertence um código bruto de um movimento, usando os mapas de
 * identificadores (valor normalizado → colaboradorId). A preferência depende do
 * tipo do arquivo: cupom/devoluções guardam **matrícula**; troco/recargas/
 * cancelamento de itens guardam o **login/código de operador**.
 */
export function resolverColaboradorId(
  tipo: string,
  codigoBruto: string | null | undefined,
  mapaMatricula: ReadonlyMap<string, string>,
  mapaLogin: ReadonlyMap<string, string>,
): string | undefined {
  if (!codigoBruto || codigoBruto.trim() === '') return undefined;
  const comoMatricula = normalizarMatricula(codigoBruto);
  const comoLogin = normalizarLogin(codigoBruto);
  if (tipo === 'CANCELAMENTO_CUPOM' || tipo === 'DEVOLUCOES') {
    return mapaMatricula.get(comoMatricula) ?? mapaLogin.get(comoLogin);
  }
  return mapaLogin.get(comoLogin) ?? mapaMatricula.get(comoMatricula);
}

/** Identificador cru de um colaborador (como vem do banco). */
export interface IdentificadorBruto {
  colaboradorId: string;
  tipo: string;
  valor: string;
}

/** Dados mínimos de um colaborador para o vínculo. */
export interface ColaboradorBasico {
  id: string;
  nome: string;
  funcao: string;
}

/**
 * Vínculo entre os movimentos (RegistroArrecadacao) e os colaboradores
 * **cadastrados**. Permite resolver o dono de um lançamento pelo código cru
 * (matrícula/login) e recuperar nome/função. Movimentos cujo código não casa
 * com nenhum identificador cadastrado são considerados **não cadastrados**.
 */
export interface VinculoColaboradores {
  /** Id do colaborador dono do código, ou undefined se não cadastrado. */
  idDe(tipo: string, codigo: string | null | undefined): string | undefined;
  nome(id: string): string;
  funcao(id: string): string;
}

/**
 * Monta o vínculo (puro) a partir dos identificadores e colaboradores
 * cadastrados. Reaproveita `resolverColaboradorId` para casar cupom/devoluções
 * por matrícula e troco/recargas/cancelamento de itens por login.
 */
export function montarVinculo(
  identificadores: readonly IdentificadorBruto[],
  colaboradores: readonly ColaboradorBasico[],
): VinculoColaboradores {
  const mapaMatricula = new Map<string, string>();
  const mapaLogin = new Map<string, string>();
  for (const i of identificadores) {
    if (i.tipo === 'MATRICULA') mapaMatricula.set(i.valor, i.colaboradorId);
    else mapaLogin.set(i.valor, i.colaboradorId);
  }
  const info = new Map<string, ColaboradorBasico>();
  for (const c of colaboradores) info.set(c.id, c);
  return {
    idDe: (tipo, codigo) =>
      resolverColaboradorId(tipo, codigo, mapaMatricula, mapaLogin),
    nome: (id) => info.get(id)?.nome ?? '',
    funcao: (id) => info.get(id)?.funcao ?? '',
  };
}

/**
 * Posição (1-based) de um colaborador num ranking por valor decrescente, e o
 * total de participantes (valor > 0). Retorna posicao=null quando o
 * colaborador não pontuou (valor ≤ 0) ou não há participantes.
 */
export function rankingPorValor(
  totaisPorColaborador: ReadonlyMap<string, number>,
  colaboradorId: string,
): { posicao: number | null; total: number; media: number } {
  const valores = [...totaisPorColaborador.entries()].filter(([, v]) => v > 0);
  const total = valores.length;
  if (total === 0) return { posicao: null, total: 0, media: 0 };
  const soma = valores.reduce((s, [, v]) => s + v, 0);
  const media = Math.round((soma / total) * 100) / 100;
  const meu = totaisPorColaborador.get(colaboradorId) ?? 0;
  if (meu <= 0) return { posicao: null, total, media };
  const acima = valores.filter(([, v]) => v > meu).length;
  return { posicao: acima + 1, total, media };
}

/**
 * Meta individual do período para um indicador "maior é melhor".
 *
 * Fórmula (period-level, dimensionalmente consistente):
 *   metaIndividualPeriodo =
 *     (metaGlobalMensal / nOperadoresAtivos) * (diasEscaladosPeriodo / diasUteisMes)
 *
 * Retorna `null` (indefinida) quando qualquer insumo é `<= 0` (ou não-finito),
 * evitando divisão por zero. Quando todos os insumos são estritamente
 * positivos, o resultado é finito e estritamente positivo.
 */
export function metaIndividualDerivada(p: {
  metaGlobalMensal: number;
  nOperadoresAtivos: number;
  diasEscaladosPeriodo: number;
  diasUteisMes: number;
}): number | null {
  const {
    metaGlobalMensal,
    nOperadoresAtivos,
    diasEscaladosPeriodo,
    diasUteisMes,
  } = p;
  // `!(x > 0)` também rejeita NaN, garantindo saída definida ou null.
  if (
    !(metaGlobalMensal > 0) ||
    !(nOperadoresAtivos > 0) ||
    !(diasEscaladosPeriodo > 0) ||
    !(diasUteisMes > 0)
  ) {
    return null;
  }
  return (
    (metaGlobalMensal / nOperadoresAtivos) *
    (diasEscaladosPeriodo / diasUteisMes)
  );
}

/**
 * Conta os dias de `[inicio, fim]` (inclusivo em ambos os extremos) cujo
 * dia-da-semana (UTC) difere de `folgaDiaSemana` (0=Dom..6=Sáb). Determinístico
 * e puro: percorre dia a dia em UTC, sem depender de fuso local nem de `Date.now`.
 */
export function contarDiasEscalados(
  folgaDiaSemana: number,
  inicio: Date,
  fim: Date,
): number {
  let count = 0;
  const d = new Date(
    Date.UTC(
      inicio.getUTCFullYear(),
      inicio.getUTCMonth(),
      inicio.getUTCDate(),
    ),
  );
  const fimDia = Date.UTC(
    fim.getUTCFullYear(),
    fim.getUTCMonth(),
    fim.getUTCDate(),
  );
  while (d.getTime() <= fimDia) {
    if (d.getUTCDay() !== folgaDiaSemana) count += 1;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

/**
 * Sub-nota de Contribuição (0–100) proporcional a `aporteReal / meta`.
 * Meta indefinida (`null`) → sub-nota neutra determinística. Vale exatamente
 * 100 quando `aporteReal >= metaIndividualPeriodo`; sempre limitada a [0,100].
 */
export function notaContribuicao(
  aporteReal: number,
  metaIndividualPeriodo: number | null,
): number {
  if (metaIndividualPeriodo === null) return NEUTRA;
  return clamp((aporteReal / metaIndividualPeriodo) * 100, 0, 100);
}

/**
 * Sub-nota de Disciplina (0–100): parte da nota de cancelamentos vs. a linha de
 * base da equipe e aplica a penalidade pelas incidências disciplinares (soma
 * ponderada de não-retornos, atrasos, saídas antecipadas, retornos tardios e
 * advertências — ver ADR 0010). É um **único** componente. Sempre em [0,100];
 * vale 100 quando o operador está em/abaixo da linha de base e não teve
 * incidências.
 */
export function notaDisciplina(d: {
  cancelamentos: number;
  linhaBaseCancelamentos: number;
  incidenciasDisciplinares: number;
}): number {
  const { cancelamentos, linhaBaseCancelamentos, incidenciasDisciplinares } = d;
  const notaCancel =
    linhaBaseCancelamentos > 0
      ? clamp(
          100 -
            ((cancelamentos - linhaBaseCancelamentos) /
              linhaBaseCancelamentos) *
              FATOR_CANCELAMENTO,
        )
      : cancelamentos > 0
        ? clamp(100 - FATOR_CANCELAMENTO)
        : 100;
  return clamp(
    notaCancel - incidenciasDisciplinares * PENAL_POR_INCIDENCIA,
    0,
    100,
  );
}

/**
 * Sub-nota de Assiduidade (0–100) a partir da taxa de faltas (%) e dos
 * não-retornos do intervalo (ponderados). Monótona decrescente em ambos;
 * sempre limitada a [0,100]. Com `naoRetornosPonderados = 0` equivale ao
 * cálculo antigo (só faltas).
 */
export function notaAssiduidade(
  taxaFaltas: number,
  naoRetornosPonderados = 0,
): number {
  return clamp(
    100 -
      taxaFaltas * 3 -
      naoRetornosPonderados * PENAL_ASSIDUIDADE_NAO_RETORNO,
    0,
    100,
  );
}

/**
 * Score de Saúde do Colaborador (0–100). Combina assiduidade (sempre) com
 * contribuição/disciplina (operador) ou atividade (fiscal). Os pesos dos
 * componentes presentes são normalizados, então o score é sempre 0–100. É
 * determinístico: sem IA, sem `Date.now()`, sem aleatoriedade.
 */
export function calcularScore(e: EntradaScore): ScoreSaude {
  const componentes: ComponenteScore[] = [];

  componentes.push({
    chave: 'assiduidade',
    rotulo: 'Assiduidade',
    valor: Math.round(
      notaAssiduidade(e.taxaFaltas, e.naoRetornosPonderados ?? 0),
    ),
    peso: PESO_ASSIDUIDADE,
  });

  if (e.contribuicao) {
    componentes.push({
      chave: 'contribuicao',
      rotulo: 'Contribuição',
      valor: Math.round(
        notaContribuicao(
          e.contribuicao.aporteReal,
          e.contribuicao.metaIndividualPeriodo,
        ),
      ),
      peso: PESO_CONTRIBUICAO,
    });
  }

  if (e.disciplina) {
    componentes.push({
      chave: 'disciplina',
      rotulo: 'Disciplina',
      valor: Math.round(notaDisciplina(e.disciplina)),
      peso: PESO_DISCIPLINA,
    });
  }

  if (e.atividade) {
    const { valor, media } = e.atividade;
    const nota = media > 0 ? clamp((valor / media) * 60) : valor > 0 ? 80 : 50;
    componentes.push({
      chave: 'atividade',
      rotulo: 'Atividade',
      valor: Math.round(nota),
      peso: PESO_ATIVIDADE,
    });
  }

  const somaPesos = componentes.reduce((s, c) => s + c.peso, 0) || 1;
  const valor = Math.round(
    componentes.reduce((s, c) => s + c.valor * c.peso, 0) / somaPesos,
  );
  const nivel: NivelSaude =
    valor >= 80 ? 'BOM' : valor >= 60 ? 'ATENCAO' : 'CRITICO';
  return { valor, nivel, componentes };
}

/** Formata um número como R$ (pt-BR) para os textos do resumo. */
function reais(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Posição em texto ("1º", "2º"...). */
function ordinal(posicao: number): string {
  return `${posicao}º`;
}

/** Parâmetros para o resumo automático em linguagem natural. */
export interface EntradaResumo {
  nome: string;
  funcao: string;
  score: ScoreSaude;
  indicadores: IndicadorPerfil[];
  faltas: { total: number; taxa: number; risco: string };
  /** Não-retornos do intervalo NÃO justificados no período. */
  naoRetornos: number;
}

/**
 * Gera o resumo automático em **linguagem natural** (regras determinísticas,
 * sem IA). Devolve uma lista de frases curtas (bullets) sobre saúde, destaques,
 * pontos de atenção e assiduidade.
 */
export function gerarResumo(e: EntradaResumo): string[] {
  const frases: string[] = [];
  const primeiro = e.nome.split(' ')[0];

  // 1) Saúde geral.
  if (e.score.nivel === 'BOM') {
    frases.push(
      `${primeiro} está com ótimo desempenho geral (saúde ${e.score.valor}/100).`,
    );
  } else if (e.score.nivel === 'ATENCAO') {
    frases.push(
      `${primeiro} está em desempenho mediano (saúde ${e.score.valor}/100) — há pontos a melhorar.`,
    );
  } else {
    frases.push(`${primeiro} precisa de atenção (saúde ${e.score.valor}/100).`);
  }

  // 2) Destaques positivos (liderança em indicadores "maior melhor").
  const lideranca = e.indicadores.find(
    (i) => i.sentido === 'MAIOR_MELHOR' && i.posicao === 1 && i.valor > 0,
  );
  if (lideranca) {
    frases.push(
      `Lidera a equipe em ${lideranca.titulo} com ${
        lideranca.formato === 'MOEDA' ? reais(lideranca.valor) : lideranca.valor
      }.`,
    );
  } else {
    const bom = e.indicadores.find(
      (i) =>
        i.sentido === 'MAIOR_MELHOR' &&
        i.posicao !== null &&
        i.posicao <= 3 &&
        i.valor > 0,
    );
    if (bom && bom.posicao) {
      frases.push(
        `Está entre os melhores em ${bom.titulo} (${ordinal(bom.posicao)} lugar).`,
      );
    }
  }

  // 3) Pontos de atenção (indicadores "menor melhor" acima da média).
  const atencao = e.indicadores.find(
    (i) =>
      i.sentido === 'MENOR_MELHOR' &&
      i.valor > i.mediaEquipe &&
      i.mediaEquipe > 0,
  );
  if (atencao) {
    frases.push(
      `${atencao.titulo} acima da média da equipe (${
        atencao.formato === 'MOEDA' ? reais(atencao.valor) : atencao.valor
      } vs ${atencao.formato === 'MOEDA' ? reais(atencao.mediaEquipe) : atencao.mediaEquipe}).`,
    );
  }

  // 4) Tendência num indicador relevante.
  const subindo = e.indicadores.find(
    (i) => i.sentido === 'MAIOR_MELHOR' && i.tendencia > 0,
  );
  if (subindo) {
    frases.push(`${subindo.titulo} em alta vs. o período anterior.`);
  }

  // 5) Assiduidade (faltas + não-retornos do intervalo). Só é "exemplar"
  // quando não houve faltas NEM não-retornos.
  if (e.faltas.total === 0 && e.naoRetornos === 0) {
    frases.push(
      'Sem faltas nem não-retornos no período — assiduidade exemplar.',
    );
  } else if (e.faltas.total === 0) {
    frases.push('Sem faltas no período.');
  } else if (e.faltas.risco === 'ALTO') {
    frases.push(
      `Risco ALTO de faltas: ${e.faltas.total} no período (${e.faltas.taxa}% de absenteísmo).`,
    );
  } else {
    frases.push(
      `${e.faltas.total} falta(s) no período (${e.faltas.taxa}% de absenteísmo).`,
    );
  }

  // 6) Não-retornos do intervalo (indisciplina de presença) — ponto de atenção.
  if (e.naoRetornos > 0) {
    frases.push(
      `${e.naoRetornos} não-retorno(s) do intervalo no período — atenção à disciplina.`,
    );
  }

  return frases;
}

/** Parâmetros para as insígnias. */
export interface EntradaInsignias {
  score: ScoreSaude;
  indicadores: IndicadorPerfil[];
  faltas: { total: number; risco: string };
  /** Não-retornos do intervalo NÃO justificados no período. */
  naoRetornos: number;
}

/**
 * Gera as insígnias/destaques (gamificação) a partir dos sinais determinísticos
 * do período. Quanto melhor o desempenho, mais insígnias.
 */
export function gerarInsignias(e: EntradaInsignias): Insignia[] {
  const insignias: Insignia[] = [];

  // "Assíduo" exige presença completa: nenhuma falta E nenhum não-retorno do
  // intervalo (não justificado) no período.
  if (e.faltas.total === 0 && e.naoRetornos === 0) {
    insignias.push({
      id: 'assiduo',
      titulo: 'Assíduo',
      descricao: 'Nenhuma falta nem não-retorno no período.',
      icone: 'checkmark-done-circle',
    });
  }

  if (e.score.valor >= 85) {
    insignias.push({
      id: 'destaque',
      titulo: 'Destaque do período',
      descricao: 'Saúde geral acima de 85.',
      icone: 'star',
    });
  }

  for (const i of e.indicadores) {
    if (i.sentido === 'MAIOR_MELHOR' && i.posicao === 1 && i.valor > 0) {
      insignias.push({
        id: `top-${i.chave.toLowerCase()}`,
        titulo: `Top ${i.titulo}`,
        descricao: `1º lugar em ${i.titulo}.`,
        icone: 'trophy',
      });
    }
  }

  // Disciplina: cancelamentos abaixo da média (bom) E sem não-retornos do
  // intervalo. Cancelamentos baixos NÃO bastam — não-retorno é indisciplina.
  const disciplina = e.indicadores.filter(
    (i) => i.sentido === 'MENOR_MELHOR' && i.mediaEquipe > 0,
  );
  if (
    e.naoRetornos === 0 &&
    disciplina.length > 0 &&
    disciplina.every((i) => i.valor <= i.mediaEquipe)
  ) {
    insignias.push({
      id: 'disciplinado',
      titulo: 'Disciplinado',
      descricao: 'Cancelamentos abaixo da média e sem não-retornos.',
      icone: 'shield-checkmark',
    });
  }

  return insignias;
}
