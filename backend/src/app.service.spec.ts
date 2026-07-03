import { ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppService', () => {
  let service: AppService;
  let prisma: { $queryRaw: jest.Mock };

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn() };
    service = new AppService(prisma as unknown as PrismaService);
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  it('deve retornar informações da aplicação com status ok', () => {
    const info = service.info();
    expect(info.status).toBe('ok');
    expect(info.nome).toContain('Check-out PRO');
  });

  it('saude() (liveness) retorna status ok sem tocar no banco', () => {
    expect(service.saude()).toEqual({ status: 'ok' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('prontidao() retorna ok quando o banco responde', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    await expect(service.prontidao()).resolves.toEqual({
      status: 'ok',
      banco: 'ok',
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('prontidao() lança ServiceUnavailableException quando o banco falha', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('sem conexão'));
    await expect(service.prontidao()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
