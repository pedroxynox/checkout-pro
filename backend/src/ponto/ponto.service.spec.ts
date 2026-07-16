import { Prisma } from '@prisma/client';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { ValidacaoDataService } from '../data-inicial/validacao-data.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsuarioAutenticado } from '../common/decorators/usuario-atual.decorator';
import {
  LIMITE_EXTRAS_MS,
  RISCO_TAC_1H30_MS,
  RISCO_TAC_1H40_MS,
} from './ponto.domain';
import { JornadaDiaResposta, PontoService } from './ponto.service';
import {
  BatidaDuplicadaError,
  HoraForaDoDiaError,
  HoraFuturaError,
  LimiteBatidasDiaError,
  PessoaPontoInativaError,
  PessoaPontoNaoEncontradaError,
  PontoEmFolgaError,
} from './ponto.errors';

const DIA = new Date('2025-06-02T00:00:00.000Z');
const OUTRO_DIA = new Date('2025-06-01T00:00:00.000Z');

function resposta(horasExtrasMs: number, tac = false): JornadaDiaResposta {
  return {
    pessoaId: 'pessoa-1',
    tipoPessoa: 'FISCAL',
    data: DIA.toISOString(),
    jornada: {
      trabalhadoMs: 0,
      intervaloMs: 0,
      status: 'TRABALHANDO',
      baseMs: 7 * 3_600_000,
      horasExtrasMs,
      horasExtras50Ms: horasExtrasMs,
      horasExtras100Ms: 0,
      alertaIminente: horasExtrasMs >= RISCO_TAC_1H30_MS,
      tac,
      motivosTac: tac ? ['Excedeu 1h50 de horas extras'] : [],
      faltando: [],
    },
    batidas: [],
  };
}

