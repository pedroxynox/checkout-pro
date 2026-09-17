/**
 * Regra ÚNICA de folga: "esta pessoa descansa neste dia?".
 *
 * ## Por que este serviço existe
 *
 * A folga de uma pessoa está escrita em **duas** fontes:
 *
 * - a **ficha** do colaborador (`folgaDiaSemana` + `grupoDomingo` para o rodízio
 *   de domingo) — é a fonte dos operadores e supervisores;
 * - a **escala semanal** (`EscalaEntry.folga`) — é a fonte dos fiscais, e também
 *   guarda exceções individuais.
 *
 * Cada parte do sistema consultava **só a sua** e ignorava a outra. O resultado
 * apareceu na operação: um fiscal com folga na terça **na ficha**, mas cuja
 * escala semanal não tinha sido atualizada, era escalado pelo sistema, não
 * batia ponto (porque estava descansando) e recebia **falta automática** duas
 * horas depois — no próprio dia de descanso. E a falta não se curava sozinha,
 * porque a auto-cura espera uma batida que nunca chega num dia de folga.
 *
 * ## A regra
 *
 * A ordem importa, e é esta:
 *
 * 1. **Convocação** (`especial` com `folga = false`) ⇒ **trabalha**. É o registro
 *    mais específico e mais recente sobre aquele dia — é assim que se chama
 *    alguém no descanso, e nada vence isso.
 * 2. **Folga concedida à mão** (`especial` com `folga = true`) ⇒ **folga**. O
 *    gestor deu o dia; a ficha não desfaz uma decisão individual.
 * 3. **A ficha afirma um dia de folga** ⇒ **a ficha decide, sozinha.**
 * 4. **A ficha é omissa** (`folgaDiaSemana` nulo) ⇒ a **escala semanal** geral
 *    ainda vale.
 *
 * ### Por que o passo 3 existe (ADR 0023)
 *
 * A regra era um OU puro: qualquer fonte que dissesse "descansa" bastava. Um OU
 * trata as duas fontes como **pares**, e elas não são: a ficha é a fonte, a
 * escala semanal é a **projeção** dela (`sincronizarEscalaFiscal` a regenera a
 * cada edição do cadastro). Uma projeção velha não pode **somar** um dia de
 * descanso que a fonte não afirma — e somava: uma fiscal com folga na quinta na
 * ficha, e uma linha antiga de quarta na escala, aparecia de folga nos **dois**
 * dias. Foi o caso que abriu o ADR 0023.
 *
 * O passo 4 é o que preserva o viés conservador **onde ele ainda protege alguém**:
 * sem nada na ficha não há fonte que contradiga a escala, então ela vale.
 *
 * ### O viés, e o que se paga por ele
 *
 * Entre "deixar de cobrar o ponto de alguém" e "marcar falta em quem estava
 * descansando", o segundo erro é muito mais grave: um custa uma conversa, o outro
 * mexe no registro de trabalho de uma pessoa. É por isso que a convocação e a
 * folga concedida vencem a ficha, e que a escala vale quando a ficha se cala.
 *
 * O preço do passo 3, dito com clareza: quem era dispensado de bater ponto pelo
 * dia **velho** da escala passa a ser cobrado nesse dia. A conta fecha porque a
 * escala publicada — o documento que a equipe recebe — sempre mostrou a folga da
 * **ficha**: depois desta regra o sistema cobra exatamente o dia que a equipe lê.
 * Antes havia um dia em que ninguém era cobrado e ninguém sabia.
 */
import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EscalaDomingoService } from './escala-domingo.service';
import { GrupoDomingo, ehDiaDeFolga } from './escala-domingo.domain';

/** Responde sobre folga nos dias que foram carregados. */
export interface ConsultorFolga {
  /**
   * `true` quando a pessoa descansa nesse dia, pela ordem do cabeçalho.
   *
   * `ids` aceita a pessoa em **todas** as suas identidades (`Fiscal.id`,
   * `Colaborador.id`): um fiscal bate ponto por uma e tem ficha na outra, e
   * consultar só uma delas é a origem de metade dos casos em que a regra não
   * pegava.
   */
  ehFolga(dia: Date, ids: readonly (string | null | undefined)[]): boolean;

  /**
   * Quem, entre os `ids`, **não tem dia de folga na ficha**.
   *
   * Uma ficha sem folga é uma pessoa escalada os sete dias da semana aos olhos do
   * sistema — e nada avisava. Quem expõe isso na tela é a Escala; aqui devolvemos
   * só o fato, para a regra e o aviso não poderem discordar.
   *
   * Pessoas sem ficha nenhuma entre os `ids` ficam de fora: não se afirma falta
   * de dado sobre quem não se conhece.
   */
  semFolgaNaFicha(ids: readonly (string | null | undefined)[]): boolean;
}

/** Ficha reduzida ao que decide folga. */
interface FichaFolga {
  folgaDiaSemana: number | null;
  grupoDomingo: string | null;
}

