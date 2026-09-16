/**
 * Lógica pura da COMPENSAÇÃO DE HORAS (ADR 0021).
 *
 * ## O problema
 *
 * A Central de Jornada mede as horas com precisão, mas não ajuda a resolvê-las.
 * O gestor vê "Ana tem 5h de 50%" e fica com três perguntas: em que dia libero
 * sem furar a operação, por quanto tempo, e isso zera as horas dela ou empurra o
 * problema para o mês seguinte? Este módulo responde às três.
 *
 * ## A conta, que é uma só
 *
 * Não existem modalidades ("dia inteiro", "meio dia", "faixa de horas"). Existe
 * uma identidade:
 *
 * ```
 *   horas a compensar = saldo de 50% da pessoa (limitado à carga do dia)
 *   horas a trabalhar = carga do dia − horas a compensar
 * ```
 *
 * Carga de 7h e saldo de 5h: trabalha 2h, vai para casa, o dia fecha em 7h. O
 * "dia inteiro" não é uma modalidade — é o caso em que a conta dá zero.
 *
 * ## Estilo de sugestão
 *
 * O mesmo de `sugestao-folga.domain.ts`: **quando o dado não sustenta, não
 * sugere**. Um palpite errado sobre o descanso de alguém é pior do que nenhum
 * palpite, porque o gestor pode aplicá-lo sem verificar. Toda sugestão sai
 * acompanhada do número que a justifica.
 *
 * Sem efeitos colaterais — testável sem banco, sem relógio e sem rede.
 */

/** Funções que entram em escala. Gerência não é escalada, logo não compensa. */
export type FuncaoCompensavel = 'OPERADOR' | 'FISCAL' | 'SUPERVISOR';

/**
 * Saldo mínimo de 50% para valer uma sugestão: **3h** (decisão do dono do
 * projeto). Abaixo disso a mudança de escala não se paga — mexer no dia de
 * alguém para devolver 40 minutos custa mais atenção do que resolve.
 */
export const MIN_SALDO_COMPENSAVEL_MS = 3 * 60 * 60_000;

/**
 * Fiscais que precisam **sobrar** disponíveis no dia (decisão do dono do
 * projeto). É a única cobertura com piso rígido: o mínimo de 20 operadores
 * (`COBERTURA_MINIMA`) continua valendo como alerta do dia, mas **não veta** uma
 * compensação, e supervisores não têm piso.
 */
export const MIN_FISCAIS_DISPONIVEIS = 2;

/**
 * Peso do acúmulo na escolha da data, como fração do movimento médio do ciclo.
 *
 * Sem ele, todas as compensações do ciclo cairiam no mesmo dia — o mais fraco —
 * e a seção esvaziaria a loja justamente no dia que ela própria recomendou.
 * Cada pessoa já alocada numa data encarece aquela data em 10% do movimento
 * médio, então a segunda pessoa tende à segunda data mais fraca, e assim por
 * diante. Não é um teto rígido (não existe piso de operadores): é uma
 * preferência que se acumula.
 */
export const PENALIDADE_ACUMULO = 0.1;

/** De onde veio a previsão de movimento de uma data. */
export type FonteMovimento = 'ESTIMATIVA' | 'HISTORICO';

/** Uma data do ciclo que pode receber compensações, com o movimento previsto. */
export interface DataCandidata {
  /** Dia em meia-noite UTC. */
  data: Date;
  /** 0 = domingo … 6 = sábado. */
  diaSemana: number;
  /** Venda prevista para o dia (R$). Menor = dia mais fraco = melhor candidato. */
  movimentoPrevisto: number;
  fonte: FonteMovimento;
  /** Observações que sustentam a média. Zero quando a fonte é a estimativa. */
  amostras: number;
}

