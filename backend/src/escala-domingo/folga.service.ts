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
 * **Se QUALQUER uma das fontes diz que a pessoa descansa, é folga.**
 *
 * O viés é deliberado e conservador: quando as duas fontes discordam, o sistema
 * não sabe a verdade — e entre "deixar de cobrar o ponto de alguém" e "marcar
 * falta em quem estava descansando", o segundo erro é muito mais grave. Um cobra
 * uma conversa; o outro mexe no registro de trabalho de uma pessoa.
 *
 * O preço dessa escolha: se a fonte desatualizada for a que diz "folga", quem
 * realmente trabalhou não será cobrado por não bater ponto. É uma omissão
 * visível (a pessoa aparece de folga na escala publicada, onde qualquer um
 * percebe), diferente da falta indevida, que aparecia como fato consumado.
 */
import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EscalaDomingoService } from './escala-domingo.service';
import { GrupoDomingo, ehDiaDeFolga } from './escala-domingo.domain';

/** Responde sobre folga nos dias que foram carregados. */
export interface ConsultorFolga {
  /**
   * `true` quando qualquer fonte diz que a pessoa descansa nesse dia.
   *
   * `ids` aceita a pessoa em **todas** as suas identidades (`Fiscal.id`,
   * `Colaborador.id`): um fiscal bate ponto por uma e tem ficha na outra, e
   * consultar só uma delas é a origem de metade dos casos em que a regra não
   * pegava.
   */
  ehFolga(dia: Date, ids: readonly (string | null | undefined)[]): boolean;
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
            where: { diaSemana: { in: diasSemana }, folga: true },
            select: {
              funcionarioId: true,
              colaboradorId: true,
              diaSemana: true,
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
    const folgaNaEscala = new Set<string>();
    for (const e of entradasDeFolga) {
      for (const id of [e.funcionarioId, e.colaboradorId]) {
        if (id) folgaNaEscala.add(`${e.diaSemana}|${id}`);
      }
    }

    const ancoraDomingo: { data: Date; ordem: readonly GrupoDomingo[] } | null =
      ancora ? { data: ancora.data, ordem: ancora.ordem } : null;

    return {
      ehFolga: (dia, ids) => {
        const diaSemana = dia.getUTCDay();
        const conhecidos = ids.filter((id): id is string => !!id);

        // Fonte 1: a escala semanal marca folga nesse dia.
        for (const id of conhecidos) {
          if (folgaNaEscala.has(`${diaSemana}|${id}`)) return true;
        }

        // Fonte 2: a ficha do colaborador (folga fixa + rodízio de domingo).
        for (const id of conhecidos) {
          const ficha = fichas.get(id);
          if (ficha && ehDiaDeFolga(ficha, dia, ancoraDomingo)) return true;
        }

        return false;
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
