import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EscalaEfetiva, ItemEscalaConsolidada } from './escala.domain';
import { dataDeReferencia, turnoDoDia } from './turno-fiscal';
import { carregarFiscaisComFicha } from './turno-fiscal.consulta';
import { EscalaDomingoService } from '../escala-domingo/escala-domingo.service';
import { GrupoDomingo } from '../escala-domingo/escala-domingo.domain';
import { FeriadosService } from '../feriados/feriados.service';
import { FeriasService } from '../ferias/ferias.service';

/**
 * O que já se sabe sobre o dia, quando quem chama a escala consolidada resolveu
 * antes — a equipe do dia é o caso: ela já consultou o feriado e a âncora do
 * rodízio para os operadores. Passar o que se sabe evita duas consultas na mesma
 * requisição e, mais importante, garante que os dois ramos da equipe do dia
 * respondam ao MESMO feriado e à MESMA âncora.
 */
export interface ContextoDoDia {
  ehFeriado?: boolean;
  ancoraDomingo?: { data: Date; ordem: readonly GrupoDomingo[] } | null;
}

/** Item da escala consolidada com o nome resolvido do funcionário. */
export interface ItemEscalaConsolidadaComNome extends ItemEscalaConsolidada {
  nome: string;
  /** Ficha única correspondente (para abrir o perfil), ou null. */
  colaboradorId: string | null;
  /** Matrícula da ficha, quando resolvida. */
  matricula: string | null;
}

/**
 * Serviço da escala de trabalho dos fiscais (Req 4.3.6): a escala consolidada de
 * um dia, resolvida a partir da **ficha** de cada colaborador.
 *
 * ## O que saiu daqui (ADR 0026, etapa 2)
 *
 * Este serviço era o dono da cópia semanal (`EscalaEntry`): gravava-a, lia-a e
 * respondia com ela. Três coisas foram embora de uma vez:
 *
 * - **`cadastrarEscala`** (POST `/escala`), que gravava uma hora por dia da
 *   semana. Sem tela que a mostrasse e sem efeito sobre a hora cobrada, ela só
 *   podia enganar quem a usasse;
 * - **`resolverEscalaEfetiva`** (GET `/escala/:id/efetiva`), que ninguém
 *   consumia;
 * - **a leitura de horários da cópia semanal**, substituída pela ficha.
 *
 * O domingo já vinha da ficha (rodízio de grupos G1/G2/G3). Agora **todos os
 * dias** vêm dela, pelas mesmas funções que a escala publicada usa — a hora que
 * esta tela mostra é, por construção, a mesma que a equipe recebeu na escala e a
 * mesma que a detecção de falta cobra.
 */
@Injectable()
export class EscalaService {
  constructor(
    private readonly prisma: PrismaService,
    // Rodízio de domingo. Opcional para não quebrar testes unitários que
    // constroem o serviço sem a dependência.
    @Optional() private readonly escalaDomingo?: EscalaDomingoService,
    // Férias (inativação não rígida): num dia concreto, quem está de férias não
    // aparece na escala. Opcional pelo mesmo motivo.
    @Optional() private readonly ferias?: FeriasService,
    // Feriado segue o horário de DOMINGO da ficha (a mesma regra da escala
    // publicada e da jornada). Sem o serviço, o dia é tratado como normal.
    @Optional() private readonly feriados?: FeriadosService,
  ) {}

  /**
   * Escala consolidada de um dia (Req 4.3.6): para cada fiscal, o turno que a
   * **ficha** prevê — entrada, saída e folga —, com nome e ficha resolvidos.
   *
   * `dataISO` (`YYYY-MM-DD`) é opcional, e a diferença importa: com uma data
   * concreta valem o feriado, a posição no rodízio de domingo e as férias do dia;
   * sem ela, a resposta é o turno "típico" daquele dia da semana (ver
   * `dataDeReferencia`).
   *
   * Quem não tem turno no dia aparece como `FOLGA` em vez de desaparecer: a
   * pergunta que esta tela responde é "quem trabalha hoje?", e a ausência de uma
   * linha não distingue "descansa" de "não sei".
   */
  async escalaConsolidada(
    diaSemana: number,
    dataISO?: string,
    contexto?: ContextoDoDia,
  ): Promise<ItemEscalaConsolidadaComNome[]> {
    const dia = this.diaConcreto(diaSemana, dataISO);
    const temDataReal = dia.real;

    const comFicha = await carregarFiscaisComFicha(this.prisma);

    // A âncora só importa no domingo; nos outros dias nem se consulta. Sem data
    // real não há posição no rodízio, então também não se consulta.
    const ancora =
      temDataReal && dia.data.getUTCDay() === 0 && this.escalaDomingo
        ? await this.escalaDomingo.obterAncora()
        : null;
    const ancoraDomingo =
      contexto?.ancoraDomingo ??
      (ancora ? { data: ancora.data, ordem: ancora.ordem } : null);

    // Feriado usa o horário de DOMINGO da ficha. Um dia da semana genérico não é
    // feriado de ninguém.
    const ehFeriado =
      contexto?.ehFeriado ??
      (temDataReal && this.feriados
        ? await this.feriados.ehFeriado(dia.data)
        : false);

    // De férias na data concreta (inativação não rígida): somem da escala. A
    // escala por dia da semana não aplica férias — elas são por dia.
    const deFerias =
      temDataReal && this.ferias
        ? await this.ferias.colaboradoresDeFeriasNoDia(dia.data)
        : new Set<string>();

    const itens: ItemEscalaConsolidadaComNome[] = [];
    for (const f of comFicha) {
      if (deFerias.has(f.colaboradorId)) continue;
      const turno = turnoDoDia(f.ficha, dia.data, ancoraDomingo, ehFeriado);
      const efetiva: EscalaEfetiva = turno.entrada
        ? {
            funcionarioId: f.fiscalId,
            diaSemana: dia.data.getUTCDay(),
            entrada: turno.entrada,
            saida: turno.saida,
            // O intervalo não vive na ficha: ele é o último resquício da cópia
            // semanal e sai dela na etapa 3 (ver ADR 0026). Nenhuma tela o lê
            // aqui, então afirmar 0 é mais honesto do que reabrir a cópia.
            intervaloMin: 0,
            folga: false,
          }
        : 'FOLGA';
      itens.push({
        funcionarioId: f.fiscalId,
        efetiva,
        nome: f.nome,
        colaboradorId: f.colaboradorId,
        matricula: f.matricula,
      });
    }
    return itens;
  }

  /**
   * O dia civil a usar: a data informada, ou um dia de referência com o dia da
   * semana pedido. `real: false` avisa quem chama que não há feriado nem rodízio
   * a considerar.
   */
  private diaConcreto(
    diaSemana: number,
    dataISO?: string,
  ): { data: Date; real: boolean } {
    if (dataISO) {
      const data = new Date(`${dataISO.slice(0, 10)}T00:00:00.000Z`);
      if (!Number.isNaN(data.getTime())) return { data, real: true };
    }
    return { data: dataDeReferencia(diaSemana), real: false };
  }
}
