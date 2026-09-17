/**
 * Verificação de coerência entre a FICHA do fiscal e a sua ESCALA SEMANAL.
 *
 * ## O problema que isto torna visível
 *
 * A ficha do colaborador é a fonte da escala (Opção A): ao cadastrar, editar ou
 * reativar um fiscal, `ColaboradoresService.sincronizarEscalaFiscal` regenera as
 * entradas GERAIS de `EscalaEntry` a partir dos horários da ficha. A escala
 * semanal não é editável pelo app — na prática ela é um **derivado**.
 *
 * Só que a sincronização tem **saídas antecipadas**, e cada uma deixa a escala
 * semanal viva enquanto a ficha diz outra coisa:
 *
 *  - **ficha sem horários** (`temEscalaDefinida` falso) — a sincronização não
 *    apaga a escala existente, de propósito, "para não apagar a escala vinda do
 *    seed enquanto o gestor não a preenche". O efeito colateral é que a escala
 *    antiga continua valendo;
 *  - **fiscal sem conta de acesso** ou **sem registro `Fiscal`** — não há onde
 *    escrever, então nada é sincronizado;
 *  - **dia com horário incompleto** (entrada sem saída) — `gerarEscalaSemanalFiscal`
 *    omite o dia.
 *
 * Isso importa porque as duas pontas são lidas por consumidores diferentes: a
 * **detecção automática de falta** (`escaladosDoDia`) espera o fiscal no horário
 * da **escala semanal**, e a **escala publicada** — o PDF que a equipe recebe —
 * mostra o horário da **ficha**. Quando as duas discordam, o time lê uma hora e
 * o sistema cobra outra; duas horas depois da hora que o sistema acha certa,
 * nasce uma falta automática.
 *
 * ## O que este módulo faz (e o que NÃO faz)
 *
 * Só **diagnostica**. Não escolhe um lado, não corrige nada, não muda o
 * comportamento de nenhum cálculo. Compara o que a ficha **geraria** com o que
 * está gravado e lista as diferenças, para que a correção seja uma decisão
 * humana com os dados na mão.
 *
 * ## Por que ele cresceu (etapa 2 da ADR 0026)
 *
 * A [ADR 0026](../../../docs/02-arquitetura/decisoes/0026-horario-e-o-da-ficha.md)
 * fez o **horário exibido** ser sempre o da ficha. Falta a etapa 2: a **detecção
 * automática de falta** passar a ler a ficha também, e a cópia semanal desaparecer.
 *
 * Essa troca não é neutra, e o roadmap exige rodar este diagnóstico **antes**. Três
 * perguntas precisam de resposta com nome e sobrenome, e são as que os campos novos
 * respondem:
 *
 * 1. **Quem passaria a ser cobrado MAIS CEDO?** Hoje, quando a ficha e a cópia
 *    discordam, vale a hora **mais tardia** (`entradaEsperadaConservadora`). Ao
 *    passar a valer a ficha, quem tem ficha mais cedo que a cópia começa a ser
 *    cobrado antes — e pode receber falta onde hoje não recebe. É o **único** efeito
 *    arriscado da etapa 2, e `efeito: 'COBRA_MAIS_CEDO'` o isola, com os minutos.
 * 2. **Quem perderia o dia de descanso?** Quem tem a ficha **sem dia de folga**
 *    hoje descansa por causa de uma linha de folga na cópia semanal (ADR 0023,
 *    passo da ficha omissa). Sem a cópia, essa pessoa passa a ser esperada todos os
 *    dias. É bloqueio absoluto: `semFolgaNaFicha`.
 * 3. **Quem trabalha domingo sem horário de domingo?** Quem está no rodízio
 *    (`grupoDomingo`) e não tem `entradaDom`/`saidaDom` na ficha não tem hora para
 *    o domingo — e, por regra de negócio, também não tem para **feriado**:
 *    `domingoSemHorario`.
 *
 * Sem efeitos colaterais — testável sem banco.
 */
import {
  ColaboradorBasicoVinculo,
  FiscalBasico,
  UsuarioBasico,
  mapearFiscalColaborador,
} from './colaborador-vinculo';
import { gerarEscalaSemanalFiscal, temEscalaDefinida } from './escala.domain';