describe('PontoService — alertas preventivos de TAC', () => {
  let prisma: {
    $transaction: jest.Mock;
    fiscal: { findUnique: jest.Mock };
    usuario: { findUnique: jest.Mock; findMany: jest.Mock };
    colaborador: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    batidaPonto: {
      count: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    alertaTacEnviado: {
      create: jest.Mock;
      createMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let notificacoes: {
    notificarSupervisaoEGerencia: jest.Mock;
  };
  let validacaoData: { exigirDataPermitida: jest.Mock };
  let service: PontoService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
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
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({ id: 'colaborador-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      batidaPonto: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      // Dedup persistente: por padrão a reserva é aceita (linha nova gravada).
      alertaTacEnviado: {
        create: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    prisma.$transaction.mockImplementation(
      (operacao: (tx: typeof prisma) => unknown) => operacao(prisma),
    );
    notificacoes = {
      notificarSupervisaoEGerencia: jest.fn().mockResolvedValue([]),
    };
    validacaoData = {
      exigirDataPermitida: jest.fn().mockResolvedValue(undefined),
    };
    service = new PontoService(
      prisma as unknown as PrismaService,
      validacaoData as unknown as ValidacaoDataService,
      undefined,
      undefined,
      notificacoes as unknown as NotificacoesService,
      undefined,
    );
  });

  /** Violação de índice único que o Prisma lança quando a etapa já existe. */
  function erroDuplicado(): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: 'test' },
    );
  }

  it('não avisa com 1h29 de extras', async () => {
    await service.avisarAlertaTacSeNecessario(
      'pessoa-1',
      'FISCAL',
      DIA,
      resposta(RISCO_TAC_1H30_MS - 60_000),
    );

    expect(notificacoes.notificarSupervisaoEGerencia).not.toHaveBeenCalled();
  });

  it('avisa uma vez em cada etapa 1h30, 1h40 e TAC', async () => {
    await service.avisarAlertaTacSeNecessario(
      'pessoa-1',
      'FISCAL',
      DIA,
      resposta(RISCO_TAC_1H30_MS),
    );
    await service.avisarAlertaTacSeNecessario(
      'pessoa-1',
      'FISCAL',
      DIA,
      resposta(RISCO_TAC_1H30_MS + 5 * 60_000),
    );
    await service.avisarAlertaTacSeNecessario(
      'pessoa-1',
      'FISCAL',
      DIA,
      resposta(RISCO_TAC_1H40_MS),
    );
    await service.avisarAlertaTacSeNecessario(
      'pessoa-1',
      'FISCAL',
      DIA,
      resposta(RISCO_TAC_1H40_MS + 5 * 60_000),
    );
    await service.avisarAlertaTacSeNecessario(
      'pessoa-1',
      'FISCAL',
      DIA,
      resposta(LIMITE_EXTRAS_MS + 1, true),
    );
    await service.avisarAlertaTacSeNecessario(
      'pessoa-1',
      'FISCAL',
      DIA,
      resposta(LIMITE_EXTRAS_MS + 10 * 60_000, true),
    );

    expect(notificacoes.notificarSupervisaoEGerencia).toHaveBeenCalledTimes(3);
    expect(notificacoes.notificarSupervisaoEGerencia).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ titulo: '⚠️ Risco de TAC' }),
    );
    expect(notificacoes.notificarSupervisaoEGerencia).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ titulo: '⚠️ Risco alto de TAC' }),
    );
    expect(notificacoes.notificarSupervisaoEGerencia).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ titulo: '⚠️ TAC na jornada' }),
    );
  });

  it('mantém a deduplicação separada mesmo ao processar outra data', async () => {
    const risco = resposta(RISCO_TAC_1H30_MS);

    await service.avisarAlertaTacSeNecessario('pessoa-1', 'FISCAL', DIA, risco);
    await service.avisarAlertaTacSeNecessario(
      'pessoa-1',
      'FISCAL',
      OUTRO_DIA,
      risco,
    );
    await service.avisarAlertaTacSeNecessario('pessoa-1', 'FISCAL', DIA, risco);

    expect(notificacoes.notificarSupervisaoEGerencia).toHaveBeenCalledTimes(2);
  });

  it('num salto direto para TAC envia somente TAC e consome etapas inferiores', async () => {
    await service.avisarAlertaTacSeNecessario(
      'pessoa-1',
      'FISCAL',
      DIA,
      resposta(LIMITE_EXTRAS_MS + 1, true),
    );
    // Mesmo que uma correção reduza a jornada depois, não envia alertas
    // inferiores ao TAC que já foi comunicado.
    await service.avisarAlertaTacSeNecessario(
      'pessoa-1',
      'FISCAL',
      DIA,
      resposta(RISCO_TAC_1H40_MS),
    );
    await service.avisarAlertaTacSeNecessario(
      'pessoa-1',
      'FISCAL',
      DIA,
      resposta(RISCO_TAC_1H30_MS),
    );

    expect(notificacoes.notificarSupervisaoEGerencia).toHaveBeenCalledTimes(1);
    expect(notificacoes.notificarSupervisaoEGerencia).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: '⚠️ TAC na jornada' }),
    );
  });

  it('falha na notificação nunca impede registrar a batida', async () => {
    notificacoes.notificarSupervisaoEGerencia.mockRejectedValueOnce(
      new Error('serviço indisponível'),
    );
    const jornada = resposta(RISCO_TAC_1H30_MS);
    jest.spyOn(service, 'jornadaDoDia').mockResolvedValue(jornada);

    await expect(
      service.registrarBatida(
        {
          pessoaId: 'pessoa-1',
          tipoPessoa: 'FISCAL',
          data: DIA.toISOString(),
          hora: '2025-06-02T15:30:00.000Z',
        },
        {
          sub: 'usuario-1',
          nome: 'Gestor',
        } as UsuarioAutenticado,
      ),
    ).resolves.toEqual(jornada);

    // A etapa não fica perdida: o próximo ciclo pode reenviar.
    await service.avisarAlertaTacSeNecessario(
      'pessoa-1',
      'FISCAL',
      DIA,
      jornada,
    );
    expect(notificacoes.notificarSupervisaoEGerencia).toHaveBeenCalledTimes(2);
  });

  it('reserva a etapa no banco (dedup persistente) antes de avisar', async () => {
    await service.avisarAlertaTacSeNecessario(
      'pessoa-1',
      'FISCAL',
      DIA,
      resposta(RISCO_TAC_1H30_MS),
    );

    expect(prisma.alertaTacEnviado.create).toHaveBeenCalledWith({
      data: { pessoaId: 'pessoa-1', dia: DIA, etapa: 'RISCO_1H30' },
    });
    expect(notificacoes.notificarSupervisaoEGerencia).toHaveBeenCalledTimes(1);
  });

  it('não reenvia após reinício: se a etapa já está persistida, não avisa', async () => {
    // Simula um reinício: uma nova instância (cache em memória vazio) encontra
    // a etapa já gravada no banco por uma execução anterior → índice único
    // recusa a reserva (P2002) e o aviso não se repete.
    prisma.alertaTacEnviado.create.mockRejectedValue(erroDuplicado());

    await service.avisarAlertaTacSeNecessario(
      'pessoa-1',
      'FISCAL',
      DIA,
      resposta(RISCO_TAC_1H30_MS),
    );

    expect(notificacoes.notificarSupervisaoEGerencia).not.toHaveBeenCalled();
  });

  it('libera a reserva quando o envio falha, permitindo novo aviso depois', async () => {
    notificacoes.notificarSupervisaoEGerencia.mockRejectedValueOnce(
      new Error('serviço indisponível'),
    );

    await service.avisarAlertaTacSeNecessario(
      'pessoa-1',
      'FISCAL',
      DIA,
      resposta(RISCO_TAC_1H30_MS),
    );

    // A reserva feita antes do envio é desfeita para o cron tentar de novo.
    expect(prisma.alertaTacEnviado.deleteMany).toHaveBeenCalledWith({
      where: { pessoaId: 'pessoa-1', dia: DIA, etapa: 'RISCO_1H30' },
    });
  });
});

