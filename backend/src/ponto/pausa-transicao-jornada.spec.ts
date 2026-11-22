import { VARIAVEL_PAUSA_TRANSICAO_JORNADA } from '../common/transicao-jornada';
import { PrismaService } from '../prisma/prisma.service';
import { PontoAlertasService } from './ponto-alertas.service';
import { PontoDeteccaoAutomaticaService } from './ponto-deteccao-automatica.service';
import { JornadaDiaResposta, PontoService } from './ponto.service';
import { RISCO_TAC_1H40_MS } from './ponto.domain';

/**
 * Pausa de transição da jornada (fim do 6x1 → 5x2, spec `jornada-5x2` §8).
 *
 * Com `PAUSA_TRANSICAO_JORNADA=true` o que é gerado SOZINHO a partir da ficha
 * antiga para (falta automática, atraso, TAC, ponto em folga), mas o ponto e a
 * vigilância do não-retorno continuam. Cada cenário roda com a pausa desligada
 * (comportamento de sempre) e ligada, para provar que é a pausa que muda o
 * resultado.
 */

function resposta(horasExtrasMs: number, tac = false): JornadaDiaResposta {
  return {
    pessoaId: 'pessoa-1',
    tipoPessoa: 'FISCAL',
    data: '2026-11-23T00:00:00.000Z',
    jornada: {
      trabalhadoMs: 0,
      intervaloMs: 0,
      status: 'TRABALHANDO',
      baseMs: 0,
      horasExtrasMs,
      horasExtras50Ms: horasExtrasMs,
      horasExtras100Ms: 0,
      alertaIminente: false,
      tac,
      motivosTac: tac ? ['Excedeu 1h50 de horas extras'] : [],
      faltando: [],
      naoRetornoIntervalo: false,
    },
    batidas: [],
  };
}

function comPausa(valor: 'true' | 'false' | undefined): void {
  if (valor === undefined) delete process.env[VARIAVEL_PAUSA_TRANSICAO_JORNADA];
  else process.env[VARIAVEL_PAUSA_TRANSICAO_JORNADA] = valor;
}

afterEach(() => comPausa(undefined));