@Injectable()
export class FolgaService {
  constructor(
    private readonly prisma: PrismaService,
    // Âncora do rodízio de domingo. Opcional para não obrigar os testes
    // unitários a montar o grafo inteiro (mesmo padrão dos outros serviços).
    @Optional() private readonly escalaDomingo?: EscalaDomingoService,
  ) {}

  /**
   * Carrega tudo o que decide folga nos `dias` informados e devolve o consultor.
   *
   * Uma consulta por fonte, não uma por pessoa: quem chama isto é a varredura de
   * cada 5 minutos e a montagem da equipe do dia.
   */
  async consultor(dias: readonly Date[]): Promise<ConsultorFolga> {
    const diasSemana = [...new Set(dias.map((d) => d.getUTCDay()))];
    const temDomingo = diasSemana.includes(0);

    const [colaboradores, entradasDeFolga, ancora] = await Promise.all([
      this.prisma.colaborador.findMany({
        select: { id: true, folgaDiaSemana: true, grupoDomingo: true },
      }),
      diasSemana.length > 0
        ? this.prisma.escalaEntry.findMany({
            where: { diaSemana: { in: diasSemana } },
            select: {
              funcionarioId: true,
              colaboradorId: true,
              diaSemana: true,
              folga: true,
            },
          })
        : Promise.resolve([]),
      // A âncora só importa no domingo; nos outros dias nem se consulta.
      temDomingo && this.escalaDomingo
        ? this.escalaDomingo.obterAncora()
        : Promise.resolve(null),
    ]);

    const fichas = new Map<string, FichaFolga>(
      colaboradores.map((c) => [
        c.id,
        {
          folgaDiaSemana: c.folgaDiaSemana ?? null,
          grupoDomingo: c.grupoDomingo ?? null,
        },
      ]),
    );
    // Chave `diaSemana|id`, com as duas identidades da escala (o vínculo com a
    // ficha pode estar vazio em escalas antigas).
    //
    // Um conjunto só. Antes havia três, porque uma entrada marcada como
    // `especial` era uma **decisão individual** que vencia a ficha: com folga era
    // "folga concedida" (vencia) e sem folga era "convocação" (mandava
    // trabalhar). As duas dependiam da exceção de horário para funcionar — uma
    // convocação sem hora não diz a que horas a pessoa vem — e a exceção de
    // horário foi removida pela ADR 0026. As linhas `especial` deixaram de
    // existir (a migração `9zzr` apagou as de horário e rebaixou as de folga a
    // entradas comuns), então aqui resta a folga GERAL, derivada da ficha.
    const folgaGeralNaEscala = new Set<string>();
    for (const e of entradasDeFolga) {
      if (!e.folga) continue;
      for (const id of [e.funcionarioId, e.colaboradorId]) {
        if (!id) continue;
        folgaGeralNaEscala.add(`${e.diaSemana}|${id}`);
      }
    }

    const ancoraDomingo: { data: Date; ordem: readonly GrupoDomingo[] } | null =
      ancora ? { data: ancora.data, ordem: ancora.ordem } : null;

    /** A ficha da pessoa, pela primeira identidade que tiver uma. */
    const fichaDe = (
      ids: readonly (string | null | undefined)[],
    ): FichaFolga | null => {
      for (const id of ids) {
        if (!id) continue;
        const ficha = fichas.get(id);
        if (ficha) return ficha;
      }
      return null;
    };

    return {
      ehFolga: (dia, ids) => {
        const diaSemana = dia.getUTCDay();
        const conhecidos = ids.filter((id): id is string => !!id);

        // 1. A FICHA, quando afirma um dia de folga, decide SOZINHA (ADR 0023).
        // A escala semanal geral é derivada dela, e um derivado velho não soma um
        // dia de descanso que a fonte não afirma. Inclui o domingo: lá a ficha
        // decide pelo rodízio, que também é dela.
        const ficha = fichaDe(conhecidos);
        if (ficha && ficha.folgaDiaSemana != null) {
          return ehDiaDeFolga(ficha, dia, ancoraDomingo);
        }

        // 2. Ficha OMISSA: aí a escala semanal geral ainda vale. Não há fonte que
        // a contradiga, e o viés conservador continua protegendo a pessoa.
        for (const id of conhecidos) {
          if (folgaGeralNaEscala.has(`${diaSemana}|${id}`)) return true;
        }

        // 3. Ficha omissa no dia da semana, mas o rodízio de domingo é dela.
        return ficha ? ehDiaDeFolga(ficha, dia, ancoraDomingo) : false;
      },

      semFolgaNaFicha: (ids) => {
        const ficha = fichaDe(ids);
        return ficha != null && ficha.folgaDiaSemana == null;
      },
    };
  }

  /** Atalho para uma pessoa num dia só. */
  async ehFolga(
    dia: Date,
    ids: readonly (string | null | undefined)[],
  ): Promise<boolean> {
    const consultor = await this.consultor([dia]);
    return consultor.ehFolga(dia, ids);
  }
}