describe('PontoService — validações de pessoa, data e hora', () => {
  const usuario = {
    sub: 'usuario-gestor',
    nome: 'Gestor',
  } as UsuarioAutenticado;

  function montar(escalaDomingo?: unknown) {
    const prisma = {
      $transaction: jest.fn(),
      fiscal: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'fiscal-1',
          nome: 'Ana Fiscal',
          usuarioId: 'usuario-fiscal',
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      usuario: {
        findUnique: jest.fn().mockResolvedValue({ login: 'ANA' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      colaborador: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'colaborador-1',
          ativo: true,
          funcao: 'OPERADOR',
        }),
        findFirst: jest.fn().mockResolvedValue({ id: 'colaborador-fiscal' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      batidaPonto: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      ausencia: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      alertaTacEnviado: {
        create: jest.fn(),
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(
      (operacao: (tx: typeof prisma) => unknown) => operacao(prisma),
    );
    const validacaoData = {
      exigirDataPermitida: jest.fn().mockResolvedValue(undefined),
    };
    const notificacoes = {
      notificarSupervisaoEGerencia: jest.fn().mockResolvedValue([]),
    };
    const service = new PontoService(
      prisma as never,
      validacaoData as never,
      undefined,
      undefined,
      notificacoes as never,
      undefined,
      escalaDomingo as never,
    );
    jest.spyOn(service, 'jornadaDoDia').mockResolvedValue(resposta(0));
    return { prisma, validacaoData, notificacoes, service };
  }

  it('valida a data inicial e grava a ficha ativa resolvida pelo servidor', async () => {
    const { prisma, validacaoData, service } = montar();

    await service.registrarBatida(
      {
        pessoaId: 'colaborador-1',
        colaboradorId: 'id-forjado',
        tipoPessoa: 'OPERADOR',
        data: '2026-07-10',
        hora: '2026-07-10T08:00:00.000Z',
      },
      usuario,
    );

    expect(validacaoData.exigirDataPermitida).toHaveBeenCalledWith(
      new Date('2026-07-10T00:00:00.000Z'),
    );
    expect(prisma.batidaPonto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pessoaId: 'colaborador-1',
          colaboradorId: 'colaborador-1',
        }),
      }),
    );
  });

  it('rejeita a quinta batida antes de gravar', async () => {
    const { prisma, service } = montar();
    prisma.batidaPonto.findMany.mockResolvedValue([
      { hora: new Date('2026-07-10T07:00:00.000Z') },
      { hora: new Date('2026-07-10T12:00:00.000Z') },
      { hora: new Date('2026-07-10T14:00:00.000Z') },
      { hora: new Date('2026-07-10T16:00:00.000Z') },
    ]);

    await expect(
      service.registrarBatida(
        {
          pessoaId: 'colaborador-1',
          tipoPessoa: 'OPERADOR',
          data: '2026-07-10',
          hora: '2026-07-10T18:00:00.000Z',
        },
        usuario,
      ),
    ).rejects.toBeInstanceOf(LimiteBatidasDiaError);

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(prisma.batidaPonto.create).not.toHaveBeenCalled();
  });

  it('rejeita uma batida duplicada (mesma hora ou próxima demais)', async () => {
    const { prisma, service } = montar();
    // Já existe uma batida às 08:00; a nova às 08:01 fica dentro da janela.
    prisma.batidaPonto.findMany.mockResolvedValue([
      { hora: new Date('2026-07-10T08:00:00.000Z') },
    ]);

    await expect(
      service.registrarBatida(
        {
          pessoaId: 'colaborador-1',
          tipoPessoa: 'OPERADOR',
          data: '2026-07-10',
          hora: '2026-07-10T08:01:00.000Z',
        },
        usuario,
      ),
    ).rejects.toBeInstanceOf(BatidaDuplicadaError);

    expect(prisma.batidaPonto.create).not.toHaveBeenCalled();
  });

  it('aceita uma batida distante o suficiente da existente', async () => {
    const { prisma, service } = montar();
    prisma.batidaPonto.findMany.mockResolvedValue([
      { hora: new Date('2026-07-10T08:00:00.000Z') },
    ]);

    await service.registrarBatida(
      {
        pessoaId: 'colaborador-1',
        tipoPessoa: 'OPERADOR',
        data: '2026-07-10',
        hora: '2026-07-10T12:00:00.000Z',
      },
      usuario,
    );

    expect(prisma.batidaPonto.create).toHaveBeenCalledTimes(1);
  });

  it('expõe o tipo canônico ao ler duas batidas históricas curtas', async () => {
    const { prisma, service } = montar();
    jest.restoreAllMocks();
    prisma.batidaPonto.findMany.mockResolvedValue([
      {
        id: 'b1',
        pessoaId: 'colaborador-1',
        tipoPessoa: 'OPERADOR',
        data: new Date('2026-07-10T00:00:00.000Z'),
        hora: new Date('2026-07-10T07:00:00.000Z'),
        tipo: 'ENTRADA',
        origem: 'MANUAL',
        registradoPorNome: 'Gestor',
      },
      {
        id: 'b2',
        pessoaId: 'colaborador-1',
        tipoPessoa: 'OPERADOR',
        data: new Date('2026-07-10T00:00:00.000Z'),
        hora: new Date('2026-07-10T11:00:00.000Z'),
        tipo: 'SAIDA_INTERVALO',
        origem: 'MANUAL',
        registradoPorNome: 'Gestor',
      },
    ]);

    const respostaDia = await service.jornadaDoDia(
      'colaborador-1',
      'OPERADOR',
      new Date('2026-07-10T00:00:00.000Z'),
    );

    expect(respostaDia.jornada.status).toBe('ENCERRADO');
    expect(respostaDia.batidas.map((b) => b.tipo)).toEqual([
      'ENTRADA',
      'ENCERRAMENTO',
    ]);
  });

  it('repete a transação após conflito serializável antes de aceitar a vaga', async () => {
    const { prisma, service } = montar();
    const conflito = new Prisma.PrismaClientKnownRequestError(
      'Transaction write conflict',
      { code: 'P2034', clientVersion: 'test' },
    );
    prisma.$transaction
      .mockRejectedValueOnce(conflito)
      .mockImplementationOnce((operacao: (tx: typeof prisma) => unknown) =>
        operacao(prisma),
      );

    await service.registrarBatida(
      {
        pessoaId: 'colaborador-1',
        tipoPessoa: 'OPERADOR',
        data: '2026-07-10',
        hora: '2026-07-10T18:00:00.000Z',
      },
      usuario,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.batidaPonto.create).toHaveBeenCalledTimes(1);
  });

  it('bloqueia o registro em dia de folga fixa da semana', async () => {
    const { prisma, service } = montar();
    // 13/07/2026 é segunda-feira; folgaDiaSemana 1 = segunda.
    prisma.colaborador.findUnique.mockResolvedValue({
      id: 'colaborador-1',
      ativo: true,
      funcao: 'OPERADOR',
      folgaDiaSemana: 1,
      grupoDomingo: null,
    });

    await expect(
      service.registrarBatida(
        {
          pessoaId: 'colaborador-1',
          tipoPessoa: 'OPERADOR',
          data: '2026-07-13',
          hora: '2026-07-13T08:00:00.000Z',
        },
        usuario,
      ),
    ).rejects.toBeInstanceOf(PontoEmFolgaError);
    expect(prisma.batidaPonto.create).not.toHaveBeenCalled();
  });

  it('bloqueia o registro no domingo de folga (fora do rodízio)', async () => {
    const { prisma, service } = montar();
    // 12/07/2026 é domingo; sem grupo = folga fixa de domingo.
    prisma.colaborador.findUnique.mockResolvedValue({
      id: 'colaborador-1',
      ativo: true,
      funcao: 'OPERADOR',
      folgaDiaSemana: 3,
      grupoDomingo: null,
    });

    await expect(
      service.registrarBatida(
        {
          pessoaId: 'colaborador-1',
          tipoPessoa: 'OPERADOR',
          data: '2026-07-12',
          hora: '2026-07-12T08:00:00.000Z',
        },
        usuario,
      ),
    ).rejects.toBeInstanceOf(PontoEmFolgaError);
  });

  it('bloqueia também o fiscal em dia de folga fixa', async () => {
    const { prisma, service } = montar();
    prisma.colaborador.findUnique.mockResolvedValue({
      id: 'colaborador-fiscal',
      ativo: true,
      funcao: 'FISCAL',
      folgaDiaSemana: 1, // segunda (13/07/2026)
      grupoDomingo: null,
    });

    await expect(
      service.registrarBatida(
        {
          pessoaId: 'fiscal-1',
          tipoPessoa: 'FISCAL',
          data: '2026-07-13',
          hora: '2026-07-13T08:00:00.000Z',
        },
        usuario,
      ),
    ).rejects.toBeInstanceOf(PontoEmFolgaError);
    expect(prisma.batidaPonto.create).not.toHaveBeenCalled();
  });

  it('bloqueia no domingo em que o grupo folga pelo rodízio', async () => {
    // Âncora 05/07 folga G1; ordem G1→G3→G2 → 12/07 folga G3.
    const escalaDomingo = {
      obterAncora: jest.fn().mockResolvedValue({
        data: new Date('2026-07-05T00:00:00.000Z'),
        ordem: ['G1', 'G3', 'G2'],
      }),
    };
    const { prisma, service } = montar(escalaDomingo);
    prisma.colaborador.findUnique.mockResolvedValue({
      id: 'colaborador-1',
      ativo: true,
      funcao: 'OPERADOR',
      folgaDiaSemana: 3,
      grupoDomingo: 'G3',
    });

    await expect(
      service.registrarBatida(
        {
          pessoaId: 'colaborador-1',
          tipoPessoa: 'OPERADOR',
          data: '2026-07-12',
          hora: '2026-07-12T08:00:00.000Z',
        },
        usuario,
      ),
    ).rejects.toBeInstanceOf(PontoEmFolgaError);
    expect(escalaDomingo.obterAncora).toHaveBeenCalled();
  });

  it('permite no domingo em que o grupo trabalha pelo rodízio', async () => {
    // 12/07 folga G3 → G1 trabalha.
    const escalaDomingo = {
      obterAncora: jest.fn().mockResolvedValue({
        data: new Date('2026-07-05T00:00:00.000Z'),
        ordem: ['G1', 'G3', 'G2'],
      }),
    };
    const { prisma, service } = montar(escalaDomingo);
    prisma.colaborador.findUnique.mockResolvedValue({
      id: 'colaborador-1',
      ativo: true,
      funcao: 'OPERADOR',
      folgaDiaSemana: 3,
      grupoDomingo: 'G1',
    });

    await service.registrarBatida(
      {
        pessoaId: 'colaborador-1',
        tipoPessoa: 'OPERADOR',
        data: '2026-07-12',
        hora: '2026-07-12T08:00:00.000Z',
      },
      usuario,
    );

    expect(prisma.batidaPonto.create).toHaveBeenCalledTimes(1);
  });

  it('permite o registro em dia normal (não é folga)', async () => {
    const { prisma, service } = montar();
    // 13/07/2026 é segunda; folga fixa na terça (2) → segunda é dia normal.
    prisma.colaborador.findUnique.mockResolvedValue({
      id: 'colaborador-1',
      ativo: true,
      funcao: 'OPERADOR',
      folgaDiaSemana: 2,
      grupoDomingo: null,
    });

    await service.registrarBatida(
      {
        pessoaId: 'colaborador-1',
        tipoPessoa: 'OPERADOR',
        data: '2026-07-13',
        hora: '2026-07-13T08:00:00.000Z',
      },
      usuario,
    );

    expect(prisma.batidaPonto.create).toHaveBeenCalledTimes(1);
  });

  it('avisa a supervisão quando registra ponto num dia com ausência marcada', async () => {
    const { prisma, notificacoes, service } = montar();
    prisma.ausencia.findFirst.mockResolvedValue({ id: 'aus-1' });

    await service.registrarBatida(
      {
        pessoaId: 'colaborador-1',
        tipoPessoa: 'OPERADOR',
        data: '2026-07-10',
        hora: '2026-07-10T08:00:00.000Z',
      },
      usuario,
    );

    expect(notificacoes.notificarSupervisaoEGerencia).toHaveBeenCalledWith(
      expect.objectContaining({
        titulo: expect.stringContaining('Conflito'),
      }),
    );
  });

  it('não repete o aviso de conflito em batidas seguintes do mesmo dia', async () => {
    const { prisma, notificacoes, service } = montar();
    prisma.ausencia.findFirst.mockResolvedValue({ id: 'aus-1' });
    // Já existe uma batida às 07:00 → a nova (12:00) não é a primeira do dia.
    prisma.batidaPonto.findMany.mockResolvedValue([
      { hora: new Date('2026-07-10T07:00:00.000Z') },
    ]);

    await service.registrarBatida(
      {
        pessoaId: 'colaborador-1',
        tipoPessoa: 'OPERADOR',
        data: '2026-07-10',
        hora: '2026-07-10T12:00:00.000Z',
      },
      usuario,
    );

    expect(notificacoes.notificarSupervisaoEGerencia).not.toHaveBeenCalled();
  });

  it('rejeita pessoa inexistente ou sem ficha ativa', async () => {
    const inexistente = montar();
    inexistente.prisma.fiscal.findUnique.mockResolvedValue(null);
    await expect(
      inexistente.service.registrarBatida(
        {
          pessoaId: 'nao-existe',
          tipoPessoa: 'FISCAL',
          data: '2026-07-10',
          hora: '2026-07-10T08:00:00.000Z',
        },
        usuario,
      ),
    ).rejects.toBeInstanceOf(PessoaPontoNaoEncontradaError);

    const inativa = montar();
    inativa.prisma.colaborador.findFirst.mockResolvedValue(null);
    await expect(
      inativa.service.registrarBatida(
        {
          pessoaId: 'fiscal-1',
          tipoPessoa: 'FISCAL',
          data: '2026-07-10',
          hora: '2026-07-10T08:00:00.000Z',
        },
        usuario,
      ),
    ).rejects.toBeInstanceOf(PessoaPontoInativaError);
  });

  it('rejeita hora de outro dia e hora futura', async () => {
    const foraDoDia = montar();
    await expect(
      foraDoDia.service.registrarBatida(
        {
          pessoaId: 'colaborador-1',
          tipoPessoa: 'OPERADOR',
          data: '2026-07-10',
          hora: '2026-07-11T00:01:00.000Z',
        },
        usuario,
      ),
    ).rejects.toBeInstanceOf(HoraForaDoDiaError);

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-16T12:00:00.000Z')); // 09:00 em Brasília
    try {
      const futura = montar();
      await expect(
        futura.service.registrarBatida(
          {
            pessoaId: 'colaborador-1',
            tipoPessoa: 'OPERADOR',
            data: '2026-07-16',
            hora: '2026-07-16T09:01:00.000Z',
          },
          usuario,
        ),
      ).rejects.toBeInstanceOf(HoraFuturaError);
    } finally {
      jest.useRealTimers();
    }
  });

  it('prioriza o vínculo direto do fiscal antes do fallback por matrícula', async () => {
    const { prisma, service } = montar();
    prisma.colaborador.findFirst
      .mockReset()
      .mockResolvedValueOnce({ id: 'col-vinculo-direto' })
      .mockResolvedValueOnce({ id: 'col-fallback-incorreto' });

    await service.registrarBatida(
      {
        pessoaId: 'fiscal-1',
        tipoPessoa: 'FISCAL',
        data: '2026-07-10',
        hora: '2026-07-10T08:00:00.000Z',
      },
      usuario,
    );

    expect(prisma.colaborador.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.batidaPonto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          colaboradorId: 'col-vinculo-direto',
        }),
      }),
    );
  });

  it('permite corrigir dias passados válidos, mas nunca mover para outro dia', async () => {
    const { prisma, validacaoData, service } = montar();
    prisma.batidaPonto.findUnique.mockResolvedValue({
      id: 'batida-1',
      pessoaId: 'colaborador-1',
      tipoPessoa: 'OPERADOR',
      data: new Date('2026-07-10T00:00:00.000Z'),
      hora: new Date('2026-07-10T08:00:00.000Z'),
      tipo: 'ENTRADA',
    });

    await service.editarBatida('batida-1', {
      hora: '2026-07-10T08:15:00.000Z',
    });
    expect(validacaoData.exigirDataPermitida).toHaveBeenCalledWith(
      new Date('2026-07-10T00:00:00.000Z'),
    );
    expect(prisma.batidaPonto.update).toHaveBeenCalled();

    await expect(
      service.editarBatida('batida-1', {
        hora: '2026-07-11T08:15:00.000Z',
      }),
    ).rejects.toBeInstanceOf(HoraForaDoDiaError);
  });

  it('rejeita corrigir a hora para colidir com outra batida do dia', async () => {
    const { prisma, service } = montar();
    prisma.batidaPonto.findUnique.mockResolvedValue({
      id: 'batida-1',
      pessoaId: 'colaborador-1',
      tipoPessoa: 'OPERADOR',
      data: new Date('2026-07-10T00:00:00.000Z'),
      hora: new Date('2026-07-10T08:00:00.000Z'),
      tipo: 'ENTRADA',
    });
    // Outra batida do dia (excluída a própria) às 12:00; a correção para 12:01
    // cai dentro da janela mínima.
    prisma.batidaPonto.findMany.mockResolvedValue([
      { hora: new Date('2026-07-10T12:00:00.000Z') },
    ]);

    await expect(
      service.editarBatida('batida-1', {
        hora: '2026-07-10T12:01:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BatidaDuplicadaError);
  });

  it('aplica a data inicial também ao excluir uma batida', async () => {
    const { prisma, validacaoData, service } = montar();
    const batida = {
      id: 'batida-1',
      pessoaId: 'colaborador-1',
      tipoPessoa: 'OPERADOR',
      data: new Date('2026-07-10T00:00:00.000Z'),
      hora: new Date('2026-07-10T08:00:00.000Z'),
      tipo: 'ENTRADA',
    };
    prisma.batidaPonto.findUnique.mockResolvedValue(batida);
    validacaoData.exigirDataPermitida.mockRejectedValue(
      new Error('data anterior'),
    );

    await expect(service.removerBatida('batida-1')).rejects.toThrow(
      'data anterior',
    );
    expect(prisma.batidaPonto.delete).not.toHaveBeenCalled();
  });

  it('lista e busca fiscais pelo nome canônico somente com ficha ativa', async () => {
    const { prisma, service } = montar();
    prisma.fiscal.findMany.mockResolvedValue([
      { id: 'fiscal-ativo', nome: 'Ana', usuarioId: 'u1' },
      { id: 'fiscal-inativo', nome: 'Bruno', usuarioId: 'u2' },
    ]);
    prisma.usuario.findMany.mockResolvedValue([
      { id: 'u1', login: 'ANA' },
      { id: 'u2', login: 'BRUNO' },
    ]);
    prisma.colaborador.findMany
      .mockResolvedValueOnce([
        {
          id: 'col-ana',
          nome: 'Ana Fiscal',
          matricula: 'ANA',
          usuarioId: 'u1',
        },
      ])
      .mockResolvedValueOnce([]);

    const pessoas = await service.buscarPessoas('Fiscal');

    expect(pessoas).toEqual([
      {
        id: 'fiscal-ativo',
        nome: 'Ana Fiscal',
        tipoPessoa: 'FISCAL',
        colaboradorId: 'col-ana',
      },
    ]);
  });
});

describe('PontoService — operação atômica e ponte de fiscal', () => {
  const usuario = { sub: 'gestor', nome: 'Gestor' } as UsuarioAutenticado;

  function montarComFiscal() {
    const fiscais = {
      reescreverRegistrosDoDia: jest.fn().mockResolvedValue(undefined),
      publicarStatusDoDia: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      $transaction: jest.fn(),
      fiscal: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'fiscal-1',
          nome: 'Ana Fiscal',
          usuarioId: 'usuario-fiscal',
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      usuario: {
        findUnique: jest.fn().mockResolvedValue({ login: 'ANA' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      colaborador: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({ id: 'colaborador-fiscal' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      batidaPonto: {
        create: jest.fn().mockResolvedValue({}),
        // Uma batida de entrada já registrada às 07:00 (a nova vem às 12:00).
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'b1',
            hora: new Date('2026-07-10T07:00:00.000Z'),
            tipo: 'ENTRADA',
          },
        ]),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    prisma.$transaction.mockImplementation(
      (operacao: (tx: typeof prisma) => unknown) => operacao(prisma),
    );
    const validacaoData = {
      exigirDataPermitida: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PontoService(
      prisma as never,
      validacaoData as never,
      fiscais as never,
      undefined,
      undefined,
      undefined,
    );
    return { prisma, fiscais, service };
  }

  it('reescreve o log do fiscal com o cliente da transação e publica só após o commit', async () => {
    const { prisma, fiscais, service } = montarComFiscal();

    await service.registrarBatida(
      {
        pessoaId: 'fiscal-1',
        tipoPessoa: 'FISCAL',
        data: '2026-07-10',
        hora: '2026-07-10T12:00:00.000Z',
      },
      usuario,
    );

    // A reescrita do log ocorre DENTRO da transação: recebe o cliente tx.
    expect(fiscais.reescreverRegistrosDoDia).toHaveBeenCalledTimes(1);
    const [clienteTx, fiscalId, dia, transicoes] =
      fiscais.reescreverRegistrosDoDia.mock.calls[0];
    expect(clienteTx).toBe(prisma);
    expect(fiscalId).toBe('fiscal-1');
    expect(dia).toEqual(new Date('2026-07-10T00:00:00.000Z'));
    // A entrada 07:00 (Brasília) vira DISPONIVEL às 10:00 UTC real (+3h).
    expect(transicoes).toEqual([
      { status: 'DISPONIVEL', em: new Date('2026-07-10T10:00:00.000Z') },
    ]);

    // A publicação em tempo real acontece com as mesmas transições…
    expect(fiscais.publicarStatusDoDia).toHaveBeenCalledWith(
      'fiscal-1',
      transicoes,
    );
    // …e SOMENTE depois de reescrever (pós-commit).
    expect(
      fiscais.publicarStatusDoDia.mock.invocationCallOrder[0],
    ).toBeGreaterThan(
      fiscais.reescreverRegistrosDoDia.mock.invocationCallOrder[0],
    );
  });

  it('uma falha ao publicar em tempo real não derruba a batida já gravada', async () => {
    const { prisma, fiscais, service } = montarComFiscal();
    fiscais.publicarStatusDoDia.mockRejectedValue(new Error('ws indisponível'));

    await expect(
      service.registrarBatida(
        {
          pessoaId: 'fiscal-1',
          tipoPessoa: 'FISCAL',
          data: '2026-07-10',
          hora: '2026-07-10T12:00:00.000Z',
        },
        usuario,
      ),
    ).resolves.toBeDefined();

    // A batida foi persistida (commit) mesmo com o WebSocket falhando.
    expect(prisma.batidaPonto.create).toHaveBeenCalledTimes(1);
  });
});
