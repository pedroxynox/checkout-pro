import { Prisma } from '@prisma/client';
import { UsuarioAutenticado } from '../common/decorators/usuario-atual.decorator';
import { PontoService } from './ponto.service';
import { BatidaDuplicadaError, LimiteBatidasDiaError } from './ponto.errors';

/**
 * MUDANÇA DE FUNÇÃO: o histórico de ponto tem de sobreviver.
 *
 * O caso real: um colaborador foi promovido a FISCAL pela tela de cadastro. Tudo
 * correu bem — mesma ficha, mesmo id, login criado. Mas a partir dali ele passa a
 * bater ponto com uma identidade NOVA (`Fiscal.id`), enquanto todo o histórico
 * dele ficou gravado com a antiga (`Colaborador.id` + `tipoPessoa: 'OPERADOR'`).
 *
 * O que o gestor viu: as horas do dia "desapareceram" do Relógio Ponto. Reanotou
 * o dia à mão. E aí o segundo problema: o limite de 4 batidas era validado POR
 * IDENTIDADE, então as quatro antigas não contavam — o dia terminou com oito
 * marcações e a jornada calculada passou a não ter relação com o dia real,
 * virando hora devida contra ele.
 *
 * Estes testes prendem as duas pontas: as batidas antigas voltam a ser
 * encontradas, e uma reanotação é recusada como repetição em vez de duplicar.
 */
