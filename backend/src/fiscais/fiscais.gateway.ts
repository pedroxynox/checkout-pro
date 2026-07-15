import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Subscription } from 'rxjs';
import { Server, Socket } from 'socket.io';
import { origensCorsDoAmbiente } from '../common/cors';
import { FiscalStatusEvento, FiscalStatusEventos } from './fiscais.eventos';

/** Nome do evento WebSocket emitido a cada atualização de status. */
export const EVENTO_STATUS_FISCAL = 'fiscal:status';

/**
 * Gateway WebSocket (Socket.IO) do painel de fiscais (Tarefa 14, Req 4.1).
 *
 * Assina o barramento de eventos de status (`FiscalStatusEventos`), alimentado
 * pelo `FiscaisService.definirStatus`, e propaga em tempo real a
 * todos os clientes conectados o status atual de cada fiscal (com o primeiro
 * nome) junto com o instante em que ele foi definido (`em`).
 *
 * O namespace `/fiscais` isola o canal do painel. Cada cliente precisa enviar
 * um token JWT válido no handshake: sem ele, a conexão é encerrada, de modo que
 * o status/nome dos fiscais só chegue a usuários autenticados.
 */
@WebSocketGateway({
  namespace: '/fiscais',
  cors: { origin: origensCorsDoAmbiente() },
})
export class FiscaisGateway
  implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy
{
  private readonly logger = new Logger(FiscaisGateway.name);
  private inscricao?: Subscription;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly eventos: FiscalStatusEventos,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Ao inicializar o gateway, assina o fluxo de eventos de status e repassa
   * cada atualização aos clientes conectados via broadcast.
   */
  afterInit(): void {
    this.inscricao = this.eventos.eventos$.subscribe(
      (evento: FiscalStatusEvento) => {
        this.server.emit(EVENTO_STATUS_FISCAL, {
          fiscalId: evento.fiscalId,
          primeiroNome: evento.primeiroNome,
          status: evento.status,
          em: evento.em.toISOString(),
        });
      },
    );
    this.logger.log('Gateway do painel de fiscais inicializado (/fiscais).');
  }

  /**
   * Valida o token JWT enviado no handshake. Sem token válido, encerra a
   * conexão — assim o painel de fiscais (nomes + status) fica restrito a
   * usuários autenticados, em vez de exposto a qualquer cliente que abra o
   * WebSocket.
   */
  handleConnection(client: Socket): void {
    try {
      const token = (client.handshake.auth?.token ?? '') as string;
      if (!token) {
        client.disconnect();
        return;
      }
      const payload = this.jwt.verify<{ sub: string }>(token);
      if (!payload?.sub) {
        client.disconnect();
      }
    } catch {
      // Token inválido/expirado: encerra a conexão silenciosamente.
      client.disconnect();
    }
  }

  /** Encerra a assinatura ao destruir o módulo, evitando vazamentos. */
  onModuleDestroy(): void {
    this.inscricao?.unsubscribe();
  }
}
