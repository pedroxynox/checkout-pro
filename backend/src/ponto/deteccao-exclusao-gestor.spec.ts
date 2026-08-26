import { PontoDeteccaoAutomaticaService } from './ponto-deteccao-automatica.service';

/**
 * Duas garantias sobre o que o sistema NÃO deve fazer:
 *
 *  1. **Não insistir.** Quando o gestor exclui uma falta/não-retorno automático,
 *     a decisão dele prevalece: a detecção não recria a ocorrência naquele dia,
 *     mesmo que a condição siga verdadeira (escalado e sem bater ponto). Antes a
 *     card voltava sozinha no ciclo seguinte, e excluir não tinha efeito prático.
 *
 *  2. **Não avisar quem não era esperado.** Com atestado (ou qualquer ausência
 *     registrada) no dia, o aviso de atraso de 1h não é enviado — ele dizia
 *     "estava escalado(a) e não bateu ponto" para alguém que tinha atestado em
 *     mãos, contradizendo o próprio sistema.
 */
const AGORA = new Date('2026-07-20T15:00:00.000Z'); // 12:00 em Brasília

interface Opcoes {
  /** Ausências do dia (atestado, a prazo ou falta já lançada). */
  ausenciasDoDia?: { pessoaId: string; colaboradorId?: string | null }[];
  /** Exclusões do gestor para o dia, por tipo. */
  exclusoes?: {
    tipo: 'FALTA' | 'NAO_RETORNO_INTERVALO';
    pessoaId: string;
    colaboradorId?: string | null;
  }[];
  /** Minutos após a entrada prevista (60 = alerta de 1h; 120 = falta). */
  minutosDeAtraso?: number;
}

function criarServico({
  ausenciasDoDia = [],
  exclusoes = [],
  minutosDeAtraso = 120,
}: Opcoes = {}) {
  // O turno é hora de PAREDE de Brasília: 12:00 menos os minutos de atraso
  // desejados (120 → entrada 10:00 = faixa da falta; 60 → 11:00 = alerta).
  const entradaMin = 12 * 60 - minutosDeAtraso;
  const entradaPrevista = `${String(Math.floor(entradaMin / 60)).padStart(2, '0')}:${String(
    entradaMin % 60,
  ).padStart(2, '0')}`;

  const prismaFake = {
    ausencia: {
      findMany: (args?: { where?: { automatica?: boolean; OR?: unknown[] } }) =>
        args?.where?.automatica || args?.where?.OR
          ? Promise.resolve([])
          : Promise.resolve(ausenciasDoDia),
    },
    incidenciaEscala: { findMany: () => Promise.resolve([]) },
    batidaPonto: { findMany: () => Promise.resolve([]) },
    registroPontoFiscal: { findMany: () => Promise.resolve([]) },
    exclusaoOcorrenciaAutomatica: {
      findMany: (args?: { where?: { tipo?: string } }) =>
        Promise.resolve(exclusoes.filter((e) => e.tipo === args?.where?.tipo)),
    },
    alertaAtrasoEnviado: { create: jest.fn().mockResolvedValue({}) },
  };
  const fiscais = {
    escaladosDoDia: jest.fn().mockResolvedValue([
      {
        pessoaId: 'op-1',
        tipoPessoa: 'OPERADOR' as const,
        colaboradorId: 'op-1',
        nome: 'Ana',
        funcao: 'OPERADOR',
        entradaPrevista,
      },
    ]),
  };
  const registrarAusencia = jest.fn().mockResolvedValue({});
  const notificarComPermissao = jest.fn().mockResolvedValue([]);
  const service = new PontoDeteccaoAutomaticaService(
    prismaFake as never,
    fiscais as never,
    { registrarAusencia } as never,
    {} as never,
    {} as never,
    { notificarComPermissao } as never,
    undefined,
  );
  return { service, registrarAusencia, notificarComPermissao };
}

describe('PontoDeteccaoAutomaticaService — a exclusão do gestor prevalece', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(AGORA);
  });
  afterAll(() => jest.useRealTimers());

  it('NÃO recria a falta que o gestor excluiu naquele dia', async () => {
    const { service, registrarAusencia } = criarServico({
      exclusoes: [{ tipo: 'FALTA', pessoaId: 'op-1' }],
    });

    await service.verificar();

    expect(registrarAusencia).not.toHaveBeenCalled();
  });

  it('recria a falta normalmente quando NÃO houve exclusão', async () => {
    const { service, registrarAusencia } = criarServico();

    await service.verificar();

    expect(registrarAusencia).toHaveBeenCalled();
  });

  it('a exclusão de OUTRA pessoa não protege esta', async () => {
    const { service, registrarAusencia } = criarServico({
      exclusoes: [{ tipo: 'FALTA', pessoaId: 'op-2' }],
    });

    await service.verificar();

    expect(registrarAusencia).toHaveBeenCalled();
  });

  it('a exclusão casa também pela ficha (colaboradorId)', async () => {
    const { service, registrarAusencia } = criarServico({
      exclusoes: [{ tipo: 'FALTA', pessoaId: 'fis-1', colaboradorId: 'op-1' }],
    });

    await service.verificar();

    expect(registrarAusencia).not.toHaveBeenCalled();
  });

  it('a exclusão de um NÃO-RETORNO não bloqueia a falta (tipos independentes)', async () => {
    const { service, registrarAusencia } = criarServico({
      exclusoes: [{ tipo: 'NAO_RETORNO_INTERVALO', pessoaId: 'op-1' }],
    });

    await service.verificar();

    expect(registrarAusencia).toHaveBeenCalled();
  });
});

describe('PontoDeteccaoAutomaticaService — aviso de atraso respeita a ausência', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(AGORA);
  });
  afterAll(() => jest.useRealTimers());

  it('NÃO avisa o atraso de quem tem atestado (ou qualquer ausência) no dia', async () => {
    const { service, notificarComPermissao } = criarServico({
      minutosDeAtraso: 60, // faixa do alerta de 1h
      ausenciasDoDia: [{ pessoaId: 'op-1', colaboradorId: 'op-1' }],
    });

    await service.verificar();

    expect(notificarComPermissao).not.toHaveBeenCalled();
  });

  it('avisa o atraso normalmente quando não há ausência no dia', async () => {
    const { service, notificarComPermissao } = criarServico({
      minutosDeAtraso: 60,
    });

    await service.verificar();

    expect(notificarComPermissao).toHaveBeenCalledWith(
      'CENTRAL_JORNADA',
      expect.objectContaining({ titulo: expect.stringContaining('Atraso') }),
    );
  });

  it('a ausência gravada pela FICHA também silencia o aviso', async () => {
    // Ausência a prazo / atestado de um fiscal é gravada com a ficha; o escalado
    // é identificado por outra chave. Checar só uma delas deixava o aviso passar.
    const { service, notificarComPermissao } = criarServico({
      minutosDeAtraso: 60,
      ausenciasDoDia: [{ pessoaId: 'outro-id', colaboradorId: 'op-1' }],
    });

    await service.verificar();

    expect(notificarComPermissao).not.toHaveBeenCalled();
  });
});