/** Ficha do fiscal com os campos que geram a escala. */
export interface FichaEscalaFiscal extends ColaboradorBasicoVinculo {
  entradaSemana: string | null;
  saidaSemana: string | null;
  entradaFds: string | null;
  saidaFds: string | null;
  folgaDiaSemana: number | null;
  /** Horário de DOMINGO — e, por regra de negócio, também o de FERIADO. */
  entradaDom: string | null;
  saidaDom: string | null;
  /** Grupo do rodízio de domingo (G1/G2/G3); `null` = fora do rodízio. */
  grupoDomingo: string | null;
  ativo: boolean;
}

/** Uma entrada GERAL da escala semanal (as exceções não entram aqui). */
export interface EntradaEscalaGeral {
  funcionarioId: string;
  colaboradorId: string | null;
  diaSemana: number;
  entrada: string | null;
  saida: string | null;
  folga: boolean;
}

/**
 * O que aconteceria com a COBRANÇA desse dia ao trocar a fonte para a ficha.
 *
 * Hoje a regra conservadora usa a hora **mais tardia** entre as duas fontes. Logo:
 *
 * - `COBRA_MAIS_CEDO` — a cópia semanal é mais tardia, então é ela que vale hoje.
 *   Passando a valer a ficha, a cobrança **adianta**: é o único caso que pode criar
 *   falta onde hoje não existe. É o que precisa ser revisto antes da etapa 2.
 * - `SEM_EFEITO` — a ficha já é a que vale hoje (é a mais tardia, ou a cópia não
 *   tem hora), ou a ficha não afirma turno e por isso já não se cobra nada. A
 *   divergência aparece na escala, mas trocar a fonte não muda a cobrança.
 */
export type EfeitoNaCobranca = 'COBRA_MAIS_CEDO' | 'SEM_EFEITO';

/** Um dia em que a ficha e a escala semanal discordam. */
export interface DiaIncoerente {
  diaSemana: number;
  /** O que a ficha geraria para esse dia (`null` = nenhuma entrada). */
  ficha: {
    entrada: string | null;
    saida: string | null;
    folga: boolean;
  } | null;
  /** O que está gravado na escala semanal (`null` = nenhuma entrada). */
  escala: {
    entrada: string | null;
    saida: string | null;
    folga: boolean;
  } | null;
  /** Efeito da etapa 2 sobre a cobrança de ponto nesse dia. */
  efeito: EfeitoNaCobranca;
  /**
   * Quantos minutos a cobrança adiantaria (só em `COBRA_MAIS_CEDO`; 0 nos demais).
   * É a medida do risco: dez minutos é uma conversa, uma hora é outra história.
   */
  minutosAdiantados: number;
}

/** Um fiscal cuja escala semanal não corresponde à ficha. */
export interface FiscalEscalaIncoerente {
  colaboradorId: string;
  nome: string;
  matricula: string;
  dias: DiaIncoerente[];
  /**
   * true quando a ficha está **sem horários** e ainda assim existe escala
   * gravada. É o caso mais perigoso: a ficha (que a escala publicada lê) não
   * diz nada, mas a detecção automática segue cobrando o ponto pelo que sobrou
   * na escala — tipicamente dados do seed que nunca foram revistos.
   */
  fichaVazia: boolean;
}

/** Um fiscal com dia(s) de horário pela metade (entrada sem saída, ou o inverso). */
export interface FiscalHorarioIncompleto {
  colaboradorId: string;
  nome: string;
  matricula: string;
  /** Rótulos dos blocos incompletos: 'Seg–Qui' e/ou 'Sex–Sáb'. */
  blocos: string[];
}

/**
 * Pessoa cuja ficha **não tem dia de folga** e que hoje descansa por uma linha da
 * cópia semanal. Retirar a cópia (etapa 2) a deixaria escalada todos os dias.
 */
export interface FichaSemFolga {
  colaboradorId: string;
  nome: string;
  matricula: string;
  /** Dias da semana em que a cópia semanal hoje concede folga a ela. */
  diasDeFolgaNaEscala: number[];
}

/**
 * Pessoa no rodízio de domingo (tem `grupoDomingo`) **sem horário de domingo** na
 * ficha. Trabalha domingo sem hora — e, por regra, também fica sem hora em
 * **feriado**, que usa o horário de domingo.
 */
export interface DomingoSemHorario {
  colaboradorId: string;
  nome: string;
  matricula: string;
  grupoDomingo: string;
  /** Falta a entrada, a saída, ou as duas. */
  falta: 'ENTRADA' | 'SAIDA' | 'AMBAS';
}

