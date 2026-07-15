import { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import { PrismaService } from '../prisma/prisma.service';
import { EVENTO_STATUS_FISCAL, FiscaisGateway } from './fiscais.gateway';
import { FiscalStatusEventos } from './fiscais.eventos';
import { FiscaisService } from './fiscais.service';

/**
 * Teste de integração do WebSocket Gateway do painel de fiscais (Req 4.1.1–4.1.3).
 * Sobe um servidor real, conecta um cliente ao namespace `/fiscais` e valida que
 * `FiscaisService.definirStatus` propaga em tempo real o status atual do fiscal,
 * com o primeiro nome e o instante da transição.
 */
describe('FiscaisGateway (integração WebSocket)', () => {
  let app: INestApplication;
  let url: string;
  let fiscaisService: FiscaisService;
  let token: string;

  const definidoEm = new Date('2024-03-10T08:30:00.000Z');
  const prismaFake = {
    fiscal: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'f1', nome: 'Karen Mendoza Barro' }),
    },
    registroPontoFiscal: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'r1' }),
    },
    // Usado por `isFolgaHoje` (definirStatus): por padrão, ninguém está de folga.
    escalaEntry: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    // Usado por definirStatus para checar falta do dia: por padrão, sem falta.
    ausencia: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'segredo-de-teste' })],
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
    token = app.get(JwtService).sign({
      sub: 'u1',
      login: 'karen',
      perfil: 'GERENTE',
    });
    const porta = (app.getHttpServer().address() as AddressInfo).port;
    url = `http://localhost:${porta}/fiscais`;
  });

  afterAll(async () => {
    await app.close();
  });

  function conectar(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(url, {
        transports: ['websocket'],
        forceNew: true,
        auth: { token },
      });
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

  it('encerra a conexão de um cliente sem token (não autenticado)', async () => {
    const socket = io(url, {
      transports: ['websocket'],
      forceNew: true,
      // Sem `auth.token`: o gateway deve desconectar.
    });
    try {
      const desconectado = await new Promise<boolean>((resolve, reject) => {
        const t = setTimeout(
          () => reject(new Error('timeout: não desconectou')),
          4000,
        );
        socket.on('disconnect', () => {
          clearTimeout(t);
          resolve(true);
        });
        socket.on('connect_error', () => {
          clearTimeout(t);
          resolve(true);
        });
      });
      expect(desconectado).toBe(true);
    } finally {
      socket.close();
    }
  });

  it('propaga a mudança de status (com primeiro nome) ao cliente conectado', async () => {
    const cliente = await conectar();
    try {
      const recebido = new Promise<{
        fiscalId: string;
        primeiroNome: string;
        status: string;
        em: string;
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

      await fiscaisService.definirStatus('f1', 'INTERVALO', definidoEm);

      const evento = await recebido;
      expect(evento.fiscalId).toBe('f1');
      expect(evento.status).toBe('INTERVALO');
      expect(evento.primeiroNome).toBe('Karen');
      expect(evento.em).toBe(definidoEm.toISOString());
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

      await fiscaisService.definirStatus('f1', 'FORA_EXPEDIENTE', definidoEm);

      const [e1, e2] = await Promise.all([p1, p2]);
      expect(e1.status).toBe('FORA_EXPEDIENTE');
      expect(e2.status).toBe('FORA_EXPEDIENTE');
    } finally {
      c1.close();
      c2.close();
    }
  });
});
