/**
 * Lógica **pura** do relatório de MARCAÇÕES INVÁLIDAS do Relógio Ponto.
 *
 * `calcularJornadaDia` (em [`ponto.domain`](./ponto.domain.ts)) responde "este
 * dia está incompleto?" e, para isso, basta-lhe assumir que a 1ª batida é a
 * entrada, a 2ª a saída para o intervalo, e assim por diante — a classificação
 * é **posicional**. Serve para o cálculo das horas, mas é insuficiente para
 * corrigir o ponto: quem esquece justamente a ENTRADA desloca todos os tipos e
 * o dia acaba apontado como "falta o encerramento", quando o que falta é a
 * entrada.
 *
 * Este módulo existe para responder à pergunta seguinte, a do gestor que vai
 * ajustar o ponto: **quantas marcações faltam e QUAIS**. Ele decide se a 1ª
 * batida do dia pode mesmo ser a entrada comparando-a com o **turno da escala**
 * (`entradaPrevista`), e usa a duração entre as batidas para distinguir os
 * casos do meio do dia. Quando os dados não permitem afirmar, devolve
 * `confianca: 'BAIXA'` com uma observação — nunca inventa uma resposta.
 *
 * Sem efeitos colaterais e sem I/O: recebe as horas do dia e o turno esperado,
 * devolve a análise. As horas chegam em hora de parede de Brasília rotulada
 * UTC (mesma referência do "HH:mm" do turno), por isso os componentes UTC são
 * comparados diretamente — igual a `minutosDeAtraso` em `escala-domingo`.
 */
import { hhmmParaMinutos } from './deteccao-automatica.domain';
import { REGRAS_PADRAO, RegrasContrato } from './ponto.domain';

/**
 * As quatro marcações de um dia completo, **na ordem em que acontecem**. É a
 * sequência canônica do relógio: entrada, saída para o intervalo, retorno do
 * intervalo e encerramento. Batidas `EXTRA` (5ª em diante) não entram — não
 * fazem parte do dia esperado e não são objeto de ajuste.
 */
export const SEQUENCIA_MARCACOES = [
  'ENTRADA',
  'SAIDA_INTERVALO',
  'RETORNO_INTERVALO',
  'ENCERRAMENTO',
] as const;

/** Uma das quatro marcações canônicas do dia. */
export type MarcacaoCanonica = (typeof SEQUENCIA_MARCACOES)[number];

/** Quantas marcações um dia completo tem (4). */
export const MARCACOES_ESPERADAS_DIA = SEQUENCIA_MARCACOES.length;

/**
 * Minutos após o horário do turno a partir dos quais a 1ª batida do dia **não
 * pode mais ser a entrada** — ou seja, a entrada foi esquecida.
 *
 * 3h é folgado de propósito: um atraso real, mesmo grave, fica na casa dos
 * minutos (a tolerância da escala é de 15 min e a falta automática é lançada
 * 2h depois do turno). Quem só aparece 3h após o horário não começou o dia
 * ali — aquela batida é a saída para o intervalo. A folga evita transformar
 * atraso legítimo em "entrada faltando".
 */
export const MARGEM_ENTRADA_AUSENTE_MIN = 180;

/**
 * Grau de certeza da análise:
 *  - `ALTA`: os dados sustentam quais marcações faltam;
 *  - `BAIXA`: o resultado é a hipótese mais provável, mas precisa de
 *    conferência humana (o motivo vem em `observacao`).
 */
export type ConfiancaAnalise = 'ALTA' | 'BAIXA';

/** Resultado da análise das marcações de UM dia de UMA pessoa. */
export interface AnaliseMarcacoesDia {
  /** Quantas marcações o dia deveria ter (4). */
  esperadas: number;
  /** Quantas foram efetivamente registradas. */
  registradas: number;
  /** Quantas faltam (`esperadas − registradas`, piso 0). */
  quantidadeFaltante: number;
  /** QUAIS marcações faltam, na ordem do dia. */
  tiposFaltantes: MarcacaoCanonica[];
  /** Como as marcações registradas foram interpretadas, na ordem do dia. */
  tiposPresentes: MarcacaoCanonica[];
  /**
   * A entrada foi esquecida? `true`/`false` quando há turno cadastrado para
   * comparar; `null` quando não há (folga, feriado ou horário em branco) e
   * portanto não se pode afirmar.
   */
  entradaAusente: boolean | null;
  confianca: ConfiancaAnalise;
  /** Por que precisa de conferência (só quando `confianca` é `BAIXA`). */
  observacao: string | null;
}