describe('Pausa de transição — detecção automática', () => {
  // Segunda 23/11/2026, 12:00 em Brasília.
  const AGORA = new Date('2026-11-23T15:00:00.000Z');

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(AGORA);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  function criar(opcoes: { bateuPonto: boolean; entradaPrevista: string }) {
    const prismaFake = {
      batidaPonto: {
        findMany: () =>
          Promise.resolve(
            opcoes.bateuPonto
              ? [
                  {
                    pessoaId: 'op-1',
                    tipoPessoa: 'OPERADOR',
                    colaboradorId: 'op-1',
                  },
                ]
              : [],
          ),
      },
      registroPontoFiscal: { findMany: () => Promise.resolve([]) },
      ausencia: { findMany: () => Promise.resolve([]) },
      incidenciaEscala: { findMany: () => Promise.resolve([]) },
      exclusaoOcorrenciaAutomatica: { findMany: () => Promise.resolve([]) },
      avisoPontoEmFolga: { findMany: () => Promise.resolve([]) },
      alertaAtrasoEnviado: { create: jest.fn().mockResolvedValue({}) },
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
    const ponto = {
      jornadaDoDia: jest.fn().mockResolvedValue({
        ...resposta(0),
        jornada: { ...resposta(0).jornada, status: 'ENCERRADO' },
      }),
    };
    const notificacoes = {
      notificarComPermissao: jest.fn().mockResolvedValue([]),
    };
    const service = new PontoDeteccaoAutomaticaService(
      prismaFake as never,
      fiscais as never,
      operadores as never,
      {} as never,
      ponto as never,
      notificacoes as never,
    );
    return { service, operadores, notificacoes, ponto, prismaFake };
  }

  it('sem pausa, 3h sem bater ponto vira falta automática', async () => {
    comPausa(undefined);
    const { service, operadores } = criar({
      bateuPonto: false,
      entradaPrevista: '09:00',
    });
    await service.verificar();
    expect(operadores.registrarAusencia).toHaveBeenCalledTimes(1);
  });

  it('com pausa, não marca falta automática', async () => {
    comPausa('true');
    const { service, operadores } = criar({
      bateuPonto: false,
      entradaPrevista: '09:00',
    });
    await service.verificar();
    expect(operadores.registrarAusencia).not.toHaveBeenCalled();
  });

  it('com pausa, não avisa atraso de 1h', async () => {
    comPausa('true');
    // Entrada 11:00 e agora 12:00 → 60 min (seria ALERTA).
    const { service, notificacoes, prismaFake } = criar({
      bateuPonto: false,
      entradaPrevista: '11:00',
    });
    await service.verificar();
    expect(prismaFake.alertaAtrasoEnviado.create).not.toHaveBeenCalled();
    expect(notificacoes.notificarComPermissao).not.toHaveBeenCalled();
  });

  it('com pausa, quem bateu ponto continua vigiado para o não-retorno', async () => {
    comPausa('true');
    const { service, ponto } = criar({
      bateuPonto: true,
      entradaPrevista: '09:00',
    });
    await service.verificar();
    expect(ponto.jornadaDoDia).toHaveBeenCalledWith(
      'op-1',
      'OPERADOR',
      expect.any(Date),
    );
  });

  it('"false" é o mesmo que desligada', async () => {
    comPausa('false');
    const { service, operadores } = criar({
      bateuPonto: false,
      entradaPrevista: '09:00',
    });
    await service.verificar();
    expect(operadores.registrarAusencia).toHaveBeenCalledTimes(1);
  });
});

describe('Pausa de transição — avisos de TAC', () => {
  const DIA = new Date('2026-11-23T00:00:00.000Z');

  function criar() {
    const prisma = {
      fiscal: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'pessoa-1',
          nome: 'Ana Souza',
          usuarioId: 'usuario-fiscal',
        }),
      },
      usuario: {
        findUnique: jest.fn().mockResolvedValue({ login: 'ANA' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      colaborador: {
        findFirst: jest.fn().mockResolvedValue({ id: 'colaborador-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      alertaTacEnviado: {
        create: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      eventoAlertaTac: { create: jest.fn().mockResolvedValue({}) },
    };
    const notificacoes = {
      notificarSupervisaoEGerencia: jest.fn().mockResolvedValue([]),
    };
    const service = new PontoService(
      prisma as never,
      { exigirDataPermitida: jest.fn() } as never,
      undefined,
      undefined,
      notificacoes as never,
      undefined,
    );
    return { service, prisma, notificacoes };
  }

  it('sem pausa, 1h40 de extras avisa a supervisão', async () => {
    comPausa(undefined);
    const { service, notificacoes } = criar();
    await service.avisarAlertaTacSeNecessario(
      'pessoa-1',
      'FISCAL',
      DIA,
      resposta(RISCO_TAC_1H40_MS),
    );
    expect(notificacoes.notificarSupervisaoEGerencia).toHaveBeenCalledTimes(1);
  });

  it('com pausa, nem TAC avisa e nada é reservado', async () => {
    comPausa('true');
    const { service, prisma, notificacoes } = criar();
    await service.avisarAlertaTacSeNecessario(
      'pessoa-1',
      'FISCAL',
      DIA,
      resposta(RISCO_TAC_1H40_MS, true),
    );
    expect(notificacoes.notificarSupervisaoEGerencia).not.toHaveBeenCalled();
    expect(prisma.alertaTacEnviado.create).not.toHaveBeenCalled();
  });

  it('com pausa, o cron de TAC não recalcula ninguém', async () => {
    comPausa('true');
    const prisma = { batidaPonto: { groupBy: jest.fn() } };
    const ponto = {
      jornadaDoDia: jest.fn(),
      avisarAlertaTacSeNecessario: jest.fn(),
    };
    const cron = new PontoAlertasService(
      prisma as unknown as PrismaService,
      ponto as unknown as PontoService,
    );
    await cron.verificar();
    expect(prisma.batidaPonto.groupBy).not.toHaveBeenCalled();
    expect(ponto.jornadaDoDia).not.toHaveBeenCalled();
  });
});

describe('Pausa de transição — ponto em dia de folga', () => {
  // A batida de 23/11 10:00 (Brasília) precisa estar no passado do relógio.
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-23T15:00:00.000Z'));
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  const usuario = {
    sub: 'usuario-1',
    login: 'gestor',
    perfil: 'GERENTE',
  } as never;

  function criar() {
    const prisma = {
      $transaction: jest.fn(),
      fiscal: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      usuario: {
        findUnique: jest.fn().mockResolvedValue({ login: 'ANA' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      colaborador: {
        // 23/11/2026 é segunda-feira; folgaDiaSemana 1 = segunda (a folga ANTIGA).
        findUnique: jest.fn().mockResolvedValue({
          id: 'colaborador-1',
          ativo: true,
          funcao: 'OPERADOR',
          folgaDiaSemana: 1,
          grupoDomingo: null,
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      batidaPonto: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
      ausencia: { findFirst: jest.fn().mockResolvedValue(null) },
      alertaTacEnviado: {
        create: jest.fn(),
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      avisoPontoEmFolga: {
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    prisma.$transaction.mockImplementation(
      (operacao: (tx: typeof prisma) => unknown) => operacao(prisma),
    );
    const notificacoes = {
      notificarSupervisaoEGerencia: jest.fn().mockResolvedValue([]),
    };
    const service = new PontoService(
      prisma as never,
      { exigirDataPermitida: jest.fn().mockResolvedValue(undefined) } as never,
      undefined,
      undefined,
      notificacoes as never,
      undefined,
    );
    jest.spyOn(service, 'jornadaDoDia').mockResolvedValue(resposta(0));
    return { service, prisma, notificacoes };
  }

  const batida = {
    pessoaId: 'colaborador-1',
    tipoPessoa: 'OPERADOR' as const,
    data: '2026-11-23',
    hora: '2026-11-23T10:00:00.000Z',
  };

  it('sem pausa, avisa que bateu ponto na folga do cadastro', async () => {
    comPausa(undefined);
    const { service, prisma, notificacoes } = criar();
    await service.registrarBatida(batida, usuario);
    expect(prisma.batidaPonto.create).toHaveBeenCalledTimes(1);
    expect(prisma.avisoPontoEmFolga.create).toHaveBeenCalledTimes(1);
    expect(notificacoes.notificarSupervisaoEGerencia).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: '📅 Ponto em dia de folga' }),
    );
  });

  it('com pausa, grava o ponto e não avisa nem deixa trava', async () => {
    comPausa('true');
    const { service, prisma, notificacoes } = criar();
    await service.registrarBatida(batida, usuario);
    expect(prisma.batidaPonto.create).toHaveBeenCalledTimes(1);
    expect(prisma.avisoPontoEmFolga.create).not.toHaveBeenCalled();
    expect(notificacoes.notificarSupervisaoEGerencia).not.toHaveBeenCalled();
  });
});
