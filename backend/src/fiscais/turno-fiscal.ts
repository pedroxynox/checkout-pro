/**
 * O turno de um fiscal, resolvido a partir da **ficha** — a fonte única.
 *
 * ## Por que este arquivo existe
 *
 * A hora esperada de um fiscal era lida da `EscalaEntry` (a cópia semanal) por
 * vários caminhos diferentes: a equipe do dia, a escala consolidada, o
 * lembrete de dez minutos, a saudação de entrada, o ranking de pontualidade e
 * os alertas semanais. Cada um relia a tabela do seu jeito, e quando a cópia
 * ficava velha todos passavam a afirmar uma hora que a pessoa
 * não via na sua ficha.
 *
 * A ADR 0026 encerra isso: **a ficha manda**. Para que "a ficha manda" não se
 * transforme em várias implementações da mesma frase, a leitura mora aqui — um
 * módulo puro, sem Prisma e sem Nest. Cada chamador faz as suas três consultas
 * (fiscais, contas, fichas) e passa os arrays; a junção e a resolução do turno
 * são as mesmas para todos.
 *
 * O horário em si é calculado por `entradaEsperadaNoDia`/`saidaEsperadaNoDia`
 * (domínio do rodízio de domingo), que já é o que a **escala publicada** mostra à
 * equipe e o que a jornada usa no pagamento. Reaproveitá-las é o ponto: a hora
 * cobrada passa a ser, por construção, a mesma hora publicada.
 *
 * Sem efeitos colaterais — testável sem banco.
 */

import {
  ColaboradorBasicoVinculo,
  FiscalBasico,
  UsuarioBasico,
  mapearFiscalColaborador,
} from './colaborador-vinculo';
import {
  FichaEscalaTurno,
  GrupoDomingo,
  entradaEsperadaNoDia,
  saidaEsperadaNoDia,
} from '../escala-domingo/escala-domingo.domain';

/**
 * Campos da ficha que definem o turno. É o `select` que todo chamador precisa
 * fazer em `colaborador` — exportado para que ninguém esqueça um campo e receba
 * um turno pela metade.
 */
export const SELECT_FICHA_TURNO = {
  id: true,
  nome: true,
  matricula: true,
  usuarioId: true,
  ativo: true,
  folgaDiaSemana: true,
  grupoDomingo: true,
  entradaSemana: true,
  saidaSemana: true,
  entradaFds: true,
  saidaFds: true,
  entradaDom: true,
  saidaDom: true,
} as const;

/** A ficha de um colaborador com tudo o que decide o seu turno. */
export interface FichaTurno extends ColaboradorBasicoVinculo, FichaEscalaTurno {
  ativo: boolean;
}

/** Um fiscal já ligado à sua ficha. */
export interface FiscalComFicha {
  /** `Fiscal.id` — a identidade que a batida do ponto usa. */
  fiscalId: string;
  /** `Colaborador.id` — a ficha canônica. */
  colaboradorId: string;
  /** Nome da ficha (canônico), com o do registro legado como último recurso. */
  nome: string;
  matricula: string;
  ficha: FichaTurno;
}

/** Opções de `fiscaisComFicha`. */
export interface OpcoesFiscaisComFicha {
  /**
   * Vínculo `Fiscal.id` → `Colaborador.id` já gravado em outro lugar, usado
   * quando a conta de acesso não resolve.
   *
   * Existe por um caso concreto: um fiscal cuja conta foi desvinculada
   * (`usuarioId` nulo nos dois lados) deixa de ser resolvível por conta e por
   * matrícula. Sem este resgate ele desapareceria da escala — e se estivesse
   * DESLIGADO, desapareceria também do filtro que tira os desligados do quadro,
   * o que é o pior dos dois mundos: alguém que já não trabalha aqui voltaria a
   * ser tratado como "sem ficha" em vez de como inativo.
   */
  vinculosGravados?: ReadonlyMap<string, string>;
  /**
   * Incluir fiscais DESLIGADOS. Por padrão não: quem saiu do quadro não tem
   * turno a cumprir. Os relatórios que olham para trás precisam deles.
   */
  incluirInativos?: boolean;
}