/** Rótulo em português de uma marcação, para exibir e para os textos do relatório. */
export function rotuloMarcacao(tipo: MarcacaoCanonica): string {
  switch (tipo) {
    case 'ENTRADA':
      return 'entrada';
    case 'SAIDA_INTERVALO':
      return 'saída para o intervalo';
    case 'RETORNO_INTERVALO':
      return 'retorno do intervalo';
    default:
      return 'encerramento';
  }
}

/**
 * Frase que descreve o que falta no dia ("Falta registrar: entrada" /
 * "Faltam registrar: entrada e encerramento"). Devolve string vazia quando
 * nada falta.
 */
export function descreverFaltantes(
  tiposFaltantes: readonly MarcacaoCanonica[],
): string {
  if (tiposFaltantes.length === 0) return '';
  const rotulos = tiposFaltantes.map(rotuloMarcacao);
  const lista =
    rotulos.length === 1
      ? rotulos[0]
      : `${rotulos.slice(0, -1).join(', ')} e ${rotulos[rotulos.length - 1]}`;
  return tiposFaltantes.length === 1
    ? `Falta registrar: ${lista}`
    : `Faltam registrar: ${lista}`;
}

/** Hora de uma marcação como "HH:mm" (hora de parede de Brasília, rotulada UTC). */
export function horaMarcacaoHHmm(hora: Date): string {
  const h = String(hora.getUTCHours()).padStart(2, '0');
  const m = String(hora.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** Minutos desde a meia-noite de uma marcação (mesma referência do "HH:mm"). */
function minutosDoDia(hora: Date): number {
  return hora.getUTCHours() * 60 + hora.getUTCMinutes();
}

/**
 * A ENTRADA do dia foi esquecida? Compara a 1ª batida com o horário do turno:
 * se ela vem `margemMin` **depois** do turno, não é o começo do dia (é a saída
 * para o intervalo, ou outra marcação do meio do dia) — logo, a entrada falta.
 *
 * Devolve `null` quando não há turno válido para o dia: sem essa referência a
 * pergunta não tem resposta, e é justamente aí que a classificação posicional
 * continua sendo a única hipótese disponível.
 */
export function entradaFoiEsquecida(
  primeiraHora: Date,
  entradaPrevista: string | null,
  margemMin: number = MARGEM_ENTRADA_AUSENTE_MIN,
): boolean | null {
  const previstoMin = hhmmParaMinutos(entradaPrevista);
  if (previstoMin === null) return null;
  return minutosDoDia(primeiraHora) - previstoMin > margemMin;
}

/** Parâmetros de duração usados para interpretar as batidas do meio do dia. */
type RegrasDuracao = Pick<
  RegrasContrato,
  'maxTrabalhoSemIntervaloMs' | 'intervaloMinimoMs' | 'intervaloMaximoMs'
>;

/** Análise de um dia sem nenhuma marcação: faltam todas, sem ambiguidade. */
function diaSemMarcacoes(esperadas: number): AnaliseMarcacoesDia {
  return {
    esperadas,
    registradas: 0,
    quantidadeFaltante: esperadas,
    tiposFaltantes: [...SEQUENCIA_MARCACOES].slice(0, esperadas),
    tiposPresentes: [],
    entradaAusente: null,
    confianca: 'ALTA',
    observacao: null,
  };
}

/** Análise de um dia completo (nada falta). */
function diaCompleto(
  esperadas: number,
  registradas: number,
): AnaliseMarcacoesDia {
  return {
    esperadas,
    registradas,
    quantidadeFaltante: 0,
    tiposFaltantes: [],
    tiposPresentes: [...SEQUENCIA_MARCACOES].slice(0, esperadas),
    entradaAusente: false,
    confianca: 'ALTA',
    observacao: null,
  };
}

/**
 * Quantas marcações faltam no dia e **quais**.
 *
 * O raciocínio, em duas etapas:
 *
 * 1. **Onde ancorar a sequência.** Se a entrada foi esquecida
 *    (`entradaFoiEsquecida`), as batidas existentes são o **fim** da sequência
 *    e o que falta está no começo (a entrada, e o que mais vier antes). Caso
 *    contrário, elas são o **começo** e o que falta está no fim. Esta é a
 *    correção central em relação à classificação posicional, que só sabe
 *    ancorar no começo.
 *
 * 2. **Ajustes pelas durações**, para os casos do meio do dia (aplicados
 *    apenas quando a sequência está ancorada no começo):
 *    - **duas** batidas cobrindo mais que a jornada máxima sem intervalo: elas
 *      são entrada e encerramento, e o que falta é o **intervalo** (saída e
 *      retorno) — não o retorno e o encerramento. É o esquecimento mais comum:
 *      bateu o começo e o fim do dia, e nenhuma das duas do almoço;
 *    - **três** batidas cujo "intervalo" passa do máximo do contrato: aquele
 *      vão longo não é um intervalo real, então a 3ª batida é o encerramento e
 *      o que falta é o **retorno do intervalo**.
 *
 * Sempre que o resultado é a hipótese mais provável — e não um fato — a análise
 * volta com `confianca: 'BAIXA'` e o motivo em `observacao`, para o gestor
 * conferir o comprovante antes de ajustar.
 *
 * @param horas Horas das batidas do dia (em qualquer ordem; são ordenadas aqui).
 * @param entradaPrevista Horário do turno ("HH:mm") ou `null` quando não há.
 * @param regras Parâmetros de duração do contrato da pessoa.
 * @param esperadas Marcações esperadas no dia (4 por padrão).
 */
export function analisarMarcacoesDoDia(
  horas: readonly Date[],
  entradaPrevista: string | null,
  regras: RegrasDuracao = REGRAS_PADRAO,
  esperadas: number = MARCACOES_ESPERADAS_DIA,
): AnaliseMarcacoesDia {
  const ordenadas = [...horas].sort((a, b) => a.getTime() - b.getTime());
  const registradas = ordenadas.length;

  if (registradas === 0) return diaSemMarcacoes(esperadas);
  if (registradas >= esperadas) return diaCompleto(esperadas, registradas);

  const quantidadeFaltante = esperadas - registradas;
  const entradaAusente = entradaFoiEsquecida(ordenadas[0], entradaPrevista);
  const observacoes: string[] = [];
  let confianca: ConfiancaAnalise = 'ALTA';

  const baixa = (motivo: string): void => {
    confianca = 'BAIXA';
    observacoes.push(motivo);
  };

  // ── Etapa 1: ancorar a sequência ────────────────────────────────────────────
  let tiposPresentes: MarcacaoCanonica[];
  let tiposFaltantes: MarcacaoCanonica[];

  if (entradaAusente === true) {
    // Ancorada no FIM: as batidas são as últimas da sequência.
    tiposPresentes = [...SEQUENCIA_MARCACOES].slice(quantidadeFaltante);
    tiposFaltantes = [...SEQUENCIA_MARCACOES].slice(0, quantidadeFaltante);
    if (quantidadeFaltante > 1) {
      baixa(
        'A entrada foi esquecida e falta mais de uma marcação: confirme no comprovante quais existem antes de ajustar.',
      );
    }
  } else {
    // Ancorada no COMEÇO: as batidas são as primeiras da sequência.
    tiposPresentes = [...SEQUENCIA_MARCACOES].slice(0, registradas);
    tiposFaltantes = [...SEQUENCIA_MARCACOES].slice(registradas);

    if (entradaAusente === null) {
      baixa(
        'Sem turno cadastrado para este dia: não é possível confirmar se a 1ª marcação é a entrada.',
      );
    }

    // ── Etapa 2: ajustes pelas durações ──────────────────────────────────────
    if (registradas === 2) {
      const jornadaMs = ordenadas[1].getTime() - ordenadas[0].getTime();
      if (jornadaMs > regras.maxTrabalhoSemIntervaloMs) {
        tiposPresentes = ['ENTRADA', 'ENCERRAMENTO'];
        tiposFaltantes = ['SAIDA_INTERVALO', 'RETORNO_INTERVALO'];
        baixa(
          'As duas marcações cobrem a jornada inteira: o mais provável é que faltem as duas do intervalo.',
        );
      }
    } else if (registradas === 3) {
      const intervaloMs = ordenadas[2].getTime() - ordenadas[1].getTime();
      if (intervaloMs > regras.intervaloMaximoMs) {
        tiposPresentes = ['ENTRADA', 'SAIDA_INTERVALO', 'ENCERRAMENTO'];
        tiposFaltantes = ['RETORNO_INTERVALO'];
        baixa(
          'O vão entre a 2ª e a 3ª marcação passa do intervalo máximo do contrato: provavelmente falta o retorno do intervalo, e não o encerramento.',
        );
      } else if (intervaloMs < regras.intervaloMinimoMs) {
        baixa(
          'O intervalo registrado é menor que o mínimo do contrato: confira as marcações do dia.',
        );
      }
    }
  }

  return {
    esperadas,
    registradas,
    quantidadeFaltante,
    tiposFaltantes,
    tiposPresentes,
    entradaAusente,
    confianca,
    observacao: observacoes.length ? observacoes.join(' ') : null,
  };
}
