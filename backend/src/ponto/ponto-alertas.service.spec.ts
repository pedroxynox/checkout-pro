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