/**
 * Liga cada fiscal à sua ficha, pela mesma regra de `mapearFiscalColaborador`
 * (conta de acesso e, em fallback, matrícula), com os vínculos já gravados como
 * último recurso.
 *
 * **Fiscais sem ficha nenhuma ficam de fora**, e isso é a regra, não um descuido:
 * se nenhuma ficha afirma o turno de alguém, o sistema não tem base para afirmar
 * uma expectativa de horário — era justamente a cópia semanal órfã que vinha
 * preenchendo esse vazio com um dado que ninguém revisava. Vale o mesmo que já
 * valia para operadores e supervisores.
 */
export function fiscaisComFicha(
  fiscais: readonly FiscalBasico[],
  usuarios: readonly UsuarioBasico[],
  fichas: readonly FichaTurno[],
  opcoes: OpcoesFiscaisComFicha = {},
): FiscalComFicha[] {
  const mapa = mapearFiscalColaborador(fiscais, usuarios, fichas);
  const porId = new Map(fichas.map((f) => [f.id, f]));

  const out: FiscalComFicha[] = [];
  for (const f of fiscais) {
    const colaboradorId =
      mapa.get(f.id)?.colaboradorId ?? opcoes.vinculosGravados?.get(f.id);
    if (!colaboradorId) continue;
    const ficha = porId.get(colaboradorId);
    if (!ficha) continue;
    if (!opcoes.incluirInativos && ficha.ativo === false) continue;
    out.push({
      fiscalId: f.id,
      colaboradorId: ficha.id,
      nome: ficha.nome || f.nome,
      matricula: ficha.matricula,
      ficha,
    });
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome));
}

/** Âncora do rodízio de domingo, no formato que o domínio espera. */
export type AncoraDomingo = {
  data: Date;
  ordem: readonly GrupoDomingo[];
} | null;

/** O turno de um dia: as duas pontas, ou `null` quando não há turno. */
export interface TurnoDoDia {
  entrada: string | null;
  saida: string | null;
}

/**
 * O turno que a ficha prevê para o dia — entrada e saída juntas.
 *
 * `entrada: null` significa "sem turno neste dia": folga fixa, domingo em que o
 * rodízio manda descansar, domingo sem âncora configurada ou horário simplesmente
 * não cadastrado. Quem consome isto **não cobra ponto** nesses casos.
 */
export function turnoDoDia(
  ficha: FichaEscalaTurno,
  dia: Date,
  ancoraDomingo: AncoraDomingo,
  ehFeriado = false,
): TurnoDoDia {
  return {
    entrada: entradaEsperadaNoDia(ficha, dia, ancoraDomingo, ehFeriado),
    saida: saidaEsperadaNoDia(ficha, dia, ancoraDomingo, ehFeriado),
  };
}

/**
 * Domingo de referência (2024-01-07, meia-noite UTC) para resolver um turno
 * quando só se conhece o **dia da semana**, sem data concreta.
 *
 * A escala consolidada aceita ser consultada por dia da semana ("como é a escala
 * de quinta?"). Sem uma data real não existe feriado nem posição no rodízio de
 * domingo, e é isso que `dataDeReferencia` deixa explícito: devolve um dia civil
 * qualquer com o dia da semana pedido, e quem chama assume as consequências
 * (nenhum feriado, e o domingo tratado como "sem âncora").
 */
export function dataDeReferencia(diaSemana: number): Date {
  const domingo = Date.UTC(2024, 0, 7); // 07/01/2024 foi um domingo.
  const dow = ((diaSemana % 7) + 7) % 7;
  return new Date(domingo + dow * 24 * 60 * 60 * 1000);
}
