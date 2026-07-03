import { Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Subscription } from 'rxjs';
import { Server, Socket } from 'socket.io';
import { origensCorsDoAmbiente } from '../common/cors';
import { NotificacaoEventos } from './notificacoes.eventos';

/** Nome do evento WebSocket emitido a cada nova notificação. */
export const EVENTO_NOTIFICACAO = 'notificacao';

/** Prefixo das salas (rooms) por usuário, para entrega individual. */
function salaDoUsuario(usuarioId: string): string {
  return `usuario:${usuarioId}`;
}

/**
 * Gateway WebSocket (Socket.IO) de notificações em tempo real.
 *
 * Cada cliente se conecta ao namespace `/notificacoes` enviando seu token JWT
 * no handshake. O gateway valida o token, identifica o usuário e o coloca numa
 * sala individual (`usuario:<id>`). Assim, ao assinar o barramento de eventos
 * (`NotificacaoEventos`), cada notificação é entregue APENAS ao seu
 * destinatário — diferente do painel de fiscais, que faz broadcast geral.
 */
@WebSocketGateway({
  namespace: '/notificacoes',
  cors: { origin: origensCorsDoAmbiente() },
})
export class NotificacoesGateway
  implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy
{
  private readonly logger = new Logger(NotificacoesGateway.name);
  private inscricao?: Subscription;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly eventos: NotificacaoEventos,
    private readonly jwt: JwtService,
  ) {}

  /** Assina o barramento e entrega cada notificação à sala do destinatário. */
  afterInit(): void {
    this.inscricao = this.eventos.eventos$.subscribe((evento) => {
      this.server.to(salaDoUsuario(evento.usuarioId)).emit(EVENTO_NOTIFICACAO, {
        id: evento.id,
        titulo: evento.titulo,
        mensagem: evento.mensagem,
        criadaEm: evento.criadaEm.toISOString(),
      });
    });
    this.logger.log('Gateway de notificações inicializado (/notificacoes).');
  }

  /** Valida o token do handshake e associa o cliente à sala do seu usuário. */
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
        return;
      }
      void client.join(salaDoUsuario(payload.sub));
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