/** Uma pessoa com saldo de 50% a compensar. */
export interface PessoaCompensavel {
  colaboradorId: string;
  nome: string;
  funcao: FuncaoCompensavel;
  /** Saldo de 50% REAL disponível agora (`extras50AtualMs`). Sempre > 0 aqui. */
  saldo50Ms: number;
  /** Dias de TAC no ciclo — quem já estourou o limite tem prioridade. */
  diasTac: number;
}

/** Como as horas de um dia de compensação se dividem. */
export interface PlanoDia {
  /** Minutos (em ms) de 50% consumidos. */
  compensarMs: number;
  /** Quanto a pessoa ainda trabalha. Zero = dia inteiro livre. */
  trabalharMs: number;
  /** true quando a jornada curta encerra sem intervalo (duas batidas). */
  semIntervalo: boolean;
  /** Tempo que ela fica na loja: trabalho + intervalo, quando houver. */
  presencaMs: number;
}

/** A faixa em que a pessoa trabalha no dia compensado. */
export interface JanelaTrabalho {
  /** "HH:mm". */
  horaInicio: string;
  horaFim: string;
  /** Em que ponta do turno ela ficou. */
  ponta: 'INICIO' | 'FIM';
}

/** Regras de jornada de que o plano precisa (subconjunto de `RegrasContrato`). */
export interface RegrasPlano {
  /** Jornada que pode ser encerrada sem intervalo (4h50 no 6x1). */
  maxTrabalhoSemIntervaloMs: number;
  /** Intervalo mínimo, quando o dia exigir intervalo (1h). */
  intervaloMinimoMs: number;
}

/**
 * Divide o dia entre o que a pessoa trabalha e o que ela compensa.
 *
 * Compensa-se **o menor** entre o saldo e a carga do dia — nunca mais do que
 * ela tem (compensação não pode criar saldo negativo) e nunca mais do que o dia
 * comporta (não se compensa 9h num dia de 7h; o resto fica para outro dia).
 *
 * O intervalo é decidido pela jornada que sobra: até 4h50 o contrato 6x1 encerra
 * com duas batidas, sem intervalo e sem TAC. Como a carga é de 7h (seg–qui) ou
 * 8h (sex–sáb), qualquer saldo a partir de ~2h10 já cai nessa faixa — o caso
 * "com intervalo" existe só nas bordas, e é sinalizado em vez de escondido,
 * porque muda o que se espera do ponto naquele dia.
 */
export function planoDoDia(
  cargaMs: number,
  saldoMs: number,
  regras: RegrasPlano,
): PlanoDia {
  const compensarMs = Math.max(0, Math.min(saldoMs, cargaMs));
  const trabalharMs = Math.max(0, cargaMs - compensarMs);
  const semIntervalo = trabalharMs <= regras.maxTrabalhoSemIntervaloMs;
  const presencaMs =
    trabalharMs === 0
      ? 0
      : trabalharMs + (semIntervalo ? 0 : regras.intervaloMinimoMs);
  return { compensarMs, trabalharMs, semIntervalo, presencaMs };
}

/** "HH:mm" → minutos desde a meia-noite; `null` se inválido. */
export function horaParaMinutos(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Minutos desde a meia-noite → "HH:mm" (fecha o dia em 23:59). */
export function minutosParaHora(minutos: number): string {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutos)));
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Em que ponta do turno a pessoa cumpre as horas que restam.
 *
 * Só duas respostas são executáveis numa frente de caixa: ela entra na hora e
 * **vai embora antes**, ou **entra mais tarde** e sai na hora. Um buraco no meio
 * do turno obrigaria a sair e voltar — a matemática acharia ótimos que a
 * operação não consegue cumprir, então as pontas são as únicas candidatas.
 *
 * Entre as duas, fica-se com a que **cobre a maior venda média**: a pessoa
 * permanece na loja enquanto ela está cheia e é liberada no trecho vazio. O
 * empate resolve por `INICIO`, que é o horário que ela já conhece.
 *
 * @param vendaNaFaixa média de venda de uma faixa de minutos do dia
 * @returns `null` quando não há turno conhecido ou o dia é inteiro livre
 */
