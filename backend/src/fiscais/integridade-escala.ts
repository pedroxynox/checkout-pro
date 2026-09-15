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
  totalFiscaisAtivos: number;
  coerentes: number;
  /** true quando não há nenhuma pendência. */
  ok: boolean;
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
          dias: doFiscal
            .map((e) => ({
              diaSemana: e.diaSemana,
              ficha: null,
              escala: { entrada: e.entrada, saida: e.saida, folga: e.folga },
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
        dias.push({ diaSemana, ficha: daFicha, escala: daEscala });
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

  return {
    incoerentes: incoerentes.sort((a, b) => a.nome.localeCompare(b.nome)),
    semEscala: semEscala.sort((a, b) => a.nome.localeCompare(b.nome)),
    horarioIncompleto: horarioIncompleto.sort((a, b) =>
      a.nome.localeCompare(b.nome),
    ),
    duplicadas,
    totalFiscaisAtivos: ativas.length,
    coerentes: ativas.length - incoerentes.length - semEscala.length,
    ok:
      incoerentes.length === 0 &&
      semEscala.length === 0 &&
      horarioIncompleto.length === 0 &&
      duplicadas.length === 0,
  };
}
