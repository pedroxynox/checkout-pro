import { Prisma } from '@prisma/client';
import { PontoDeteccaoAutomaticaService } from './ponto-deteccao-automatica.service';

/**
 * Alerta PREVENTIVO de atraso (1h): quando um escalado já faz 1h da entrada
 * prevista sem bater ponto, a supervisão/gerência é avisada UMA vez por
 * pessoa/dia (trava persistente `alertaAtrasoEnviado`). Aos 2h vira falta (fora
 * do escopo deste teste).
 */
describe('PontoDeteccaoAutomaticaService — alerta de atraso (1h)', () => {
  const AGORA = new Date('2026-07-20T15:00:00.000Z'); // 12:00 em Brasília
  const DIA = new Date('2026-07-20T00:00:00.000Z');

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(AGORA);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  function criarServico(opcoes: {
    entradaPrevista: string;
    reservaDuplicada?: boolean;
  }) {
    const criarReserva = jest.fn().mockImplementation(() => {
      if (opcoes.reservaDuplicada) {
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError('duplicado', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        );
      }
      return Promise.resolve({});
    });
    const prismaFake = {
      batidaPonto: { findMany: () => Promise.resolve([]) },
      registroPontoFiscal: { findMany: () => Promise.resolve([]) },
      ausencia: { findMany: () => Promise.resolve([]) },
      incidenciaEscala: { findMany: () => Promise.resolve([]) },
      alertaAtrasoEnviado: { create: criarReserva },
    };
    const fiscais = {
      escaladosDoDia: jest.fn().mockResolvedValue([
        {
          pessoaId: 'op-1',
          tipoPessoa: 'OPERADOR' as const,
          colaboradorId: 'op-1',
          nome: 'Ana',
          funcao: 'OPERADOR',
          entradaPrevista: opcoes.entradaPrevista,
        },
      ]),
    };
    const operadores = { registrarAusencia: jest.fn().mockResolvedValue({}) };
    const notificacoes = {
      notificarComPermissao: jest.fn().mockResolvedValue([]),
    };
    const service = new PontoDeteccaoAutomaticaService(
      prismaFake as never,
      fiscais as never,
      operadores as never,
      {} as never,
      {} as never,
      notificacoes as never,
    );
    return { service, criarReserva, notificacoes };
  }

  it('avisa (uma vez) quando faz 1h da entrada sem bater ponto', async () => {
    // Entrada 11:00 e agora 12:00 (Brasília) → 60 min de atraso (ALERTA).
    const { service, criarReserva, notificacoes } = criarServico({
      entradaPrevista: '11:00',
    });
    await service.verificar();
    expect(criarReserva).toHaveBeenCalledWith({
      data: { pessoaId: 'op-1', dia: DIA },
    });
    expect(notificacoes.notificarComPermissao).toHaveBeenCalledWith(
      'CENTRAL_JORNADA',
      expect.objectContaining({
        titulo: expect.stringContaining('Atraso'),
      }),
    );
  });

  it('NÃO reenvia quando já há reserva do dia (P2002)', async () => {
    const { service, notificacoes } = criarServico({
      entradaPrevista: '11:00',
      reservaDuplicada: true,
    });
    await service.verificar();
    expect(notificacoes.notificarComPermissao).not.toHaveBeenCalled();
  });

  it('NÃO avisa antes de 1h de atraso', async () => {
    // Entrada 11:30 e agora 12:00 → 30 min (AGUARDANDO).
    const { service, criarReserva, notificacoes } = criarServico({
      entradaPrevista: '11:30',
    });
    await service.verificar();
    expect(criarReserva).not.toHaveBeenCalled();
    expect(notificacoes.notificarComPermissao).not.toHaveBeenCalled();
  });
});
