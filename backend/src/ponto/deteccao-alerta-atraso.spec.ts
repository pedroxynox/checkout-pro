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
      exclusaoOcorrenciaAutomatica: { findMany: () => Promise.resolve([]) },
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

/**
 * A trava do aviso é keyed só por `pessoaId`, mas uma pessoa pode ter DUAS
 * identidades de ponto (`Fiscal.id` + a ficha). Reservando uma só, a outra
 * identidade abria uma segunda linha e o MESMO atraso era avisado duas vezes.
 * Reservamos as duas, e basta uma colidir para o aviso não se repetir.
 */
describe('PontoDeteccaoAutomaticaService — atraso com identidade dupla', () => {
  const AGORA = new Date('2026-07-20T15:00:00.000Z'); // 12:00 em Brasília
  const DIA = new Date('2026-07-20T00:00:00.000Z');

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(AGORA);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  function criarServico(opcoes: { idsJaReservados?: string[] }) {
    const jaReservados = new Set(opcoes.idsJaReservados ?? []);
    const criarReserva = jest
      .fn()
      .mockImplementation((args: { data: { pessoaId: string } }) =>
        jaReservados.has(args.data.pessoaId)
          ? Promise.reject(
              new Prisma.PrismaClientKnownRequestError('duplicado', {
                code: 'P2002',
                clientVersion: 'test',
              }),
            )
          : Promise.resolve({}),
      );
    const prismaFake = {
      batidaPonto: { findMany: () => Promise.resolve([]) },
      registroPontoFiscal: { findMany: () => Promise.resolve([]) },
      ausencia: { findMany: () => Promise.resolve([]) },
      incidenciaEscala: { findMany: () => Promise.resolve([]) },
      exclusaoOcorrenciaAutomatica: { findMany: () => Promise.resolve([]) },
      alertaAtrasoEnviado: { create: criarReserva },
    };
    const fiscais = {
      escaladosDoDia: jest.fn().mockResolvedValue([
        {
          pessoaId: 'fis-1',
          tipoPessoa: 'FISCAL' as const,
          colaboradorId: 'col-9',
          nome: 'Diones',
          funcao: 'FISCAL',
          entradaPrevista: '11:00', // 60 min de atraso às 12:00
        },
      ]),
      registrarFalta: jest.fn().mockResolvedValue({}),
    };
    const notificacoes = {
      notificarComPermissao: jest.fn().mockResolvedValue([]),
    };
    const service = new PontoDeteccaoAutomaticaService(
      prismaFake as never,
      fiscais as never,
      {} as never,
      {} as never,
      {} as never,
      notificacoes as never,
    );
    return { service, criarReserva, notificacoes };
  }

  it('reserva as DUAS identidades e avisa uma única vez', async () => {
    const { service, criarReserva, notificacoes } = criarServico({});
    await service.verificar();
    expect(criarReserva).toHaveBeenCalledWith({
      data: { pessoaId: 'fis-1', dia: DIA },
    });
    expect(criarReserva).toHaveBeenCalledWith({
      data: { pessoaId: 'col-9', dia: DIA },
    });
    expect(notificacoes.notificarComPermissao).toHaveBeenCalledTimes(1);
  });

  it('NÃO reavisa quando a outra identidade já tinha reservado o dia', async () => {
    // A ficha já avisou (por exemplo, num ciclo em que a pessoa ainda era
    // operadora). A identidade nova não pode gerar um segundo aviso.
    const { service, notificacoes } = criarServico({
      idsJaReservados: ['col-9'],
    });
    await service.verificar();
    expect(notificacoes.notificarComPermissao).not.toHaveBeenCalled();
  });
});
