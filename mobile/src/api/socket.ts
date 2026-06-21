/**
 * Cliente WebSocket (Socket.IO) do painel de fiscais em tempo real.
 *
 * Conecta ao namespace `/fiscais` do backend (ver FiscaisGateway) e assina o
 * evento `fiscal:status`, repassando cada atualização (status + instante) ao
 * consumidor. O token de autenticação é enviado no handshake.
 */
import { io, Socket } from 'socket.io-client';
import {
  API_BASE_URL,
  WS_NAMESPACE_FISCAIS,
  WS_NAMESPACE_NOTIFICACOES,
} from './config';
import { tokenStorage } from './tokenStorage';
import { EventoStatusFiscal } from './types';

/** Nome do evento emitido pelo gateway a cada atualização de status. */
export const EVENTO_STATUS_FISCAL = 'fiscal:status';

/** Nome do evento emitido pelo gateway a cada nova notificação. */
export const EVENTO_NOTIFICACAO = 'notificacao';

/** Notificação recebida em tempo real via WebSocket. */
export interface EventoNotificacao {
  id: string;
  titulo: string;
  mensagem: string;
  criadaEm: string;
}

export interface ConexaoFiscais {
  socket: Socket;
  desconectar: () => void;
}

/**
 * Abre uma conexão com o painel de fiscais. Retorna o socket e uma função para
 * encerrar a conexão. Os callbacks são opcionais e tratam eventos de conexão.
 */
export async function conectarPainelFiscais(handlers: {
  aoAtualizarStatus: (evento: EventoStatusFiscal) => void;
  aoConectar?: () => void;
  aoDesconectar?: (motivo: string) => void;
  aoErro?: (erro: Error) => void;
}): Promise<ConexaoFiscais> {
  const token = await tokenStorage.obterToken();

  const socket: Socket = io(`${API_BASE_URL}${WS_NAMESPACE_FISCAIS}`, {
    transports: ['websocket'],
    auth: token ? { token } : undefined,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1500,
  });

  socket.on('connect', () => handlers.aoConectar?.());
  socket.on('disconnect', (motivo: string) =>
    handlers.aoDesconectar?.(motivo),
  );
  socket.on('connect_error', (erro: Error) => handlers.aoErro?.(erro));
  socket.on(EVENTO_STATUS_FISCAL, (evento: EventoStatusFiscal) =>
    handlers.aoAtualizarStatus(evento),
  );

  return {
    socket,
    desconectar: () => {
      socket.off(EVENTO_STATUS_FISCAL);
      socket.disconnect();
    },
  };
}


export interface ConexaoNotificacoes {
  socket: Socket;
  desconectar: () => void;
}

/**
 * Abre uma conexão com o canal de notificações em tempo real (namespace
 * `/notificacoes`). O backend valida o token do handshake e entrega ao usuário
 * apenas as suas notificações. Retorna o socket e uma função para encerrar.
 */
export async function conectarNotificacoes(handlers: {
  aoReceber: (notificacao: EventoNotificacao) => void;
  aoConectar?: () => void;
  aoDesconectar?: (motivo: string) => void;
}): Promise<ConexaoNotificacoes> {
  const token = await tokenStorage.obterToken();

  const socket: Socket = io(`${API_BASE_URL}${WS_NAMESPACE_NOTIFICACOES}`, {
    transports: ['websocket'],
    auth: token ? { token } : undefined,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1500,
  });

  socket.on('connect', () => handlers.aoConectar?.());
  socket.on('disconnect', (motivo: string) => handlers.aoDesconectar?.(motivo));
  socket.on(EVENTO_NOTIFICACAO, (n: EventoNotificacao) => handlers.aoReceber(n));

  return {
    socket,
    desconectar: () => {
      socket.off(EVENTO_NOTIFICACAO);
      socket.disconnect();
    },
  };
}
