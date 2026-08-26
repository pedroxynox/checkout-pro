import { PontoDeteccaoAutomaticaService } from './ponto-deteccao-automatica.service';

/**
 * REVALIDAÇÃO das ocorrências automáticas: a cada ciclo o sistema apaga as
 * faltas e os não-retornos que ele mesmo lançou e que **já não são verdade**.
 *
 * O que estes testes fixam, caso por caso:
 *  - a falta sai quando aparece batida (inclusive lançada em atraso), quando o
 *    dia é coberto por atestado ou ausência a prazo, e quando a pessoa está de
 *    férias;
 *  - o não retorno sai quando o intervalo é fechado;
 *  - o que uma PESSOA registrou nunca é apagado;
 *  - a exclusão do gestor é respeitada (a detecção não insiste).
 */
const AGORA = new Date('2026-07-20T15:00:00.000Z'); // 12:00 em Brasília
const DIA = new Date('2026-07-20T00:00:00.000Z'); // segunda
const ONTEM = new Date('2026-07-19T00:00:00.000Z');

interface Cenario {
  /** Faltas automáticas pendentes no ciclo. */
  faltas?: {
    id: string;
    pessoaId: string;
    colaboradorId?: string | null;
    data?: Date;
  }[];
  /** Não-retornos auto-detectados no ciclo. */
  naoRetornos?: { id: string; colaboradorId: string; data?: Date }[];
  /** Batidas do período (com o tipo, para saber se fechou o intervalo). */
  batidas?: {
    pessoaId: string;
    colaboradorId?: string | null;
    data?: Date;
    tipo?: string;
  }[];
  /** Ausências que COBREM o dia (atestado ou a prazo). */
  coberturas?: {
    pessoaId: string;
    colaboradorId?: string | null;
    data?: Date;
    atestadoId?: string | null;
    aPrazo?: boolean;
  }[];
  /** Colaboradores de férias. */
  ferias?: string[];
}

function criarServico(cenario: Cenario) {
  const faltas = (cenario.faltas ?? []).map((f) => ({
    id: f.id,
    pessoaId: f.pessoaId,
    colaboradorId: f.colaboradorId ?? f.pessoaId,
    data: f.data ?? DIA,
    automatica: true,
    atestadoId: null,
    aPrazo: false,
  }));
  const naoRetornos = (cenario.naoRetornos ?? []).map((i) => ({
    id: i.id,
    colaboradorId: i.colaboradorId,
    funcionarioId: null,
    data: i.data ?? DIA,
  }));
  const coberturas = (cenario.coberturas ?? []).map((c) => ({
    pessoaId: c.pessoaId,
    colaboradorId: c.colaboradorId ?? c.pessoaId,
    data: c.data ?? DIA,
    atestadoId: c.atestadoId ?? null,
    aPrazo: c.aPrazo ?? false,
  }));
  const batidas = (cenario.batidas ?? []).map((b) => ({
    pessoaId: b.pessoaId,
    colaboradorId: b.colaboradorId ?? b.pessoaId,
    data: b.data ?? DIA,
    tipo: b.tipo ?? 'ENTRADA',
  }));

  const apagarFalta = jest.fn().mockResolvedValue({});
  const apagarIncidencia = jest.fn().mockResolvedValue({});

  const prismaFake = {
    ausencia: {
      // A revalidação pede as faltas automáticas pendentes; a detecção do dia
      // pede as ausências do dia; a carga de fatos pede as coberturas.
      findMany: (args?: {
        where?: { automatica?: boolean; OR?: unknown[] };
      }) => {
        if (args?.where?.automatica) return Promise.resolve(faltas);
        if (args?.where?.OR) return Promise.resolve(coberturas);
        return Promise.resolve([]);
      },
      delete: apagarFalta,
    },
    incidenciaEscala: {
      findMany: (args?: { where?: { origem?: string } }) =>
        args?.where?.origem ? Promise.resolve(naoRetornos) : Promise.resolve([]),
      delete: apagarIncidencia,
    },
    batidaPonto: {
      findMany: (args?: { select?: { tipo?: boolean } }) =>
        // A carga de fatos seleciona o tipo; a detecção do dia, não.
        args?.select?.tipo
          ? Promise.resolve(batidas)
          : Promise.resolve(batidas.map((b) => ({ pessoaId: b.pessoaId }))),
    },
    registroPontoFiscal: { findMany: () => Promise.resolve([]) },
    exclusaoOcorrenciaAutomatica: { findMany: () => Promise.resolve([]) },
  };
  const feriasFake = {
    colaboradoresDeFeriasNoDia: () =>
      Promise.resolve(new Set(cenario.ferias ?? [])),
  };
  // Sem escalados: isola a REVALIDAÇÃO da detecção (que roda depois).
  const fiscais = { escaladosDoDia: jest.fn().mockResolvedValue([]) };

  const service = new PontoDeteccaoAutomaticaService(
    prismaFake as never,
    fiscais as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    feriasFake as never,
  );
  return { service, apagarFalta, apagarIncidencia };
}