export function janelaDeTrabalho(
  entrada: string | null,
  saida: string | null,
  presencaMs: number,
  vendaNaFaixa: (inicioMin: number, fimMin: number) => number,
): JanelaTrabalho | null {
  if (presencaMs <= 0) return null;
  const inicioTurno = horaParaMinutos(entrada);
  const fimTurno = horaParaMinutos(saida);
  if (inicioTurno == null || fimTurno == null || fimTurno <= inicioTurno) {
    return null;
  }

  const presencaMin = Math.round(presencaMs / 60_000);
  // A presença não pode passar do turno: se passar, o dia não é compensável e
  // quem chamou deve tratá-lo como turno normal.
  if (presencaMin >= fimTurno - inicioTurno) return null;

  const inicio = { de: inicioTurno, ate: inicioTurno + presencaMin };
  const fim = { de: fimTurno - presencaMin, ate: fimTurno };

  const vendaInicio = vendaNaFaixa(inicio.de, inicio.ate);
  const vendaFim = vendaNaFaixa(fim.de, fim.ate);

  const escolha = vendaFim > vendaInicio ? fim : inicio;
  return {
    horaInicio: minutosParaHora(escolha.de),
    horaFim: minutosParaHora(escolha.ate),
    ponta: escolha === fim ? 'FIM' : 'INICIO',
  };
}

/**
 * Ordem em que as pessoas são atendidas.
 *
 * 1. **Quem tem dia de TAC primeiro.** TAC é excesso de jornada já consumado:
 *    a pessoa passou do limite e a compensação é a válvula que evita o custo
 *    trabalhista. Esperar a vez dela seria esperar o problema virar dinheiro.
 * 2. **Maior saldo depois.** É o maior passivo de 50% e o que tem menos chance
 *    de caber nos dias que restam do ciclo.
 * 3. **Nome, por último**, só para a ordem ser estável entre duas chamadas
 *    iguais (uma lista que embaralha a cada refresh não é auditável).
 */
