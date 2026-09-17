/**
 * Hora que o sistema pode COBRAR de um fiscal num dia — regra conservadora.
 *
 * ## O problema
 *
 * A hora esperada de um fiscal está escrita em dois lugares:
 *
 * - a **ficha** do colaborador (`entradaSemana`/`entradaFds`/`entradaDom`) — a
 *   fonte oficial (Opção A), e a que a **escala publicada** mostra à equipe;
 * - a **escala semanal** (`EscalaEntry`) — um derivado da ficha, regenerado a
 *   cada edição do cadastro, e o que a **detecção automática de falta** lia.
 *
 * O derivado fica velho em silêncio: `sincronizarEscalaFiscal` tem saídas
 * antecipadas (ficha sem horários, fiscal sem conta, horário pela metade) e em
 * cada uma a escala anterior sobrevive. O resultado é que a equipe lê uma hora na
 * escala que recebeu e o sistema cobra outra — e duas horas depois da hora que o
 * sistema acha certa, nasce uma falta em quem chegou no horário combinado.
 *
 * ## Por que não "a ficha manda, ponto final"
 *
 * Porque trocar a fonte de uma vez **adianta** a cobrança de quem tiver a ficha
 * mais cedo que a escala. Um fiscal com ficha 06:50 e escala 07:00 passaria a ser
 * cobrado dez minutos antes, e quem chegasse 06:55 ganharia uma falta que hoje
 * não existe. Corrigir um desencontro criando faltas novas não é corrigir.
 *
 * ## A regra
 *
 * Quando as duas fontes discordam, vale a **hora mais TARDIA**.
 *
 * O viés é o mesmo que a regra única de folga já usa, e pela mesma razão: entre
 * "deixar de cobrar o ponto de alguém" e "marcar falta em quem estava no horário",
 * o segundo erro é muito mais grave. Um custa uma conversa; o outro mexe no
 * registro de trabalho de uma pessoa. Por construção, esta regra **nunca cria uma
 * falta que não existia antes** — só pode deixar de criar.
 *
 * Uma exceção à comparação:
 *
 * 1. **Ficha sem horário para o dia ⇒ não se cobra nada.** A ficha é a fonte; se
 *    ela não afirma um turno, o sistema não tem base para afirmar uma expectativa.
 *    É exatamente o caso "ficha vazia com escala do seed sobrevivente", em que
 *    hoje se cobra o ponto por um dado que ninguém revisou.
 *
 * O caso em que a ficha **não pôde ser resolvida** (fiscal sem vínculo com
 * nenhuma ficha) mantém o comportamento antigo — usar a escala. Aí não há duas
 * fontes para comparar, e tirar a pessoa da lista seria uma decisão sem base.
 *
 * ## E o FERIADO, que não entra na comparação
 *
 * Em feriado vale o horário de **domingo** da ficha, por regra de negócio — a
 * mesma que a jornada aplica ao pagamento e a escala publicada ao turno. Aqui as
 * duas fontes não estão "dizendo o mesmo com dados diferentes": a escala semanal
 * simplesmente **não sabe** o que é feriado, então o valor dela não é uma opinião
 * concorrente, é um dado que não se aplica. Comparar as duas faria o horário de
 * dia útil vencer o de domingo sempre que fosse mais tarde, desfazendo a regra.
 *
 * Nesse caso a ficha vence direto, com a escala apenas como último recurso — para
 * ninguém ficar sem turno e desaparecer da equipe do dia.
 *
 * Sem efeitos colaterais — testável sem banco.
 */

/** "HH:mm" → minutos desde a meia-noite; null quando não dá para ler. */
function minutos(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export interface EntradaConservadoraParams {
  /** Hora gravada na escala semanal para o dia ("HH:mm"), ou null. */
  daEscala: string | null;
  /** Hora que a FICHA prevê para o dia ("HH:mm"), ou null. */
  daFicha: string | null;
  /**
   * A ficha do fiscal foi resolvida? `false` para um fiscal sem vínculo com
   * nenhuma ficha — aí não há duas fontes, e vale a escala.
   */
  temFicha: boolean;
  /**
   * O dia é FERIADO? Aí a ficha vence direto (o horário de domingo é a regra) e
   * a escala serve só como último recurso — ela não conhece feriados, então não é
   * uma opinião concorrente sobre a hora.
   */
  ehFeriado: boolean;
}

/**
 * A hora que pode ser cobrada, ou `null` quando não se deve cobrar nada.
 *
 * Ver o cabeçalho do arquivo para o porquê de cada ramo — a ordem importa.
 */
export function entradaEsperadaConservadora(
  params: EntradaConservadoraParams,
): string | null {
  const { daEscala, daFicha, temFicha, ehFeriado } = params;

  // 1. Sem ficha resolvida não há o que comparar — comportamento antigo.
  if (!temFicha) return daEscala;

  // 2. Feriado: a ficha vence por regra (horário de domingo), com a escala como
  //    último recurso. Sem a comparação, de propósito — ver o cabeçalho.
  if (ehFeriado) return daFicha ?? daEscala;

  // 3. A ficha é a fonte: se ela não afirma turno, não se cobra ponto.
  if (!daFicha) return null;

  if (!daEscala) return daFicha;

  // 4. Discordância: a mais TARDIA, para nunca adiantar a cobrança.
  const mFicha = minutos(daFicha);
  const mEscala = minutos(daEscala);
  if (mFicha == null) return daEscala;
  if (mEscala == null) return daFicha;
  return mEscala > mFicha ? daEscala : daFicha;
}
