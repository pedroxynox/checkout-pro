import { inicioDoDia } from '../common/datas';
import { PrismaService } from '../prisma/prisma.service';
import { PontoAlertasService } from './ponto-alertas.service';
import { JornadaDiaResposta, PontoService } from './ponto.service';

function resposta(pessoaId: string, tipoPessoa: string): JornadaDiaResposta {
  return {
    pessoaId,
    tipoPessoa,
    data: '2025-06-02T00:00:00.000Z',
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
      naoRetornoIntervalo: false,
    },
    batidas: [],
  };
}

describe('PontoAlertasService', () => {
  it('verifica fiscais e operadores e delega ao anti-spam compartilhado', async () => {
    const prisma = {
      batidaPonto: {
        groupBy: jest.fn().mockResolvedValue([
          { pessoaId: 'fiscal-1', tipoPessoa: 'FISCAL' },
          { pessoaId: 'operador-1', tipoPessoa: 'OPERADOR' },
          { pessoaId: 'ignorado-1', tipoPessoa: 'OUTRO' },
        ]),
      },
    };
    const ponto = {
      jornadaDoDia: jest
        .fn()
        .mockImplementation((pessoaId: string, tipoPessoa: string) =>
          Promise.resolve(resposta(pessoaId, tipoPessoa)),
        ),
      avisarAlertaTacSeNecessario: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PontoAlertasService(
      prisma as unknown as PrismaService,
      ponto as unknown as PontoService,
    );

    await service.verificar();

    expect(ponto.jornadaDoDia).toHaveBeenCalledTimes(2);
    expect(ponto.avisarAlertaTacSeNecessario).toHaveBeenCalledTimes(2);
    expect(ponto.jornadaDoDia).toHaveBeenCalledWith(
      'fiscal-1',
      'FISCAL',
      expect.any(Date),
    );
    expect(ponto.jornadaDoDia).toHaveBeenCalledWith(
      'operador-1',
      'OPERADOR',
      expect.any(Date),
    );
  });
});

/**
 * Regressão: o verificador deve usar o dia CIVIL de Brasília, não o dia UTC.
 * Entre 21h e 23h59 locais o instante UTC já é o dia seguinte; agrupar por
 * `inicioDoDia(new Date())` (UTC) não acharia as batidas do dia local e nenhum
 * TAC seria avisado — justo no horário de sobra do turno de fechamento.
 */
describe('PontoAlertasService — dia civil de Brasília', () => {
  // 2026-07-21T01:00Z = 22:00 de 2026-07-20 em Brasília (UTC-3).
  const AGORA = new Date('2026-07-21T01:00:00.000Z');
  const DIA_CIVIL = inicioDoDia(new Date('2026-07-20T12:00:00.000Z'));

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(AGORA);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('agrupa e verifica pelo dia local (22h de Brasília), não pelo dia UTC seguinte', async () => {
    const groupBy = jest
      .fn()
      .mockResolvedValue([{ pessoaId: 'p1', tipoPessoa: 'FISCAL' }]);
    const prisma = { batidaPonto: { groupBy } };
    const resp = resposta('p1', 'FISCAL');
    const ponto = {
      jornadaDoDia: jest.fn().mockResolvedValue(resp),
      avisarAlertaTacSeNecessario: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PontoAlertasService(
      prisma as unknown as PrismaService,
      ponto as unknown as PontoService,
    );

    await service.verificar();

    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { data: DIA_CIVIL } }),
    );
    expect(ponto.jornadaDoDia).toHaveBeenCalledWith('p1', 'FISCAL', DIA_CIVIL);
    expect(ponto.avisarAlertaTacSeNecessario).toHaveBeenCalledWith(
      'p1',
      'FISCAL',
      DIA_CIVIL,
      resp,
    );
  });
});
