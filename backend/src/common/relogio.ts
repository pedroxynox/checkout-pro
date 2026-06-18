import { Injectable } from '@nestjs/common';

/** Token de injeção do relógio (permite substituir por um relógio fixo nos testes). */
export const RELOGIO = Symbol('RELOGIO');

/**
 * Abstração de relógio. Isola a obtenção do "agora" para que a lógica de
 * agendamento (cron) seja testável de forma determinística com um relógio
 * injetável (Tarefa 15).
 */
export interface Relogio {
  agora(): Date;
}

/** Implementação padrão baseada no relógio do sistema. */
@Injectable()
export class RelogioSistema implements Relogio {
  agora(): Date {
    return new Date();
  }
}