/** Entradas gerais repetidas para o mesmo funcionário e dia da semana. */
export interface EscalaDuplicada {
  funcionarioId: string;
  diaSemana: number;
  quantidade: number;
}

/** Relatório do diagnóstico de coerência ficha ↔ escala semanal. */
export interface ReporteIntegridadeEscala {
  /** Fiscais em que algum dia da escala não corresponde à ficha. */
  incoerentes: FiscalEscalaIncoerente[];
  /** Fiscais ATIVOS com ficha preenchida e nenhuma entrada geral gravada. */
  semEscala: { colaboradorId: string; nome: string; matricula: string }[];
  /** Fiscais com um bloco de horário pela metade. */
  horarioIncompleto: FiscalHorarioIncompleto[];
  /** Entradas gerais duplicadas (a mesma pessoa e dia mais de uma vez). */
  duplicadas: EscalaDuplicada[];
  /** Fichas sem dia de folga que hoje dependem da cópia semanal para descansar. */
  semFolgaNaFicha: FichaSemFolga[];
  /** Quem está no rodízio de domingo sem horário de domingo na ficha. */
  domingoSemHorario: DomingoSemHorario[];
  totalFiscaisAtivos: number;
  coerentes: number;
  /**
   * Quantas pessoas **impedem a etapa 2** hoje: as que seriam cobradas mais cedo
   * e as que perderiam o dia de descanso. Enquanto for maior que zero, mover a
   * detecção de falta para a ficha muda a vida de alguém sem aviso.
   */
  bloqueiamEtapa2: number;
  /** Nomes de quem bloqueia, para o resumo caber numa frase. */
  nomesQueBloqueiam: string[];
  /** true quando não há nenhuma pendência. */
  ok: boolean;
}

