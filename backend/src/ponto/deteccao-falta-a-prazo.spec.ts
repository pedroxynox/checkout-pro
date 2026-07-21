import { PontoDeteccaoAutomaticaService } from './ponto-deteccao-automatica.service';

/**
 * Regressão do bug da "ausência a prazo" x detecção automática de falta.
 *
 * Cenário: um FISCAL está de ausência a prazo (período lançado pelo gestor). A
 * ausência a prazo é gravada com a FICHA (`Colaborador.id`), mas o escalado do
 * dia é identificado pelo `Fiscal.id`. O cron de detecção automática cruza a
 * escala com o Relógio Ponto e, se ninguém bateu ponto 2h após a entrada,
 * marcaria a falta.
 *
 * Antes do fix, o cron checava a existência da falta SÓ por `pessoaId`
 * (`Fiscal.id`), não encontrava a ausência a prazo (gravada por `Colaborador.id`)
 * e remarcava uma FALTA AUTOMÁTICA DUPLICADA por cima da a prazo. O fix amplia a
 * checagem para as duas chaves (`pessoaId` E `colaboradorId`), como já faziam a
 * "equipe do dia" e a remoção ao bater ponto.
 */
describe('PontoDeteccaoAutomaticaService — ausência a prazo não vira falta automática', () => {
  const AGORA = new Date('2026-07-20T15:00:00.000Z'); // 12:00 em Brasília

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(AGORA);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  interface AusenciaFake {
    id: string;
    pessoaId: string;
    colaboradorId: string | null;
    data: Date;
  }

  function criarServico(ausencias: AusenciaFake[]) {
    const registrarFalta = jest.fn().mockResolvedValue(undefined);
    const registrarAusencia = jest.fn().mockResolvedValue({});

    // O cron carrega, UMA vez por ciclo, as faltas do dia (pessoaId +
    // colaboradorId) e os não-retornos já registrados; a checagem de "já tem
    // falta?" é feita em memória.
    const prismaFake = {
      batidaPonto: { findMany: () => Promise.resolve([]) },
      registroPontoFiscal: { findMany: () => Promise.resolve([]) },
      ausencia: {
        findMany: () =>
          Promise.resolve(
            ausencias.map((a) => ({
              pessoaId: a.pessoaId,
              colaboradorId: a.colaboradorId,
            })),
          ),
      },
      incidenciaEscala: { findMany: () => Promise.resolve([]) },
    };

    const fiscais = {
      // Um fiscal escalado às 08:00, sem batidas → 4h após a entrada.
      escaladosDoDia: jest.fn().mockResolvedValue([
        {
          pessoaId: 'fisc-1',
          tipoPessoa: 'FISCAL' as const,
          colaboradorId: 'col-1',
          nome: 'Fulano Fiscal',
          funcao: 'FISCAL',
          entradaPrevista: '08:00',
        },
      ]),
      registrarFalta,
    };
    const operadores = { registrarAusencia };

    const service = new PontoDeteccaoAutomaticaService(
      prismaFake as never,
      fiscais as never,
      operadores as never,
      {} as never,
      {} as never,
    );
    return { service, registrarFalta, registrarAusencia };
  }

  const DIA = new Date('2026-07-20T00:00:00.000Z');

  it('NÃO remarca falta quando a ausência a prazo foi gravada com a ficha (colaboradorId)', async () => {
    const { service, registrarFalta } = criarServico([
      // A prazo já vinculada à ficha (comportamento novo de registrarAusenciaPeriodo).
      { id: 'ap1', pessoaId: 'col-1', colaboradorId: 'col-1', data: DIA },
    ]);
    await service.verificar();
    expect(registrarFalta).not.toHaveBeenCalled();
  });

  it('NÃO remarca falta em faltas a prazo LEGADAS (colaboradorId nulo, keyed só por Colaborador.id)', async () => {
    const { service, registrarFalta } = criarServico([
      // Registro antigo: só `pessoaId = Colaborador.id`, sem vínculo.
      { id: 'ap2', pessoaId: 'col-1', colaboradorId: null, data: DIA },
    ]);
    await service.verificar();
    expect(registrarFalta).not.toHaveBeenCalled();
  });

  it('remarca a falta normalmente quando NÃO há ausência nenhuma no dia', async () => {
    const { service, registrarFalta } = criarServico([]);
    await service.verificar();
    expect(registrarFalta).toHaveBeenCalledTimes(1);
    expect(registrarFalta).toHaveBeenCalledWith(
      'fisc-1',
      expect.any(Date),
      expect.objectContaining({ automatica: true }),
    );
  });
});
