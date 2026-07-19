import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { StatusFiscal } from './fiscais.domain';

/**
 * Evento de atualização de status de um fiscal, propagado em tempo real ao
 * painel (Req 4.1.1–4.1.3). Carrega o status atual e o instante em que ele
 * foi definido.
 */
export interface FiscalStatusEvento {
  fiscalId: string;
  /**
   * Ficha canônica do fiscal (Cadastro Unificado). Aditivo (Fase 4 · Opção A ·
   * A.5): permite o app migrar a identidade de `fiscalId` para `colaboradorId`
   * sem quebrar — `fiscalId` continua sendo enviado durante a transição.
   */
  colaboradorId: string | null;
  primeiroNome: string;
  status: StatusFiscal;
  em: Date;
}

/**
 * Barramento de eventos de status de fiscais (Tarefa 14). Desacopla o
 * `FiscaisService` (produtor) do `FiscaisGateway` (consumidor WebSocket),
 * evitando dependência circular: ambos dependem deste injetável simples.
 *
 * O serviço publica um evento sempre que o status de um fiscal muda; o gateway
 * assina o fluxo e o repassa aos clientes conectados.
 */
@Injectable()
export class FiscalStatusEventos {
  private readonly assunto = new Subject<FiscalStatusEvento>();

  /** Publica um evento de atualização de status. */
  publicar(evento: FiscalStatusEvento): void {
    this.assunto.next(evento);
  }

  /** Fluxo observável dos eventos de status, para os consumidores. */
  get eventos$(): Observable<FiscalStatusEvento> {
    return this.assunto.asObservable();
  }
}