/** "HH:mm" → minutos desde a meia-noite; `null` quando não dá para ler. */
function minutosDoHorario(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/**
 * Efeito da etapa 2 num dia divergente. Espelha `entradaEsperadaConservadora`:
 * hoje vale a hora mais tardia, então só adianta a cobrança quando a cópia semanal
 * é a mais tardia das duas.
 */
export function efeitoNaCobranca(
  daFicha: string | null,
  daEscala: string | null,
): { efeito: EfeitoNaCobranca; minutosAdiantados: number } {
  const mFicha = minutosDoHorario(daFicha);
  const mEscala = minutosDoHorario(daEscala);
  // Sem hora na ficha a regra atual já não cobra nada; sem hora na escala a ficha
  // já é a que vale. Nos dois casos, trocar a fonte não muda a cobrança.
  if (mFicha == null || mEscala == null) {
    return { efeito: 'SEM_EFEITO', minutosAdiantados: 0 };
  }
  if (mEscala > mFicha) {
    return { efeito: 'COBRA_MAIS_CEDO', minutosAdiantados: mEscala - mFicha };
  }
  return { efeito: 'SEM_EFEITO', minutosAdiantados: 0 };
}

const NOMES_DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Nome curto do dia da semana (0 = domingo), para os relatórios. */
export function nomeDoDia(diaSemana: number): string {
  return NOMES_DIA[diaSemana] ?? String(diaSemana);
}

/** Compara dois estados de um dia. `null` de um lado já é diferença. */
function mesmoDia(
  a: { entrada: string | null; saida: string | null; folga: boolean } | null,
  b: { entrada: string | null; saida: string | null; folga: boolean } | null,
): boolean {
  if (a == null || b == null) return a == null && b == null;
  // Numa folga o horário é irrelevante: os dois lados a representam sem hora, e
  // exigir que `entrada`/`saida` também batam produziria ruído sem significado.
  if (a.folga || b.folga) return a.folga === b.folga;
  return a.entrada === b.entrada && a.saida === b.saida;
}

/**
 * Cruza as fichas dos fiscais com as entradas GERAIS da escala semanal e devolve
 * as divergências.
 *
 * Só considera fiscais **ativos**: um desligado tem a escala apagada de
 * propósito, e apontá-lo como "sem escala" seria ruído. `entradasGerais` deve
 * conter apenas entradas com `especial: false` — as exceções são intencionalmente
 * diferentes da ficha e não são divergência.
 */
export function detectarEscalasIncoerentes(
  fichas: readonly FichaEscalaFiscal[],
  fiscais: readonly FiscalBasico[],
  usuarios: readonly UsuarioBasico[],
  entradasGerais: readonly EntradaEscalaGeral[],
): ReporteIntegridadeEscala {
  // Mesma regra de vínculo do runtime (conta e, em fallback, matrícula), para o
  // diagnóstico apontar o que o sistema de verdade enxerga.
  const vinculo = mapearFiscalColaborador(fiscais, usuarios, fichas);
  const fiscalIdPorColaborador = new Map<string, string>();
  for (const [fiscalId, dados] of vinculo) {
    fiscalIdPorColaborador.set(dados.colaboradorId, fiscalId);
  }

  const ativas = fichas.filter((f) => f.ativo);
  const incoerentes: FiscalEscalaIncoerente[] = [];
  const semEscala: ReporteIntegridadeEscala['semEscala'] = [];
  const horarioIncompleto: FiscalHorarioIncompleto[] = [];
  const semFolgaNaFicha: FichaSemFolga[] = [];
  const domingoSemHorario: DomingoSemHorario[] = [];

  for (const ficha of ativas) {
    const fiscalId = fiscalIdPorColaborador.get(ficha.id) ?? null;
    // Entradas da escala desta pessoa, por qualquer das duas identidades (o
    // vínculo `colaboradorId` pode estar vazio em escalas antigas).
    const doFiscal = entradasGerais.filter(
      (e) =>
        e.colaboradorId === ficha.id ||
        (fiscalId != null && e.funcionarioId === fiscalId),
    );

    // Bloco de horário pela metade: o dia é omitido da escala em silêncio, e a
    // pessoa desaparece da detecção automática sem nunca receber falta.
    const blocos: string[] = [];
    if (!!ficha.entradaSemana !== !!ficha.saidaSemana) blocos.push('Seg–Qui');
    if (!!ficha.entradaFds !== !!ficha.saidaFds) blocos.push('Sex–Sáb');
    if (blocos.length > 0) {
      horarioIncompleto.push({
        colaboradorId: ficha.id,
        nome: ficha.nome,
        matricula: ficha.matricula,
        blocos,
      });
    }

    // Rodízio de domingo sem horário de domingo: a pessoa trabalha domingo (e
    // feriado, que usa o mesmo horário) sem hora nenhuma na ficha.
    if (ficha.grupoDomingo) {
      const temEntrada = !!ficha.entradaDom;
      const temSaida = !!ficha.saidaDom;
      if (!temEntrada || !temSaida) {
        domingoSemHorario.push({
          colaboradorId: ficha.id,
          nome: ficha.nome,
          matricula: ficha.matricula,
          grupoDomingo: ficha.grupoDomingo,
          falta: !temEntrada && !temSaida ? 'AMBAS' : !temEntrada ? 'ENTRADA' : 'SAIDA',
        });
      }
    }

    // Ficha sem dia de folga que hoje descansa por causa da cópia semanal. É
    // bloqueio da etapa 2: sem a cópia, a pessoa fica escalada todos os dias.
    if (ficha.folgaDiaSemana == null) {
      const diasDeFolgaNaEscala = doFiscal
        .filter((e) => e.folga)
        .map((e) => e.diaSemana)
        .sort((a, b) => a - b);
      if (diasDeFolgaNaEscala.length > 0) {
        semFolgaNaFicha.push({
          colaboradorId: ficha.id,
          nome: ficha.nome,
          matricula: ficha.matricula,
          diasDeFolgaNaEscala,
        });
      }
    }

    const fichaTemEscala = temEscalaDefinida(ficha);
    if (!fichaTemEscala) {
      // Ficha vazia COM escala gravada: a divergência mais perigosa, porque a
      // escala sobrevivente (seed) continua alimentando a detecção de falta.
      if (doFiscal.length > 0) {
        incoerentes.push({
          colaboradorId: ficha.id,
          nome: ficha.nome,
          matricula: ficha.matricula,
          fichaVazia: true,
          // Ficha vazia: não há hora na ficha, então a regra atual já não cobra
          // ponto. Trocar a fonte não adianta cobrança de ninguém aqui — o
          // problema desta pessoa é a ficha em branco, não a etapa 2.
          dias: doFiscal
            .map((e) => ({
              diaSemana: e.diaSemana,
              ficha: null,
              escala: { entrada: e.entrada, saida: e.saida, folga: e.folga },
              efeito: 'SEM_EFEITO' as const,
              minutosAdiantados: 0,
            }))
            .sort((a, b) => a.diaSemana - b.diaSemana),
        });
      }
      continue;
    }

    if (doFiscal.length === 0) {
      semEscala.push({
        colaboradorId: ficha.id,
        nome: ficha.nome,
        matricula: ficha.matricula,
      });
      continue;
    }

    // O que a ficha geraria, dia a dia — a mesma função que a sincronização usa.
    const esperado = new Map(
      gerarEscalaSemanalFiscal(ficha).map((d) => [
        d.diaSemana,
        { entrada: d.entrada, saida: d.saida, folga: d.folga },
      ]),
    );
    const gravado = new Map(
      doFiscal.map((e) => [
        e.diaSemana,
        { entrada: e.entrada, saida: e.saida, folga: e.folga },
      ]),
    );

    const dias: DiaIncoerente[] = [];
    for (let diaSemana = 0; diaSemana <= 6; diaSemana++) {
      const daFicha = esperado.get(diaSemana) ?? null;
      const daEscala = gravado.get(diaSemana) ?? null;
      if (!mesmoDia(daFicha, daEscala)) {
        // Numa folga não há hora para comparar: o efeito da etapa 2 sobre a
        // cobrança é nulo por construção (quem folga não é cobrado).
        const emFolga = daFicha?.folga === true || daEscala?.folga === true;
        const { efeito, minutosAdiantados } = emFolga
          ? { efeito: 'SEM_EFEITO' as const, minutosAdiantados: 0 }
          : efeitoNaCobranca(daFicha?.entrada ?? null, daEscala?.entrada ?? null);
        dias.push({
          diaSemana,
          ficha: daFicha,
          escala: daEscala,
          efeito,
          minutosAdiantados,
        });
      }
    }
    if (dias.length > 0) {
      incoerentes.push({
        colaboradorId: ficha.id,
        nome: ficha.nome,
        matricula: ficha.matricula,
        fichaVazia: false,
        dias,
      });
    }
  }

  // Duplicadas: a tabela não tem índice único em (funcionarioId, diaSemana,
  // especial), e dois leitores desempatam de formas diferentes — um pega a
  // primeira linha, outro a última. Enquanto existirem, a escala efetiva de
  // uma pessoa depende de qual consumidor pergunta.
  const contagem = new Map<string, number>();
  for (const e of entradasGerais) {
    const chave = `${e.funcionarioId}|${e.diaSemana}`;
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  const duplicadas: EscalaDuplicada[] = [...contagem.entries()]
    .filter(([, n]) => n > 1)
    .map(([chave, quantidade]) => {
      const [funcionarioId, dia] = chave.split('|');
      return { funcionarioId, diaSemana: Number(dia), quantidade };
    })
    .sort(
      (a, b) =>
        a.funcionarioId.localeCompare(b.funcionarioId) ||
        a.diaSemana - b.diaSemana,
    );

  // Quem impede a etapa 2, sem repetir nome: seria cobrado mais cedo, ou perderia
  // o dia de descanso. As outras pendências são problemas de cadastro — precisam
  // de atenção, mas não mudam a vida de ninguém quando a fonte trocar.
  const bloqueiam = new Map<string, string>();
  for (const f of incoerentes) {
    if (f.dias.some((d) => d.efeito === 'COBRA_MAIS_CEDO')) {
      bloqueiam.set(f.colaboradorId, f.nome);
    }
  }
  for (const f of semFolgaNaFicha) {
    bloqueiam.set(f.colaboradorId, f.nome);
  }

  return {
    incoerentes: incoerentes.sort((a, b) => a.nome.localeCompare(b.nome)),
    semEscala: semEscala.sort((a, b) => a.nome.localeCompare(b.nome)),
    horarioIncompleto: horarioIncompleto.sort((a, b) =>
      a.nome.localeCompare(b.nome),
    ),
    duplicadas,
    semFolgaNaFicha: semFolgaNaFicha.sort((a, b) =>
      a.nome.localeCompare(b.nome),
    ),
    domingoSemHorario: domingoSemHorario.sort((a, b) =>
      a.nome.localeCompare(b.nome),
    ),
    totalFiscaisAtivos: ativas.length,
    coerentes: ativas.length - incoerentes.length - semEscala.length,
    bloqueiamEtapa2: bloqueiam.size,
    nomesQueBloqueiam: [...bloqueiam.values()].sort((a, b) =>
      a.localeCompare(b),
    ),
    ok:
      incoerentes.length === 0 &&
      semEscala.length === 0 &&
      horarioIncompleto.length === 0 &&
      duplicadas.length === 0 &&
      semFolgaNaFicha.length === 0 &&
      domingoSemHorario.length === 0,
  };
}
