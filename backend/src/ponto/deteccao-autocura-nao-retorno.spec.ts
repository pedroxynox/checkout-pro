import { PontoDeteccaoAutomaticaService } from './ponto-deteccao-automatica.service';

/**
 * Auto-cura do não-retorno pelo verificador (cron): quando já existe um
 * não-retorno AUTO-detectado do dia mas a pessoa fechou o intervalo (voltou),
 * o cron o remove no próximo ciclo — cobre qualquer via de registro do retorno
 * (anotado em atraso, corrigido à mão, reenvio), não só a batida no ato.
 */
describe('PontoDeteccaoAutomaticaService — auto-cura do não-retorno', () => {
  const AGORA = new Date('2026-07-20T15:00:00.000Z'); // 12:00 em Brasília
  const DIA = new Date('2026-07-20T00:00:00.000Z');

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(AGORA);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  /** Jornada mockada: controla o flag de não-retorno e os tipos de batida. */
  function jornada(naoRetornoIntervalo: boolean, tiposBatidas: string[]) {
    return {
      jornada: { naoRetornoIntervalo },
      batidas: tiposBatidas.map((tipo) => ({
        tipo,
        hora: '2026-07-20T09:00:00.000Z',
      })),
    };
  }

  function criarServico(opcoes: {
    naoRetornosDoDia: string[];
    jornadaResposta: ReturnType<typeof jornada>;
  }) {
    const prismaFake = {
      // Operador com atividade no dia (bateu ponto) → cai em verificarNaoRetorno.
      batidaPonto: { findMany: () => Promise.resolve([{ pessoaId: 'op-1' }]) },
      registroPontoFiscal: { findMany: () => Promise.resolve([]) },
      ausencia: { findMany: () => Promise.resolve([]) },
      incidenciaEscala: {
        findMany: () =>
          Promise.resolve(
            opcoes.naoRetornosDoDia.map((colaboradorId) => ({ colaboradorId })),
          ),
      },
    };
    const fiscais = {
      escaladosDoDia: jest.fn().mockResolvedValue([
        {
          pessoaId: 'op-1',
          tipoPessoa: 'OPERADOR' as const,
          colaboradorId: 'op-1',
          nome: 'Ana',
          funcao: 'OPERADOR',
          entradaPrevista: '08:00',
        },
      ]),
    };
    const incidencias = {
      registrar: jest.fn().mockResolvedValue({}),
      removerNaoRetornoAutomatico: jest.fn().mockResolvedValue(1),
    };
    const ponto = {
      jornadaDoDia: jest.fn().mockResolvedValue(opcoes.jornadaResposta),
    };
    const service = new PontoDeteccaoAutomaticaService(
      prismaFake as never,
      fiscais as never,
      {} as never,
      incidencias as never,
      ponto as never,
    );
    return { service, incidencias };
  }

  it('remove o não-retorno auto-detectado quando a pessoa fechou o intervalo', async () => {
    const { service, incidencias } = criarServico({
      naoRetornosDoDia: ['op-1'],
      jornadaResposta: jornada(false, [
        'ENTRADA',
        'SAIDA_INTERVALO',
        'RETORNO_INTERVALO',
      ]),
    });
    await service.verificar();
    expect(incidencias.removerNaoRetornoAutomatico).toHaveBeenCalledWith(
      'op-1',
      DIA,
    );
    expect(incidencias.registrar).not.toHaveBeenCalled();
  });

  it('mantém o não-retorno quando a pessoa ainda não voltou do intervalo', async () => {
    const { service, incidencias } = criarServico({
      naoRetornosDoDia: ['op-1'],
      jornadaResposta: jornada(true, ['ENTRADA', 'SAIDA_INTERVALO']),
    });
    await service.verificar();
    expect(incidencias.removerNaoRetornoAutomatico).not.toHaveBeenCalled();
    expect(incidencias.registrar).not.toHaveBeenCalled();
  });

  it('registra o não-retorno quando ainda não existe e o intervalo passou do máximo', async () => {
    const { service, incidencias } = criarServico({
      naoRetornosDoDia: [],
      jornadaResposta: jornada(true, ['ENTRADA', 'SAIDA_INTERVALO']),
    });
    await service.verificar();
    expect(incidencias.registrar).toHaveBeenCalledTimes(1);
    expect(incidencias.removerNaoRetornoAutomatico).not.toHaveBeenCalled();
  });
});