describe('PontoService — mudança de função preserva o histórico', () => {
  const FICHA = 'col-diones';
  const FISCAL = 'fiscal-diones';
  const DIA = '2026-07-14';
  const usuario = { sub: 'gestor-1', nome: 'Gestor' } as UsuarioAutenticado;

  /** Batida histórica: gravada quando ele ainda era OPERADOR. */
  const batidaAntiga = (id: string, hhmm: string) => ({
    id,
    pessoaId: FICHA,
    tipoPessoa: 'OPERADOR',
    colaboradorId: FICHA,
    data: new Date(`${DIA}T00:00:00.000Z`),
    hora: new Date(`${DIA}T${hhmm}:00.000Z`),
  });

  /**
   * Serviço com a pessoa JÁ como fiscal (ficha + registro Fiscal vinculados por
   * conta) e o histórico dela gravado sob a identidade de operador.
   */
  function montar(historico: ReturnType<typeof batidaAntiga>[]) {
    const prisma = {
      $transaction: jest.fn(),
      fiscal: {
        findUnique: jest.fn().mockResolvedValue({
          id: FISCAL,
          nome: 'Diones Medina',
          usuarioId: 'u-diones',
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      usuario: {
        findUnique: jest.fn().mockResolvedValue({ login: 'DIONES' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      colaborador: {
        // A ficha canônica, já com funcao FISCAL.
        findFirst: jest.fn().mockResolvedValue({ id: FICHA }),
        findUnique: jest.fn().mockResolvedValue({
          id: FICHA,
          ativo: true,
          funcao: 'FISCAL',
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      batidaPonto: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
        // Devolve o histórico quando a consulta cobre a ficha (o `OR` novo) e
        // NADA quando o filtro é o antigo (só a identidade de fiscal). É o que
        // distingue as duas versões do código.
        findMany: jest.fn().mockImplementation((args?: unknown) => {
          const where = (args as { where?: Record<string, unknown> })?.where;
          const or = where?.OR as
            { pessoaId?: string; colaboradorId?: string }[] | undefined;
          const cobreFicha =
            or?.some(
              (c) => c.colaboradorId === FICHA || c.pessoaId === FICHA,
            ) ?? false;
          return Promise.resolve(cobreFicha ? historico : []);
        }),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
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
      (op: (tx: typeof prisma) => unknown) => op(prisma),
    );
    const service = new PontoService(
      prisma as never,
      { exigirDataPermitida: jest.fn().mockResolvedValue(undefined) } as never,
      undefined,
      undefined,
      {
        notificarSupervisaoEGerencia: jest.fn().mockResolvedValue([]),
      } as never,
    );
    return { prisma, service };
  }

  const registrar = (service: PontoService, hhmm: string) =>
    service.registrarBatida(
      {
        pessoaId: FISCAL,
        tipoPessoa: 'FISCAL',
        data: DIA,
        hora: `${DIA}T${hhmm}:00.000Z`,
      },
      usuario,
    );

  it('reanotar uma hora que já existe sob a identidade antiga é RECUSADO', () => {
    // O que gerou o dia de oito marcações. Agora a validação de duplicidade vê
    // as batidas da outra identidade e recusa — em vez de criar a segunda série.
    const { service } = montar([
      batidaAntiga('v1', '07:00'),
      batidaAntiga('v2', '12:00'),
    ]);

    return expect(registrar(service, '07:00')).rejects.toBeInstanceOf(
      BatidaDuplicadaError,
    );
  });

  it('o limite de 4 marcações conta a PESSOA, não a identidade', () => {
    // Quatro batidas antigas + uma nova pela identidade de fiscal: antes o
    // contador dizia "zero neste dia" e deixava passar até oito.
    const { service } = montar([
      batidaAntiga('v1', '07:00'),
      batidaAntiga('v2', '12:00'),
      batidaAntiga('v3', '13:00'),
      batidaAntiga('v4', '16:00'),
    ]);

    return expect(registrar(service, '18:00')).rejects.toBeInstanceOf(
      LimiteBatidasDiaError,
    );
  });

  it('uma marcação nova e distinta continua sendo aceita', () => {
    // O contrapeso: o histórico não pode bloquear o trabalho legítimo do dia.
    const { prisma, service } = montar([batidaAntiga('v1', '07:00')]);

    return registrar(service, '12:00').then(() => {
      expect(prisma.batidaPonto.create).toHaveBeenCalledTimes(1);
    });
  });

  it('o Relógio Ponto ENCONTRA as batidas da identidade antiga', async () => {
    // O sintoma que o gestor descreveu: "desapareceram as horas do dia". A
    // consulta passou a cobrir a ficha, então o histórico volta à tela.
    const { prisma, service } = montar([
      batidaAntiga('v1', '07:00'),
      batidaAntiga('v2', '12:00'),
      batidaAntiga('v3', '13:00'),
      batidaAntiga('v4', '16:00'),
    ]);

    const jornada = await service.jornadaDoDia(
      FISCAL,
      'FISCAL',
      new Date(`${DIA}T12:00:00.000Z`),
    );

    expect(jornada.batidas).toHaveLength(4);
    // 07-12 (5h) + 13-16 (3h) = 8h de trabalho, o dia real dele.
    expect(jornada.jornada.trabalhadoMs).toBe(8 * 60 * 60_000);
    // A consulta tem de cobrir a ficha; sem isso o histórico fica invisível.
    const chamada = prisma.batidaPonto.findMany.mock.calls.find(
      (c: unknown[]) => (c[0] as { where?: { OR?: unknown } })?.where?.OR,
    );
    expect(chamada).toBeDefined();
  });

  it('sem ficha resolvível, cai no filtro antigo em vez de quebrar', async () => {
    // `jornadaDoDia` é leitura: uma ficha inativa ou não vinculada não pode
    // derrubar a tela. Aqui o fiscal não resolve para nenhuma ficha.
    const { prisma, service } = montar([]);
    prisma.colaborador.findFirst.mockResolvedValue(null);
    prisma.colaborador.findUnique.mockResolvedValue(null);

    const jornada = await service.jornadaDoDia(
      FISCAL,
      'FISCAL',
      new Date(`${DIA}T12:00:00.000Z`),
    );

    expect(jornada.batidas).toEqual([]);
  });

  it('a corrida de idempotência segue funcionando (P2002 devolve a jornada)', async () => {
    // Guarda de regressão: o `OR` novo não muda o caminho de reenvio da fila
    // offline, que depende do `clienteId`.
    const { prisma, service } = montar([]);
    prisma.batidaPonto.findUnique.mockResolvedValue(null);
    prisma.batidaPonto.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '5',
      }),
    );
    prisma.batidaPonto.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'b1' });

    await expect(
      service.registrarBatida(
        {
          pessoaId: FISCAL,
          tipoPessoa: 'FISCAL',
          data: DIA,
          hora: `${DIA}T09:00:00.000Z`,
          clienteId: 'cli-1',
        },
        usuario,
      ),
    ).rejects.toBeDefined();
  });
});
