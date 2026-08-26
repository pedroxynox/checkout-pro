/**
 * Lógica **pura** da AUTO-CURA das ocorrências automáticas do Relógio Ponto.
 *
 * A detecção automática escreve dois tipos de "fato" sobre um dia: a **falta**
 * (escalado, sem batida, 2h após a entrada) e o **não retorno do intervalo**
 * (saiu e não voltou dentro do máximo do contrato). O problema é que esses fatos
 * podem **deixar de ser verdade depois**: a pessoa bate o ponto em atraso, o
 * gestor lança um atestado, marca férias, corrige uma batida à mão.
 *
 * Antes, cada limpeza era um remendo pendurado num evento específico (registrar
 * batida). Cobria aquele caminho e só aquele: quem chegasse por outro caminho
 * deixava a ocorrência pendurada na tela, pedindo justificativa por um fato que
 * já não existia.
 *
 * Este módulo inverte a pergunta. Em vez de "o que fazer quando acontece X?",
 * pergunta **"esta ocorrência ainda é verdade?"** — e isso independe de como ela
 * deixou de ser. É uma decisão determinística sobre os fatos do dia, sem I/O.
 *
 * **Regra de segurança que atravessa tudo:** só se avalia o que o SISTEMA criou
 * sozinho. O que uma pessoa registrou é decisão humana e nunca é apagado por
 * este caminho.
 */

/** Por que uma ocorrência automática deixou de ser verdade. */
export type MotivoRevalidacao =
  /** Apareceu batida no dia: a pessoa trabalhou, não faltou. */
  | 'BATIDA_REGISTRADA'
  /** O intervalo foi fechado depois: houve retorno, não foi abandono. */
  | 'INTERVALO_FECHADO'
  /** O dia foi coberto por atestado médico. */
  | 'ATESTADO'
  /** O dia entrou numa ausência a prazo lançada pelo gestor (licença etc.). */
  | 'AUSENCIA_A_PRAZO'
  /** A pessoa está de férias no dia: não era esperada. */
  | 'FERIAS';

/** Frase curta do motivo, para o log da auto-cura. */
export function descreverMotivo(motivo: MotivoRevalidacao): string {
  switch (motivo) {
    case 'BATIDA_REGISTRADA':
      return 'bateu ponto no dia';
    case 'INTERVALO_FECHADO':
      return 'fechou o intervalo';
    case 'ATESTADO':
      return 'dia coberto por atestado';
    case 'AUSENCIA_A_PRAZO':
      return 'dia coberto por ausência a prazo';
    default:
      return 'de férias no dia';
  }
}

/**
 * O que se sabe sobre um dia de uma pessoa no momento da revalidação. Tudo é
 * booleano de propósito: a decisão não depende de horários nem de quantidades,
 * só da existência dos fatos.
 */
export interface FatosDoDia {
  /** Existe pelo menos uma batida da pessoa no dia. */
  temBatida: boolean;
  /**
   * O intervalo do dia foi efetivamente fechado (há retorno e a jornada não está
   * mais em não-retorno). Só faz sentido para o não retorno.
   */
  intervaloFechado: boolean;
  /** O dia está coberto por um atestado médico. */
  temAtestado: boolean;
  /** O dia está coberto por uma ausência a prazo do gestor. */
  temAusenciaAPrazo: boolean;
  /** A pessoa está de férias no dia. */
  deFerias: boolean;
}

/**
 * Motivos que valem para **qualquer** ocorrência: quando o dia é coberto por
 * atestado, ausência a prazo ou férias, nada lançado automaticamente sobre ele
 * se sustenta — a pessoa não era esperada para trabalhar.
 */
function motivoDeCobertura(fatos: FatosDoDia): MotivoRevalidacao | null {
  if (fatos.temAtestado) return 'ATESTADO';
  if (fatos.temAusenciaAPrazo) return 'AUSENCIA_A_PRAZO';
  if (fatos.deFerias) return 'FERIAS';
  return null;
}

/**
 * A FALTA automática deste dia ainda é verdade? Devolve o motivo pelo qual
 * deixou de ser, ou `null` se continua válida.
 *
 * Basta **uma** batida para derrubá-la: se a pessoa registrou ponto naquele dia,
 * ela não faltou — não importa se registrou no próprio dia, no dia seguinte ou
 * se o gestor corrigiu a marcação à mão.
 */
export function motivoParaRemoverFalta(
  fatos: FatosDoDia,
): MotivoRevalidacao | null {
  if (fatos.temBatida) return 'BATIDA_REGISTRADA';
  return motivoDeCobertura(fatos);
}

/**
 * O NÃO RETORNO automático deste dia ainda é verdade? Devolve o motivo pelo qual
 * deixou de ser, ou `null` se continua válido.
 *
 * Aqui **a existência de batidas não derruba nada** — pelo contrário: o não
 * retorno pressupõe que a pessoa bateu a entrada e a saída para o intervalo. O
 * que o derruba é o intervalo ter sido **fechado** (apareceu o retorno).
 */
export function motivoParaRemoverNaoRetorno(
  fatos: FatosDoDia,
): MotivoRevalidacao | null {
  if (fatos.intervaloFechado) return 'INTERVALO_FECHADO';
  return motivoDeCobertura(fatos);
}

/**
 * Filtro do que a auto-cura pode apagar: uma **falta automática pendente**.
 *
 * A marca `automatica` sozinha não basta. Quando um atestado (ou uma ausência a
 * prazo) converte uma falta existente, a linha é reaproveitada e **continua com
 * `automatica = true`** — é o histórico de como ela nasceu. Se a auto-cura
 * olhasse só essa marca, apagaria um dia de atestado legítimo e deixaria o
 * atestado com um buraco, em silêncio.
 *
 * Por isso o que define "ainda é uma falta automática pendente" é: nasceu
 * automática **e** não foi convertida em nada (`atestadoId` vazio e não `aPrazo`).
 */
export function ehFaltaAutomaticaPendente(ausencia: {
  automatica: boolean;
  atestadoId: string | null;
  aPrazo: boolean;
}): boolean {
  return (
    ausencia.automatica && ausencia.atestadoId === null && !ausencia.aPrazo
  );
}