describe('PontoDeteccaoAutomaticaService — revalidação das ocorrências automáticas', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(AGORA);
  });
  afterAll(() => jest.useRealTimers());

  describe('falta automática', () => {
    it('sai quando aparece batida no dia', async () => {
      const { service, apagarFalta } = criarServico({
        faltas: [{ id: 'f1', pessoaId: 'op-1' }],
        batidas: [{ pessoaId: 'op-1' }],
      });

      await service.verificar();

      expect(apagarFalta).toHaveBeenCalledWith({ where: { id: 'f1' } });
    });

    it('sai quando a batida foi lançada em ATRASO, num dia anterior', async () => {
      // O caso que o gancho antigo não cobria: ele olhava sempre "hoje".
      const { service, apagarFalta } = criarServico({
        faltas: [{ id: 'f1', pessoaId: 'op-1', data: ONTEM }],
        batidas: [{ pessoaId: 'op-1', data: ONTEM }],
      });

      await service.verificar();

      expect(apagarFalta).toHaveBeenCalledWith({ where: { id: 'f1' } });
    });

    it('sai quando o dia passa a ter ATESTADO', async () => {
      const { service, apagarFalta } = criarServico({
        faltas: [{ id: 'f1', pessoaId: 'op-1' }],
        coberturas: [{ pessoaId: 'op-1', atestadoId: 'at-1' }],
      });

      await service.verificar();

      expect(apagarFalta).toHaveBeenCalledWith({ where: { id: 'f1' } });
    });

    it('sai quando o dia entra numa ausência a prazo', async () => {
      const { service, apagarFalta } = criarServico({
        faltas: [{ id: 'f1', pessoaId: 'op-1' }],
        coberturas: [{ pessoaId: 'op-1', aPrazo: true }],
      });

      await service.verificar();

      expect(apagarFalta).toHaveBeenCalledWith({ where: { id: 'f1' } });
    });

    it('sai quando as FÉRIAS são atribuídas depois, cobrindo o dia', async () => {
      const { service, apagarFalta } = criarServico({
        faltas: [{ id: 'f1', pessoaId: 'op-1' }],
        ferias: ['op-1'],
      });

      await service.verificar();

      expect(apagarFalta).toHaveBeenCalledWith({ where: { id: 'f1' } });
    });

    it('do FISCAL sai mesmo com a batida gravada por outra identidade', async () => {
      // O fiscal bate ponto pelo Fiscal.id e a falta guarda a ficha em
      // `colaboradorId`. Casar as duas chaves é o que faz a limpeza funcionar.
      const { service, apagarFalta } = criarServico({
        faltas: [{ id: 'f1', pessoaId: 'fis-1', colaboradorId: 'col-1' }],
        batidas: [{ pessoaId: 'fis-1', colaboradorId: 'col-1' }],
      });

      await service.verificar();

      expect(apagarFalta).toHaveBeenCalledWith({ where: { id: 'f1' } });
    });

    it('FICA quando nada mudou (a pessoa realmente não veio)', async () => {
      const { service, apagarFalta } = criarServico({
        faltas: [{ id: 'f1', pessoaId: 'op-1' }],
      });

      await service.verificar();

      expect(apagarFalta).not.toHaveBeenCalled();
    });

    it('a batida de OUTRA pessoa não limpa a falta desta', async () => {
      const { service, apagarFalta } = criarServico({
        faltas: [{ id: 'f1', pessoaId: 'op-1' }],
        batidas: [{ pessoaId: 'op-2' }],
      });

      await service.verificar();

      expect(apagarFalta).not.toHaveBeenCalled();
    });

    it('a batida de OUTRO dia não limpa a falta deste', async () => {
      const { service, apagarFalta } = criarServico({
        faltas: [{ id: 'f1', pessoaId: 'op-1', data: DIA }],
        batidas: [{ pessoaId: 'op-1', data: ONTEM }],
      });

      await service.verificar();

      expect(apagarFalta).not.toHaveBeenCalled();
    });
  });

  describe('não retorno do intervalo', () => {
    it('sai quando o intervalo é fechado depois', async () => {
      const { service, apagarIncidencia } = criarServico({
        naoRetornos: [{ id: 'i1', colaboradorId: 'op-1' }],
        batidas: [{ pessoaId: 'op-1', tipo: 'RETORNO_INTERVALO' }],
      });

      await service.verificar();

      expect(apagarIncidencia).toHaveBeenCalledWith({ where: { id: 'i1' } });
    });

    it('FICA quando há batidas mas nenhuma de retorno', async () => {
      // Ter batidas é o pressuposto do não retorno, não a sua negação.
      const { service, apagarIncidencia } = criarServico({
        naoRetornos: [{ id: 'i1', colaboradorId: 'op-1' }],
        batidas: [
          { pessoaId: 'op-1', tipo: 'ENTRADA' },
          { pessoaId: 'op-1', tipo: 'SAIDA_INTERVALO' },
        ],
      });

      await service.verificar();

      expect(apagarIncidencia).not.toHaveBeenCalled();
    });

    it('sai quando o dia passa a ter atestado', async () => {
      const { service, apagarIncidencia } = criarServico({
        naoRetornos: [{ id: 'i1', colaboradorId: 'op-1' }],
        coberturas: [{ pessoaId: 'op-1', atestadoId: 'at-1' }],
      });

      await service.verificar();

      expect(apagarIncidencia).toHaveBeenCalledWith({ where: { id: 'i1' } });
    });

    it('sai quando a pessoa está de férias no dia', async () => {
      const { service, apagarIncidencia } = criarServico({
        naoRetornos: [{ id: 'i1', colaboradorId: 'op-1' }],
        ferias: ['op-1'],
      });

      await service.verificar();

      expect(apagarIncidencia).toHaveBeenCalledWith({ where: { id: 'i1' } });
    });
  });

  it('sem ocorrências automáticas no ciclo, não faz nada', async () => {
    const { service, apagarFalta, apagarIncidencia } = criarServico({});

    await service.verificar();

    expect(apagarFalta).not.toHaveBeenCalled();
    expect(apagarIncidencia).not.toHaveBeenCalled();
  });

  it('sem o serviço de férias, os outros motivos continuam valendo', async () => {
    const prismaFake = {
      ausencia: {
        findMany: (args?: { where?: { automatica?: boolean; OR?: unknown[] } }) =>
          args?.where?.automatica
            ? Promise.resolve([
                {
                  id: 'f1',
                  pessoaId: 'op-1',
                  colaboradorId: 'op-1',
                  data: DIA,
                  automatica: true,
                  atestadoId: null,
                  aPrazo: false,
                },
              ])
            : Promise.resolve([]),
        delete: jest.fn().mockResolvedValue({}),
      },
      incidenciaEscala: { findMany: () => Promise.resolve([]) },
      batidaPonto: {
        findMany: (args?: { select?: { tipo?: boolean } }) =>
          args?.select?.tipo
            ? Promise.resolve([
                { pessoaId: 'op-1', colaboradorId: 'op-1', data: DIA, tipo: 'ENTRADA' },
              ])
            : Promise.resolve([{ pessoaId: 'op-1' }]),
      },
      registroPontoFiscal: { findMany: () => Promise.resolve([]) },
      exclusaoOcorrenciaAutomatica: { findMany: () => Promise.resolve([]) },
    };
    const service = new PontoDeteccaoAutomaticaService(
      prismaFake as never,
      { escaladosDoDia: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined, // sem FeriasService
    );

    await service.verificar();

    expect(prismaFake.ausencia.delete).toHaveBeenCalledWith({
      where: { id: 'f1' },
    });
  });
});
