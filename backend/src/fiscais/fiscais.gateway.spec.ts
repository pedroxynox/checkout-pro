import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import { PrismaService } from '../prisma/prisma.service';
import { EVENTO_STATUS_FISCAL, FiscaisGateway } from './fiscais.gateway';
import { FiscalStatusEventos } from './fiscais.eventos';
import { FiscaisService } from './fiscais.service';

/**
 * Teste de integração do WebSocket Gateway do painel de fiscais (Tarefa 14.2,
 * Req 4.1.1–4.1.3). Sobe um servidor real, conecta um cliente Socket.IO ao
 * namespace `/fiscais` e valida que uma alteração de status via
 * `FiscaisService.alterarStatus` é propagada em tempo real ao cliente, com o
 * status atual e o instante em que foi definido.
 */
describe('FiscaisGateway (integração WebSocket)', () => {
  let app: INestApplication;
  let url: string;
  let fiscaisService: FiscaisService;

  // Prisma falso: mantém uma sessão ativa e devolve a sessão atualizada.
  const definidoEm = new Date('2024-03-10T08:30:00.000Z');
  const prismaFake = {
    sessaoFiscal: {
      findFirst: jest.fn().mockResolvedValue({
        id: 's1',
        fiscalId: 'f1',
        checkIn: new Date('2024-03-10T08:00:00.000Z'),
        checkOut: null,
        statusAtual: 'DISPONIVEL',
        statusDefinidoEm: new Date('2024-03-10T08:00:00.000Z'),
      }),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 's1',
          fiscalId: 'f1',
          checkIn: new Date('2024-03-10T08:00:00.000Z'),
          checkOut: null,
          statusAtual: data.statusAtual,
          statusDefinidoEm: data.statusDefinidoEm,
        }),
      ),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        FiscalStatusEventos,
        FiscaisGateway,
        FiscaisService,
        { provide: PrismaService, useValue: prismaFake },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);

    fiscaisService = app.get(FiscaisService);
    const porta = (app.getHttpServer().address() as AddressInfo).port;
    url = `http://localhost:${porta}/fiscais`;
  });

  afterAll(async () => {
    await app.close();
  });

  function conectar(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(url, { transports: ['websocket'], forceNew: true });
      const t = setTimeout(() => reject(new Error('timeout de conexão')), 4000);
      socket.on('connect', () => {
        clearTimeout(t);
        resolve(socket);
      });
      socket.on('connect_error', (e) => {
        clearTimeout(t);
        reject(e);
      });
    });
  }

  it('propaga a alteração de status a um cliente conectado', async () => {
    const cliente = await conectar();
    try {
      const recebido = new Promise<{
        fiscalId: string;
        status: string;
        statusDefinidoEm: string;
      }>((resolve, reject) => {
        const t = setTimeout(
          () => reject(new Error('timeout do evento')),
          4000,
        );
        cliente.on(EVENTO_STATUS_FISCAL, (e) => {
          clearTimeout(t);
          resolve(e);
        });
      });

      await fiscaisService.alterarStatus('f1', 'EM_INTERVALO', definidoEm);

      const evento = await recebido;
      expect(evento.fiscalId).toBe('f1');
      expect(evento.status).toBe('EM_INTERVALO');
      expect(evento.statusDefinidoEm).toBe(definidoEm.toISOString());
    } finally {
      cliente.close();
    }
  });

  it('propaga a um segundo cliente conectado (broadcast)', async () => {
    const c1 = await conectar();
    const c2 = await conectar();
    try {
      const aguardar = (socket: Socket) =>
        new Promise<{ status: string }>((resolve, reject) => {
          const t = setTimeout(
            () => reject(new Error('timeout do evento')),
            4000,
          );
          socket.on(EVENTO_STATUS_FISCAL, (e) => {
            clearTimeout(t);
            resolve(e);
          });
        });
      const p1 = aguardar(c1);
      const p2 = aguardar(c2);

      await fiscaisService.alterarStatus('f1', 'EM_ATENDIMENTO', definidoEm);

      const [e1, e2] = await Promise.all([p1, p2]);
      expect(e1.status).toBe('EM_ATENDIMENTO');
      expect(e2.status).toBe('EM_ATENDIMENTO');
    } finally {
      c1.close();
      c2.close();
    }
  });
});
