import {
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { Subscription } from 'rxjs';
import { Server } from 'socket.io';
import { FiscalStatusEvento, FiscalStatusEventos } from './fiscais.eventos';

/** Nome do evento WebSocket emitido a cada atualização de status. */
export const EVENTO_STATUS_FISCAL = 'fiscal:status';

/**
 * Gateway WebSocket (Socket.IO) do painel de fiscais (Tarefa 14, Req 4.1).
 *
 * Assina o barramento de eventos de status (`FiscalStatusEventos`), alimentado
 * pelo `FiscaisService.alterarStatus`/`checkIn`, e propaga em tempo real a
 * todos os clientes conectados o status atual de cada fiscal junto com o
 * instante em que ele foi definido (`statusDefinidoEm`).
 *
 * O namespace `/fiscais` isola o canal do painel.
 */
@WebSocketGateway({ namespace: '/fiscais', cors: { origin: '*' } })
export class FiscaisGateway implements OnGatewayInit, OnModuleDestroy {
  private readonly logger = new Logger(FiscaisGateway.name);
  private inscricao?: Subscription;

  @WebSocketServer()
  server!: Server;

  constructor(private readonly eventos: FiscalStatusEventos) {}

  /**
   * Ao inicializar o gateway, assina o fluxo de eventos de status e repassa
   * cada atualização aos clientes conectados via broadcast.
   */
  afterInit(): void {
    this.inscricao = this.eventos.eventos$.subscribe(
      (evento: FiscalStatusEvento) => {
        this.server.emit(EVENTO_STATUS_FISCAL, {
          fiscalId: evento.fiscalId,
          status: evento.status,
          statusDefinidoEm: evento.statusDefinidoEm.toISOString(),
        });
      },
    );
    this.logger.log('Gateway do painel de fiscais inicializado (/fiscais).');
  }

  /** Encerra a assinatura ao destruir o módulo, evitando vazamentos. */
  onModuleDestroy(): void {
    this.inscricao?.unsubscribe();
  }
}
