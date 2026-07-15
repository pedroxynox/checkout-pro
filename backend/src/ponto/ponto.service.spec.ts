import { Prisma } from '@prisma/client';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsuarioAutenticado } from '../common/decorators/usuario-atual.decorator';
import {
  LIMITE_EXTRAS_MS,
  RISCO_TAC_1H30_MS,
  RISCO_TAC_1H40_MS,
} from './ponto.domain';
import { JornadaDiaResposta, PontoService } from './ponto.service';

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
    fiscal: { findUnique: jest.Mock };
    colaborador: { findUnique: jest.Mock };
    batidaPonto: {
      create: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
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
  let service: PontoService;

  beforeEach(() => {
    prisma = {
      fiscal: {
        findUnique: jest.fn().mockResolvedValue({ nome: 'Ana Souza' }),
      },
      colaborador: { findUnique: jest.fn() },
      batidaPonto: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      // Dedup persistente: por padrão a reserva é aceita (linha nova gravada).
      alertaTacEnviado: {
        create: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    notificacoes = {
      notificarSupervisaoEGerencia: jest.fn().mockResolvedValue([]),
    };
    service = new PontoService(
      prisma as unknown as PrismaService,
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
