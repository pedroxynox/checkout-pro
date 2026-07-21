import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { ValidacaoDataService } from '../data-inicial/validacao-data.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsuarioAutenticado } from '../common/decorators/usuario-atual.decorator';
import { JornadaDiaResposta, PontoService } from './ponto.service';

/**
 * Regressão: o NÃO-RETORNO AUTOMÁTICO deve sumir quando a pessoa fecha o
 * intervalo dentro do limite (registra o retorno).
 *
 * Cenário do bug: a ficha foi lançada em atraso; o verificador (cron) rodou
 * enquanto o retorno do intervalo ainda não estava registrado e marcou um
 * NAO_RETORNO_INTERVALO (origem DETECTADO_PONTO). Depois, ao registrar o
 * retorno, a jornada volta ao normal — mas o não-retorno ficava marcado. O fix
 * remove, ao registrar um retorno válido, os não-retornos AUTO-DETECTADOS do
 * dia (nunca os manuais do gestor).
 */
describe('PontoService — remove o não-retorno automático ao registrar o retorno', () => {
  const usuario = { sub: 'gestor', nome: 'Gestor' } as UsuarioAutenticado;
  const DIA = new Date('2026-07-10T00:00:00.000Z');

  /** Jornada mockada com controle do flag de não-retorno e das batidas. */
  function jornada(
    naoRetornoIntervalo: boolean,
    tiposBatidas: string[],
  ): JornadaDiaResposta {
    return {
      pessoaId: 'colaborador-1',
      tipoPessoa: 'OPERADOR',
      data: DIA.toISOString(),
      jornada: {
        trabalhadoMs: 0,
        intervaloMs: 0,
        status: 'TRABALHANDO',
        baseMs: 0,
        horasExtrasMs: 0,
        horasExtras50Ms: 0,
        horasExtras100Ms: 0,
        alertaIminente: false,
        tac: false,
        motivosTac: [],
        faltando: [],
        naoRetornoIntervalo,
      },
      batidas: tiposBatidas.map((tipo) => ({ tipo })) as never,
    };
  }

  function montar() {
    const prisma = {
      $transaction: jest.fn(),
      fiscal: { findUnique: jest.fn() },
      usuario: {
        findUnique: jest.fn().mockResolvedValue({ login: 'GESTOR' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      colaborador: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'colaborador-1',
          ativo: true,
          funcao: 'OPERADOR',
          folgaDiaSemana: 2,
          grupoDomingo: null,
        }),
        findFirst: jest.fn().mockResolvedValue({ id: 'colaborador-1' }),
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
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      incidenciaEscala: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
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
      prisma as unknown as PrismaService,
      validacaoData as unknown as ValidacaoDataService,
      undefined,
      undefined,
      notificacoes as unknown as NotificacoesService,
      undefined,
    );
    return { prisma, service };
  }

  const dto = {
    pessoaId: 'colaborador-1',
    tipoPessoa: 'OPERADOR' as const,
    data: '2026-07-10',
    hora: '2026-07-10T13:00:00.000Z',
  };

  it('remove o não-retorno AUTO-DETECTADO do dia quando o retorno é registrado', async () => {
    const { prisma, service } = montar();
    jest
      .spyOn(service, 'jornadaDoDia')
      .mockResolvedValue(
        jornada(false, ['ENTRADA', 'SAIDA_INTERVALO', 'RETORNO_INTERVALO']),
      );

    await service.registrarBatida(dto, usuario);

    expect(prisma.incidenciaEscala.deleteMany).toHaveBeenCalledWith({
      where: {
        data: DIA,
        tipo: 'NAO_RETORNO_INTERVALO',
        origem: 'DETECTADO_PONTO',
        colaboradorId: { in: ['colaborador-1', 'colaborador-1'] },
      },
    });
  });

  it('NÃO remove quando a jornada ainda está em não-retorno (retorno inválido)', async () => {
    const { prisma, service } = montar();
    jest
      .spyOn(service, 'jornadaDoDia')
      .mockResolvedValue(jornada(true, ['ENTRADA', 'SAIDA_INTERVALO']));

    await service.registrarBatida(dto, usuario);

    expect(prisma.incidenciaEscala.deleteMany).not.toHaveBeenCalled();
  });

  it('NÃO remove quando não há retorno de intervalo na jornada', async () => {
    const { prisma, service } = montar();
    jest
      .spyOn(service, 'jornadaDoDia')
      .mockResolvedValue(jornada(false, ['ENTRADA']));

    await service.registrarBatida(dto, usuario);

    expect(prisma.incidenciaEscala.deleteMany).not.toHaveBeenCalled();
  });
});
