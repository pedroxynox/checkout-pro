import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

/**
 * Evento de uma nova notificação destinada a um usuário, propagado em tempo
 * real ao app via WebSocket (entrega in-app instantânea, sem recarregar).
 */
export interface NotificacaoEvento {
  usuarioId: string;
  id: string;
  titulo: string;
  mensagem: string;
  criadaEm: Date;
}

/**
 * Barramento de eventos de notificações. Desacopla o `NotificacoesService`
 * (produtor) do `NotificacoesGateway` (consumidor WebSocket), seguindo o mesmo
 * padrão de `FiscalStatusEventos` e evitando dependência circular.
 */
@Injectable()
export class NotificacaoEventos {
  private readonly assunto = new Subject<NotificacaoEvento>();

  /** Publica uma nova notificação. */
  publicar(evento: NotificacaoEvento): void {
    this.assunto.next(evento);
  }

  /** Fluxo observável das notificações, para os consumidores. */
  get eventos$(): Observable<NotificacaoEvento> {
    return this.assunto.asObservable();
  }
}
