import { NotFoundException } from '@nestjs/common';
import { FeedforwardService } from './feedforward.service';
import {
  PontoJaRevisadoError,
  ProrrogacaoInvalidaError,
} from './feedforward.errors';

/**
 * Testes de wiring do `FeedforwardService` com Prisma mockado: edição da
 * rodada, gestão dos pontos (adicionar, editar, prorrogar, remover), as
 * travas de ponto já revisado e o mapeamento da auditoria de prorrogação.
 */
describe('FeedforwardService', () => {
  const HOJE = new Date(Date.UTC(2026, 6, 15, 12));
  const D = (dia: number): Date => new Date(Date.UTC(2026, 6, dia));

  function pontoDb(over: Record<string, unknown> = {}) {
    return {
      id: 'p1',
      feedforwardId: 'f1',
      colaboradorId: 'c1',
      descricao: 'Agilizar o atendimento',
      prazo: D(20),
      status: 'PENDENTE',
      revisadoPorId: null,
      revisadoPorNome: null,
      revisadoEm: null,
      observacaoRevisao: null,
      prazoOriginal: null,
      prorrogacoes: 0,
      prorrogadoPorId: null,
      prorrogadoPorNome: null,
      prorrogadoEm: null,
      motivoProrrogacao: null,
      criadoEm: D(1),
      atualizadoEm: D(1),
      ...over,
    };
  }

  function rodadaDb(over: Record<string, unknown> = {}) {
    return {
      id: 'f1',
      colaboradorId: 'c1',
      data: D(1),
      liderId: 'u1',
      liderNome: 'Carlos',
      cargo: 'OPERADOR',
      pontosFortes: 'Simpatia',
      oportunidades: null,
      compromissoFinal: null,
      evolucaoNota: 3,
      fotoUrl: null,
      criadoEm: D(1),
      atualizadoEm: D(1),
      pontos: [pontoDb()],
      ...over,
    };
  }

  function criar(opts: { ponto?: any; rodada?: any } = {}) {
    const ponto = 'ponto' in opts ? opts.ponto : pontoDb();
    const rodada = 'rodada' in opts ? opts.rodada : rodadaDb();
    const prisma = {
      feedforward: {
        update: jest.fn(({ data }: any) =>
          rodada
            ? Promise.resolve({ ...rodada, ...data })
            : Promise.reject(new Error('P2025')),
        ),
        findUnique: jest.fn(() => Promise.resolve(rodada)),
      },
      feedforwardPonto: {
        findUnique: jest.fn(() => Promise.resolve(ponto)),
        create: jest.fn(({ data }: any) =>
          Promise.resolve(pontoDb({ id: 'novo', ...data })),
        ),
        update: jest.fn(({ data }: any) => {
          const resolvido = { ...ponto, ...data };
          if (data.prorrogacoes?.increment) {
            resolvido.prorrogacoes = ponto.prorrogacoes + data.prorrogacoes.increment;
          }
          return Promise.resolve(resolvido);
        }),
        delete: jest.fn(() => Promise.resolve(ponto)),
      },
    };
    const service = new FeedforwardService(prisma as any);
    return { service, prisma };
  }

  describe('editar', () => {
    it('atualiza só os campos enviados, limpando textos vazios', async () => {
      const { service, prisma } = criar();
      const r = await service.editar('f1', {
        pontosFortes: '  Muito simpática  ',
        oportunidades: '   ',
        evolucaoNota: 5,
      });
      const { data } = prisma.feedforward.update.mock.calls[0][0] as any;
      expect(data).toEqual({
        pontosFortes: 'Muito simpática',
        oportunidades: null,
        evolucaoNota: 5,
      });
      expect(r.pontosFortes).toBe('Muito simpática');
      expect(r.evolucaoNota).toBe(5);
    });

    it('normaliza a data ao início do dia e permite remover a nota', async () => {
      const { service, prisma } = criar();
      await service.editar('f1', {
        data: '2026-07-10T18:30:00.000Z',
        evolucaoNota: null,
      });
      const { data } = prisma.feedforward.update.mock.calls[0][0] as any;
      expect(data.data).toEqual(D(10));
      expect(data.evolucaoNota).toBeNull();
    });

    it('rodada inexistente → NotFoundException', async () => {
      const { service } = criar({ rodada: null });
      await expect(service.editar('x', { evolucaoNota: 2 })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('adicionarPonto', () => {
    it('cria o ponto na rodada, herdando o colaborador e normalizando o prazo', async () => {
      const { service, prisma } = criar();
      const p = await service.adicionarPonto('f1', {
        descricao: '  Conferir o troco ',
        prazo: '2026-08-01T15:00:00.000Z',
      });
      const { data } = prisma.feedforwardPonto.create.mock.calls[0][0] as any;
      expect(data).toEqual({
        feedforwardId: 'f1',
        colaboradorId: 'c1',
        descricao: 'Conferir o troco',
        prazo: new Date(Date.UTC(2026, 7, 1)),
      });
      expect(p.status).toBe('PENDENTE');
    });

    it('rodada inexistente → NotFoundException (não cria nada)', async () => {
      const { service, prisma } = criar({ rodada: null });
      await expect(
        service.adicionarPonto('x', { descricao: 'Algo', prazo: '2026-08-01' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.feedforwardPonto.create).not.toHaveBeenCalled();
    });
  });

  describe('editarPonto', () => {
    it('edita a descrição de um ponto pendente', async () => {
      const { service, prisma } = criar();
      const p = await service.editarPonto('p1', '  Nova descrição ');
      expect(prisma.feedforwardPonto.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { descricao: 'Nova descrição' },
      });
      expect(p.descricao).toBe('Nova descrição');
    });

    it('ponto revisado → PontoJaRevisadoError (sem gravar)', async () => {
      const { service, prisma } = criar({
        ponto: pontoDb({ status: 'ATINGIDO' }),
      });
      await expect(service.editarPonto('p1', 'X y')).rejects.toThrow(
        PontoJaRevisadoError,
      );
      expect(prisma.feedforwardPonto.update).not.toHaveBeenCalled();
    });

    it('ponto inexistente → NotFoundException', async () => {
      const { service } = criar({ ponto: null });
      await expect(service.editarPonto('x', 'Algo')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('prorrogarPonto', () => {
    it('na primeira prorrogação guarda o prazo original e a auditoria', async () => {
      const { service, prisma } = criar();
      const p = await service.prorrogarPonto(
        'p1',
        '2026-08-10',
        { id: 'u2', nome: 'Bia' },
        '  Precisa de mais prática ',
        HOJE,
      );
      const { data } = prisma.feedforwardPonto.update.mock.calls[0][0] as any;
      expect(data).toEqual({
        prazo: new Date(Date.UTC(2026, 7, 10)),
        prazoOriginal: D(20),
        prorrogacoes: { increment: 1 },
        prorrogadoPorId: 'u2',
        prorrogadoPorNome: 'Bia',
        prorrogadoEm: HOJE,
        motivoProrrogacao: 'Precisa de mais prática',
      });
      expect(p.prorrogacoes).toBe(1);
      expect(p.prazoOriginal).toBe(D(20).toISOString());
      expect(p.prorrogadoPorNome).toBe('Bia');
      expect(p.motivoProrrogacao).toBe('Precisa de mais prática');
      // O semáforo reflete o novo prazo (bem no futuro → EM_DIA).
      expect(p.prazo).toBe(new Date(Date.UTC(2026, 7, 10)).toISOString());
    });

    it('nas seguintes mantém o prazo original da primeira vez', async () => {
      const { service, prisma } = criar({
        ponto: pontoDb({ prazoOriginal: D(5), prorrogacoes: 1 }),
      });
      const p = await service.prorrogarPonto('p1', '2026-08-10', {}, undefined, HOJE);
      const { data } = prisma.feedforwardPonto.update.mock.calls[0][0] as any;
      expect(data.prazoOriginal).toEqual(D(5));
      expect(data.motivoProrrogacao).toBeNull();
      expect(data.prorrogadoPorNome).toBeNull();
      expect(p.prorrogacoes).toBe(2);
    });

    it('prorroga um ponto já vencido para uma data futura', async () => {
      const { service } = criar({ ponto: pontoDb({ prazo: D(10) }) });
      await expect(
        service.prorrogarPonto('p1', '2026-07-30', {}, undefined, HOJE),
      ).resolves.toBeDefined();
    });

    it('recusa novo prazo que não estende o atual', async () => {
      const { service, prisma } = criar();
      await expect(
        service.prorrogarPonto('p1', '2026-07-18', {}, undefined, HOJE),
      ).rejects.toThrow(ProrrogacaoInvalidaError);
      expect(prisma.feedforwardPonto.update).not.toHaveBeenCalled();
    });

    it('recusa ponto já revisado', async () => {
      const { service } = criar({
        ponto: pontoDb({ status: 'NAO_ATINGIDO' }),
      });
      await expect(
        service.prorrogarPonto('p1', '2026-08-10', {}, undefined, HOJE),
      ).rejects.toThrow(PontoJaRevisadoError);
    });

    it('ponto inexistente → NotFoundException', async () => {
      const { service } = criar({ ponto: null });
      await expect(
        service.prorrogarPonto('x', '2026-08-10', {}, undefined, HOJE),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removerPonto', () => {
    it('remove um ponto pendente', async () => {
      const { service, prisma } = criar();
      await service.removerPonto('p1');
      expect(prisma.feedforwardPonto.delete).toHaveBeenCalledWith({
        where: { id: 'p1' },
      });
    });

    it('não remove ponto revisado (é histórico)', async () => {
      const { service, prisma } = criar({
        ponto: pontoDb({ status: 'ATINGIDO' }),
      });
      await expect(service.removerPonto('p1')).rejects.toThrow(
        PontoJaRevisadoError,
      );
      expect(prisma.feedforwardPonto.delete).not.toHaveBeenCalled();
    });
  });

  it('o histórico expõe os campos de prorrogação mapeados', async () => {
    const { service, prisma } = criar();
    (prisma.feedforward as any).findMany = jest.fn(() =>
      Promise.resolve([
        rodadaDb({
          pontos: [
            pontoDb({
              prazoOriginal: D(5),
              prorrogacoes: 2,
              prorrogadoPorNome: 'Bia',
              prorrogadoEm: D(14),
              motivoProrrogacao: 'Férias',
            }),
          ],
        }),
      ]),
    );
    const [r] = await service.listarDoColaborador('c1');
    expect(r.cargo).toBe('OPERADOR');
    expect(r.pontos[0]).toMatchObject({
      prazoOriginal: D(5).toISOString(),
      prorrogacoes: 2,
      prorrogadoPorNome: 'Bia',
      prorrogadoEm: D(14).toISOString(),
      motivoProrrogacao: 'Férias',
    });
  });
});
