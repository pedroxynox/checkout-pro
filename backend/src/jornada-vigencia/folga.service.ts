/**
 * Regra ÚNICA de folga — "esta pessoa descansa neste dia?".
 *
 * Desde a vigência da jornada (spec `jornada-5x2`, ADR 0027) a resposta vem da
 * **jornada prevista do dia** (`JornadaVigenciaService.consultor`): a vigência
 * daquele dia ou, antes da primeira, a ficha legada. Este serviço ficou como a
 * fachada estável que os consumidores já usavam.
 *
 * No regime legado (6x1) a regra é a de sempre (ADR 0023):
 *
 * 1. a **ficha**, quando afirma um dia de folga (`folgaDiaSemana`), decide
 *    sozinha — inclusive o domingo, pelo rodízio de grupos;
 * 2. com a ficha **omissa**, vale a folga da escala semanal (`EscalaEntry`);
 * 3. ainda omissa, o rodízio de domingo da ficha.
 *
 * `ids` aceita a pessoa em **todas** as suas identidades (`Fiscal.id`,
 * `Colaborador.id`): um fiscal bate ponto por uma e tem ficha na outra.
 */
import { Injectable } from '@nestjs/common';
import { JornadaVigenciaService } from './jornada-vigencia.service';

/** Responde sobre folga nos dias que foram carregados. */
export interface ConsultorFolga {
  /** `true` quando a pessoa descansa nesse dia. */
  ehFolga(dia: Date, ids: readonly (string | null | undefined)[]): boolean;

  /**
   * Quem, entre os `ids`, **não tem folga nenhuma** na própria jornada (no
   * legado: ficha sem dia de folga). Uma pessoa assim fica escalada os sete dias
   * da semana aos olhos do sistema — quem mostra isso é a Escala; aqui só o fato.
   * Pessoas sem ficha entre os `ids` ficam de fora.
   */
  semFolgaNaFicha(ids: readonly (string | null | undefined)[]): boolean;
}

@Injectable()
export class FolgaService {
  constructor(private readonly jornada: JornadaVigenciaService) {}

  /**
   * Carrega tudo o que decide folga nos `dias` e devolve o consultor. Uma
   * consulta por fonte, não por pessoa. Perguntar por um dia que não foi
   * carregado é erro de programação e lança.
   */
  async consultor(dias: readonly Date[]): Promise<ConsultorFolga> {
    const c = await this.jornada.consultor(dias);
    return {
      ehFolga: (dia, ids) => c.ehFolga(dia, ids),
      semFolgaNaFicha: (ids) => c.semFolgaNaFicha(ids),
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