export function ordenarPorUrgencia(
  pessoas: readonly PessoaCompensavel[],
): PessoaCompensavel[] {
  return [...pessoas].sort((a, b) => {
    if (b.diasTac !== a.diasTac) return b.diasTac - a.diasTac;
    if (b.saldo50Ms !== a.saldo50Ms) return b.saldo50Ms - a.saldo50Ms;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

/** Uma falta passada que pode ser coberta pelas horas de 50% da pessoa. */
export interface FaltaCobrivel {
  ausenciaId: string;
  colaboradorId: string;
  nome: string;
  funcao: FuncaoCompensavel;
  /** Dia da falta (meia-noite UTC). */
  data: Date;
  diaSemana: number;
  /** Carga-base do dia: é o que entra como hora devida ao marcar o débito. */
  cargaMs: number;
  /** PENDENTE = ainda não analisada; INJUSTIFICADA = confirmada como falta. */
  status: 'PENDENTE' | 'INJUSTIFICADA';
}

/** Uma cobertura de falta sugerida (o botão "Débito" que já existe). */
export interface SugestaoCobertura extends FaltaCobrivel {
  saldoAntesMs: number;
  saldoDepoisMs: number;
  justificativa: string;
}

/**
 * Escolhe quais faltas passadas cobrir com o saldo de 50%, por pessoa.
 *
 * **Por que as faltas vêm antes das liberações:** cobrir uma falta já ocorrida é
 * a operação mais barata que existe — não mexe na escala, não tira ninguém do
 * caixa, elimina um desconto em folha para a pessoa e apaga um passivo de 50%
 * para a loja. Gastar a carteira numa liberação futura, que custa cobertura, só
 * faz sentido depois de esgotado o que não custa nada. As duas bebem da **mesma
 * carteira**, e é por isso que esta função devolve o saldo restante: sugerir as
 * duas coisas sem descontar uma da outra prometeria as mesmas horas duas vezes.
 *
 * Só cobre a falta **inteira**: se o saldo não paga a carga daquele dia, a falta
 * não entra. Uma cobertura parcial deixaria a pessoa devendo horas — decisão
 * legítima do gestor, mas nunca uma sugestão automática apresentada como
 * "de graça".
 *
 * As faltas mais antigas vêm primeiro: são as que estão mais perto de o ciclo
 * fechar e a chance de correção se perder.
 */
export function coberturasDeFalta(
  saldoMs: number,
  faltas: readonly FaltaCobrivel[],
): { sugestoes: SugestaoCobertura[]; saldoRestanteMs: number } {
  const ordenadas = [...faltas].sort(
    (a, b) => a.data.getTime() - b.data.getTime(),
  );
  const sugestoes: SugestaoCobertura[] = [];
  let saldo = saldoMs;

  for (const falta of ordenadas) {
    if (falta.cargaMs <= 0) continue;
    if (saldo < falta.cargaMs) continue;
    const antes = saldo;
    saldo -= falta.cargaMs;
    sugestoes.push({
      ...falta,
      saldoAntesMs: antes,
      saldoDepoisMs: saldo,
      justificativa: textoCobertura(falta, antes),
    });
  }

  return { sugestoes, saldoRestanteMs: saldo };
}

/** Uma liberação futura sugerida. */
export interface SugestaoLiberacao {
  colaboradorId: string;
  nome: string;
  funcao: FuncaoCompensavel;
  /** Dia sugerido (meia-noite UTC). */
  data: Date;
  diaSemana: number;
  /** Carga do dia. */
  cargaMs: number;
  compensarMs: number;
  trabalharMs: number;
  semIntervalo: boolean;
  horaInicio: string | null;
  horaFim: string | null;
  ponta: 'INICIO' | 'FIM' | null;
  saldoAntesMs: number;
  saldoDepoisMs: number;
  movimentoPrevisto: number;
  fonteMovimento: FonteMovimento;
  amostras: number;
  /** Quanto o dia está abaixo da média do ciclo (0..1), ou `null` sem média. */
  abaixoDaMedia: number | null;
  /** Quantos da mesma função ficam no dia, já descontando esta saída. */
  coberturaNoDia: number;
  diasTac: number;
  justificativa: string;
}

/** O que a alocação precisa saber sobre cada par (pessoa, data). */
export interface ContextoAlocacao {
  /** false quando a data é proibida para a pessoa (folga, férias, ausência…). */
  permitido(colaboradorId: string, data: Date): boolean;
  /** Carga-base daquele dia para aquela pessoa (ms). Zero = não trabalha. */
  cargaDoDia(colaboradorId: string, data: Date): number;
  /** Turno da pessoa no dia: "HH:mm" de entrada e saída (ou nulos). */
  turno(
    colaboradorId: string,
    data: Date,
  ): { entrada: string | null; saida: string | null };
  /** Venda média de uma faixa de minutos naquele dia da semana. */
  vendaNaFaixa(diaSemana: number, inicioMin: number, fimMin: number): number;
  /** Quantos da função estão disponíveis no dia, antes das compensações. */
  disponiveisNoDia(funcao: FuncaoCompensavel, data: Date): number;
  /** Regras de jornada da pessoa (contrato). */
  regras(colaboradorId: string): RegrasPlano;
}

/**
 * Distribui as liberações entre as datas do ciclo.
 *
 * Atende as pessoas por urgência (`ordenarPorUrgencia`) e, para cada uma, escolhe
 * a data **de menor custo** entre as permitidas, onde
 *
 * ```
 *   custo = movimento previsto + (já alocados na data) × penalidade
 * ```
 *
 * O termo do acúmulo é o que impede a seção de esvaziar a loja no dia mais fraco
 * do ciclo (ver `PENALIDADE_ACUMULO`). O único veto rígido é o piso de
 * `MIN_FISCAIS_DISPONIVEIS` fiscais no dia: operadores e supervisores não têm
 * piso — mostra-se a cobertura resultante e o gestor decide.
 *
 * Uma pessoa recebe **no máximo uma** liberação por rodada. Compensar o saldo em
 * dois dias diferentes é possível, mas exige que o gestor aplique a primeira e
 * volte: sugerir dois dias de uma vez para a mesma pessoa multiplica o erro
 * quando a premissa (o saldo) muda depois da primeira aplicação.
 */
export function alocarLiberacoes(
  pessoas: readonly PessoaCompensavel[],
  datas: readonly DataCandidata[],
  ctx: ContextoAlocacao,
): SugestaoLiberacao[] {
  if (datas.length === 0) return [];

  const movimentoMedio =
    datas.reduce((s, d) => s + d.movimentoPrevisto, 0) / datas.length;
  const penalidade = movimentoMedio * PENALIDADE_ACUMULO;
  /** `${funcao}|${timestamp}` → quantos já saem naquele dia. */
  const alocados = new Map<string, number>();
  const chave = (f: FuncaoCompensavel, d: Date) => `${f}|${d.getTime()}`;
  const contagem = (f: FuncaoCompensavel, d: Date) =>
    alocados.get(chave(f, d)) ?? 0;

  const sugestoes: SugestaoLiberacao[] = [];

  for (const pessoa of ordenarPorUrgencia(pessoas)) {
    if (pessoa.saldo50Ms < MIN_SALDO_COMPENSAVEL_MS) continue;

    let melhor: { data: DataCandidata; custo: number } | null = null;

    for (const candidata of datas) {
      if (!ctx.permitido(pessoa.colaboradorId, candidata.data)) continue;
      const cargaMs = ctx.cargaDoDia(pessoa.colaboradorId, candidata.data);
      if (cargaMs <= 0) continue;

      // Piso de fiscais: é o único veto rígido de cobertura.
      if (pessoa.funcao === 'FISCAL') {
        const restam =
          ctx.disponiveisNoDia('FISCAL', candidata.data) -
          contagem('FISCAL', candidata.data) -
          1;
        if (restam < MIN_FISCAIS_DISPONIVEIS) continue;
      }

      const custo =
        candidata.movimentoPrevisto +
        contagem(pessoa.funcao, candidata.data) * penalidade;
      if (!melhor || custo < melhor.custo) melhor = { data: candidata, custo };
    }

    if (!melhor) continue;

    const candidata = melhor.data;
    const cargaMs = ctx.cargaDoDia(pessoa.colaboradorId, candidata.data);
    const plano = planoDoDia(
      cargaMs,
      pessoa.saldo50Ms,
      ctx.regras(pessoa.colaboradorId),
    );
    const { entrada, saida } = ctx.turno(pessoa.colaboradorId, candidata.data);
    const janela = janelaDeTrabalho(entrada, saida, plano.presencaMs, (i, f) =>
      ctx.vendaNaFaixa(candidata.diaSemana, i, f),
    );

    // Sem janela possível num dia PARCIAL, a sugestão seria inexecutável
    // ("trabalhe 2h" sem dizer quais): melhor não sugerir. Num dia inteiro
    // livre (`trabalharMs === 0`) não há janela a calcular, e isso é normal.
    if (plano.trabalharMs > 0 && !janela) continue;

    alocados.set(
      chave(pessoa.funcao, candidata.data),
      contagem(pessoa.funcao, candidata.data) + 1,
    );
    const coberturaNoDia =
      ctx.disponiveisNoDia(pessoa.funcao, candidata.data) -
      contagem(pessoa.funcao, candidata.data);

    const abaixoDaMedia =
      movimentoMedio > 0
        ? Math.max(
            0,
            (movimentoMedio - candidata.movimentoPrevisto) / movimentoMedio,
          )
        : null;

    const sugestao: SugestaoLiberacao = {
      colaboradorId: pessoa.colaboradorId,
      nome: pessoa.nome,
      funcao: pessoa.funcao,
      data: candidata.data,
      diaSemana: candidata.diaSemana,
      cargaMs,
      compensarMs: plano.compensarMs,
      trabalharMs: plano.trabalharMs,
      semIntervalo: plano.semIntervalo,
      horaInicio: janela?.horaInicio ?? null,
      horaFim: janela?.horaFim ?? null,
      ponta: janela?.ponta ?? null,
      saldoAntesMs: pessoa.saldo50Ms,
      saldoDepoisMs: pessoa.saldo50Ms - plano.compensarMs,
      movimentoPrevisto: candidata.movimentoPrevisto,
      fonteMovimento: candidata.fonte,
      amostras: candidata.amostras,
      abaixoDaMedia,
      coberturaNoDia,
      diasTac: pessoa.diasTac,
      justificativa: '',
    };
    sugestao.justificativa = textoLiberacao(sugestao);
    sugestoes.push(sugestao);
  }

  return sugestoes;
}

// --------------------------- Textos das sugestões ---------------------------
//
// A frase viaja junto com a sugestão, calculada aqui e não na tela, por dois
// motivos: o app e um relatório futuro devem dizer exatamente a mesma coisa, e
// a frase é o retrato gravado no banco quando o gestor decide (ADR 0021, item 8).

const NOMES_DIA = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
] as const;

/** Nome do dia da semana (0 = domingo). */
export function nomeDiaSemana(diaSemana: number): string {
  return NOMES_DIA[diaSemana] ?? String(diaSemana);
}

/** "22/09" a partir de um dia em meia-noite UTC. */
export function dataCurta(data: Date): string {
  const dd = String(data.getUTCDate()).padStart(2, '0');
  const mm = String(data.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

/** "5h", "5h30" ou "45min" — a duração como o gestor a diria. */
export function duracao(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(total / 60);
  const min = total % 60;
  if (h === 0) return `${min}min`;
  if (min === 0) return `${h}h`;
  return `${h}h${String(min).padStart(2, '0')}`;
}

/** "R$ 41,2 mil" — valor curto, para caber numa linha da card. */
export function reaisCurto(valor: number): string {
  if (!Number.isFinite(valor) || valor <= 0) return 'sem previsão';
  if (valor >= 1_000_000) {
    return `R$ ${(valor / 1_000_000).toFixed(1).replace('.', ',')} mi`;
  }
  if (valor >= 1_000) {
    return `R$ ${(valor / 1_000).toFixed(1).replace('.', ',')} mil`;
  }
  return `R$ ${valor.toFixed(0)}`;
}

/** Frase que justifica uma liberação. */
export function textoLiberacao(s: SugestaoLiberacao): string {
  const dia = `${nomeDiaSemana(s.diaSemana)} ${dataCurta(s.data)}`;
  const previsao =
    s.fonteMovimento === 'ESTIMATIVA'
      ? `${reaisCurto(s.movimentoPrevisto)} estimados pela gestão`
      : `${reaisCurto(s.movimentoPrevisto)} de média em ${s.amostras} ${
          s.amostras === 1 ? 'dia' : 'dias'
        }`;
  const compara =
    s.abaixoDaMedia != null && s.abaixoDaMedia > 0.02
      ? `, ${Math.round(s.abaixoDaMedia * 100)}% abaixo da média do ciclo`
      : '';

  const oQueFaz =
    s.trabalharMs === 0
      ? `${s.nome} não trabalha nesse dia e compensa ${duracao(s.compensarMs)}`
      : `${s.nome} trabalha ${duracao(s.trabalharMs)} (${s.horaInicio}–${
          s.horaFim
        })${s.semIntervalo ? ', sem intervalo' : ', com intervalo de 1h'} e ` +
        `compensa ${duracao(s.compensarMs)}`;

  const sobra =
    s.saldoDepoisMs > 0
      ? ` Sobram ${duracao(s.saldoDepoisMs)} de 50%.`
      : ' Zera o saldo de 50%.';

  const tac =
    s.diasTac > 0
      ? ` Atenção: ${s.diasTac} ${
          s.diasTac === 1 ? 'dia' : 'dias'
        } de TAC no ciclo.`
      : '';

  return (
    `${dia} é um dia fraco (${previsao}${compara}). ${oQueFaz}.${sobra}` +
    ` Ficam ${s.coberturaNoDia} na função.${tac}`
  );
}

/** Frase que justifica cobrir uma falta com horas de 50%. */
export function textoCobertura(falta: FaltaCobrivel, saldoAntesMs: number): string {
  const dia = `${nomeDiaSemana(falta.diaSemana)} ${dataCurta(falta.data)}`;
  const situacao =
    falta.status === 'INJUSTIFICADA'
      ? 'falta não justificada'
      : 'falta ainda sem análise';
  return (
    `${falta.nome} tem uma ${situacao} em ${dia} (${duracao(falta.cargaMs)}) e ` +
    `${duracao(saldoAntesMs)} de 50% disponíveis. Debitar cobre o dia com horas ` +
    `já trabalhadas, em vez de descontar em folha. Não apaga a falta.`
  );
}

/** Resumo da carteira de 50% do time no ciclo. */
export interface ResumoCarteira {
  /** Soma dos saldos de 50% de quem tem saldo. */
  totalSaldoMs: number;
  pessoasComSaldo: number;
  /** Pessoas com saldo abaixo do mínimo de 3h (não sugeríveis ainda). */
  pessoasAbaixoDoMinimo: number;
  /** Horas que as coberturas de falta sugeridas consomem. */
  totalCoberturaMs: number;
  /** Horas que as liberações sugeridas consomem. */
  totalLiberacaoMs: number;
  /** Horas de 50% que as sugestões NÃO conseguem alocar neste ciclo. */
  naoAlocadoMs: number;
  /** Dias do ciclo que ainda podem receber compensação. */
  datasDisponiveis: number;
}

/**
 * Resumo da carteira.
 *
 * O número que interessa ao gestor é `naoAlocadoMs`: as horas de 50% que **não
 * couberam** nos dias que restam do ciclo. Como compensar no ciclo seguinte é
 * proibido (cada ciclo é independente em horas), essas horas serão pagas — e
 * saber disso no dia 12 permite agir; descobrir na folha, não.
 */
export function resumirCarteira(
  pessoas: readonly PessoaCompensavel[],
  coberturas: readonly SugestaoCobertura[],
  liberacoes: readonly SugestaoLiberacao[],
  datasDisponiveis: number,
): ResumoCarteira {
  const comSaldo = pessoas.filter((p) => p.saldo50Ms > 0);
  const totalSaldoMs = comSaldo.reduce((s, p) => s + p.saldo50Ms, 0);
  const totalCoberturaMs = coberturas.reduce((s, c) => s + c.cargaMs, 0);
  const totalLiberacaoMs = liberacoes.reduce((s, l) => s + l.compensarMs, 0);
  return {
    totalSaldoMs,
    pessoasComSaldo: comSaldo.length,
    pessoasAbaixoDoMinimo: comSaldo.filter(
      (p) => p.saldo50Ms < MIN_SALDO_COMPENSAVEL_MS,
    ).length,
    totalCoberturaMs,
    totalLiberacaoMs,
    naoAlocadoMs: Math.max(
      0,
      totalSaldoMs - totalCoberturaMs - totalLiberacaoMs,
    ),
    datasDisponiveis,
  };
}
