import { PontoDeteccaoAutomaticaService } from './ponto-deteccao-automatica.service';

/**
 * SEGUNDA FONTE de vigiados: quem bateu ponto sem estar na escala do dia.
 *
 * A vigilância automática nasceu guiada pela escala, e isso bastava enquanto o
 * ponto em dia de folga fosse recusado. Desde que passou a ser aceito (ADR 0019),
 * `escaladosDoDia` — que exclui quem está de folga — deixou de responder "quem
 * está trabalhando": a pessoa trabalhava o dia inteiro sem nenhuma verificação,
 * saía para o intervalo, não voltava, e o gestor não recebia aviso nenhum.
 *
 * O contrato que estes testes fixam:
 *  - quem tem batida hoje e não está na escala É vigiado (não-retorno);
 *  - vale inclusive quando a escala do dia vem VAZIA;
 *  - essa pessoa NUNCA recebe cobrança de atraso nem falta automática (não era
 *    esperada hoje — cobrar atraso seria absurdo e marcar falta, um bug);
 *  - quem já está na escala não é vigiado duas vezes, nem quando a batida está
 *    gravada sob a outra identidade (ficha × Fiscal.id, ADR 0020).
 */
describe('PontoDeteccaoAutomaticaService — vigilância de quem está fora da escala', () => {
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

  type BatidaFake = {
    pessoaId: string;
    tipoPessoa: 'FISCAL' | 'OPERADOR';
    colaboradorId: string | null;
  };

  function criarServico(opcoes: {
    escalados: unknown[];
    batidas: BatidaFake[];
    jornadaResposta: ReturnType<typeof jornada>;
  }) {
    const criarReserva = jest.fn().mockResolvedValue({});
    const prismaFake = {
      batidaPonto: { findMany: () => Promise.resolve(opcoes.batidas) },
      registroPontoFiscal: { findMany: () => Promise.resolve([]) },
      ausencia: { findMany: () => Promise.resolve([]) },
      incidenciaEscala: { findMany: () => Promise.resolve([]) },
      exclusaoOcorrenciaAutomatica: { findMany: () => Promise.resolve([]) },
      avisoPontoEmFolga: { findMany: () => Promise.resolve([]) },
      alertaAtrasoEnviado: { create: criarReserva },
      // O nome do vigiado sai da ficha (só rótulo de log/aviso).
      colaborador: {
        findUnique: jest.fn().mockResolvedValue({ nome: 'Diones' }),
      },
      fiscal: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const fiscais = {
      escaladosDoDia: jest.fn().mockResolvedValue(opcoes.escalados),
      registrarFalta: jest.fn().mockResolvedValue({}),
    };
    const operadores = { registrarAusencia: jest.fn().mockResolvedValue({}) };
    const incidencias = {
      registrar: jest.fn().mockResolvedValue({}),
      removerNaoRetornoAutomatico: jest.fn().mockResolvedValue(0),
    };
    const ponto = {
      jornadaDoDia: jest.fn().mockResolvedValue(opcoes.jornadaResposta),
    };
    const notificacoes = {
      notificarComPermissao: jest.fn().mockResolvedValue([]),
      notificarSupervisaoEGerencia: jest.fn().mockResolvedValue([]),
    };
    const service = new PontoDeteccaoAutomaticaService(
      prismaFake as never,
      fiscais as never,
      operadores as never,
      incidencias as never,
      ponto as never,
      notificacoes as never,
    );
    return {
      service,
      incidencias,
      ponto,
      operadores,
      fiscais,
      notificacoes,
      criarReserva,
    };
  }

  /** O operador de folga que veio trabalhar: bateu ponto, não está na escala. */
  const BATIDA_FORA_DA_ESCALA: BatidaFake = {
    pessoaId: 'op-1',
    tipoPessoa: 'OPERADOR',
    colaboradorId: 'op-1',
  };

  it('registra o não-retorno de quem bateu ponto sem estar na escala do dia', async () => {
    const { service, incidencias, ponto } = criarServico({
      escalados: [], // dia em que só trabalhou gente marcada como de folga
      batidas: [BATIDA_FORA_DA_ESCALA],
      jornadaResposta: jornada(true, ['ENTRADA', 'SAIDA_INTERVALO']),
    });

    await service.verificar();

    // A escala vazia não encerra mais o ciclo: a jornada foi calculada.
    expect(ponto.jornadaDoDia).toHaveBeenCalledWith('op-1', 'OPERADOR', DIA);
    expect(incidencias.registrar).toHaveBeenCalledTimes(1);
    expect(incidencias.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        colaboradorId: 'op-1',
        tipo: 'NAO_RETORNO_INTERVALO',
        origem: 'DETECTADO_PONTO',
      }),
      expect.anything(),
    );
  });

  it('NÃO cobra atraso nem marca falta de quem não era esperada hoje', async () => {
    // Sem hora prevista não há atraso possível: a pessoa está trabalhando num
    // dia em que o sistema não a esperava.
    const {
      service,
      operadores,
      fiscais,
      notificacoes,
      criarReserva,
      incidencias,
    } = criarServico({
      escalados: [],
      batidas: [BATIDA_FORA_DA_ESCALA],
      jornadaResposta: jornada(false, ['ENTRADA']),
    });

    await service.verificar();

    expect(operadores.registrarAusencia).not.toHaveBeenCalled();
    expect(fiscais.registrarFalta).not.toHaveBeenCalled();
    expect(criarReserva).not.toHaveBeenCalled();
    expect(notificacoes.notificarComPermissao).not.toHaveBeenCalled();
    // Intervalo em ordem → nada a registrar.
    expect(incidencias.registrar).not.toHaveBeenCalled();
  });

  it('não vigia duas vezes quem já está na escala, mesmo com a batida sob a ficha', async () => {
    // Fiscal escalado pelo `Fiscal.id`, batida gravada sob o `Colaborador.id`
    // (o estado que a mudança de função deixa). As duas chaves são comparadas,
    // então ele é UM vigiado, não dois.
    const { service, ponto, incidencias } = criarServico({
      escalados: [
        {
          pessoaId: 'fis-1',
          tipoPessoa: 'FISCAL' as const,
          colaboradorId: 'col-9',
          nome: 'Diones',
          funcao: 'FISCAL',
          entradaPrevista: '08:00',
        },
      ],
      batidas: [
        { pessoaId: 'col-9', tipoPessoa: 'OPERADOR', colaboradorId: 'col-9' },
      ],
      jornadaResposta: jornada(true, ['ENTRADA', 'SAIDA_INTERVALO']),
    });

    await service.verificar();

    expect(ponto.jornadaDoDia).toHaveBeenCalledTimes(1);
    expect(ponto.jornadaDoDia).toHaveBeenCalledWith('fis-1', 'FISCAL', DIA);
    expect(incidencias.registrar).toHaveBeenCalledTimes(1);
  });

  it('ignora a batida sem ficha (a incidência é keyed por colaborador)', async () => {
    const { service, ponto, incidencias } = criarServico({
      escalados: [],
      batidas: [
        { pessoaId: 'orfa-1', tipoPessoa: 'OPERADOR', colaboradorId: null },
      ],
      jornadaResposta: jornada(true, ['ENTRADA', 'SAIDA_INTERVALO']),
    });

    await service.verificar();

    expect(ponto.jornadaDoDia).not.toHaveBeenCalled();
    expect(incidencias.registrar).not.toHaveBeenCalled();
  });
});
