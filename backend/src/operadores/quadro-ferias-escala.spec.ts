import { OperadorTurnoService } from './operador-turno.service';

/**
 * O Quadro de Operadores respeita as FÉRIAS, como a escala de fiscais.
 *
 * Antes, este quadro nunca consultava férias: o serviço não recebia o
 * `FeriasService` e o módulo não importava o `FeriasModule`. Como as férias são
 * uma inativação NÃO rígida (não mexem em `ativo`) e não criam linha em
 * `Ausencia`, a pessoa de férias caía no caminho de quem trabalha e aparecia
 * como **TRABALHA** durante todo o período — enquanto a escala de fiscais e a
 * escala publicada já a mostravam de férias.
 *
 * Regra adotada: no roster de UM dia a pessoa **sai da lista** (paridade com o
 * fiscal, que "sai da escala"); na grade semanal, que é um calendário e pode ter
 * férias cobrindo só parte da semana, a **célula** é marcada como FERIAS.
 */
describe('OperadorTurnoService — férias saem do quadro', () => {
  // Quarta-feira (diaSemana 3) da semana de 20/07 a 25/07 de 2026.
  const QUARTA = new Date('2026-07-22T12:00:00Z');
  const QUARTA_ISO = '2026-07-22';

  function criarServico(opcoes: {
    /** Datas ISO em que a pessoa está de férias. */
    feriasEm?: string[];
    comAusencia?: boolean;
    /** Simula a ausência do serviço de férias (comportamento antigo). */
    semServicoDeFerias?: boolean;
  }): OperadorTurnoService {
    const colaborador = {
      id: 'c1',
      nome: 'Erick',
      genero: 'M',
      turno: 'ABERTURA',
      entradaSemana: '08:00',
      saidaSemana: '16:00',
      entradaFds: '08:00',
      saidaFds: '16:00',
      // Folga na segunda, para a quarta ser um dia de trabalho.
      folgaDiaSemana: 1,
      grupoDomingo: null,
      entradaDom: '08:00',
      saidaDom: '16:00',
      ativo: true,
      criadoEm: new Date(),
    };

    const prismaFake = {
      colaborador: { findMany: () => Promise.resolve([colaborador]) },
      ausencia: {
        findMany: () =>
          Promise.resolve(
            opcoes.comAusencia
              ? [
                  {
                    id: 'au1',
                    pessoaId: 'c1',
                    // `data` é usada pela grade (chave pessoa|dia); o roster do
                    // dia não a seleciona, mas o fake serve aos dois.
                    data: new Date(`${QUARTA_ISO}T00:00:00.000Z`),
                    statusJustificativa: 'PENDENTE',
                    justificadaPorNome: null,
                    aPrazo: false,
                    atestadoId: null,
                    motivoJustificativa: null,
                    cid: null,
                  },
                ]
              : [],
          ),
      },
      atestado: { findMany: () => Promise.resolve([]) },
      escalaEntry: { findMany: () => Promise.resolve([]) },
      // Usada só pelo tablero ao vivo (não-retorno do intervalo).
      incidenciaEscala: { findMany: () => Promise.resolve([]) },
    };

    const feriasFake = {
      colaboradoresDeFeriasNoDia: (dia: Date) =>
        Promise.resolve(
          (opcoes.feriasEm ?? []).includes(dia.toISOString().slice(0, 10))
            ? new Set(['c1'])
            : new Set<string>(),
        ),
    };

    // Ordem: prisma, notificacoes, escalaDomingo, folga, ferias.
    return new OperadorTurnoService(
      prismaFake as never,
      undefined,
      undefined,
      undefined,
      opcoes.semServicoDeFerias ? undefined : (feriasFake as never),
    );
  }

  describe('roster de um dia', () => {
    it('quem está de férias NÃO aparece no quadro do dia', async () => {
      const service = criarServico({ feriasEm: [QUARTA_ISO] });

      const dia = await service.diaOperadores(QUARTA);

      // É o sintoma relatado: antes vinha uma linha com status TRABALHA.
      expect(dia.colaboradores).toHaveLength(0);
    });

    it('não conta nos totais do dia (nem como trabalhando, nem como falta)', async () => {
      const service = criarServico({ feriasEm: [QUARTA_ISO] });

      const dia = await service.diaOperadores(QUARTA);

      expect(dia).toMatchObject({
        trabalhando: 0,
        folgas: 0,
        faltas: 0,
        atestados: 0,
      });
    });

    it('as férias vencem uma falta já gravada nesse dia', async () => {
      // Uma falta lançada antes de as férias existirem não pode fazer a pessoa
      // reaparecer no quadro.
      const service = criarServico({
        feriasEm: [QUARTA_ISO],
        comAusencia: true,
      });

      const dia = await service.diaOperadores(QUARTA);

      expect(dia.colaboradores).toHaveLength(0);
      expect(dia.faltas).toBe(0);
    });

    it('fora do período de férias segue aparecendo normalmente', async () => {
      const service = criarServico({ feriasEm: ['2026-07-30'] });

      const dia = await service.diaOperadores(QUARTA);

      expect(dia.colaboradores).toHaveLength(1);
      expect(dia.colaboradores[0].status).toBe('TRABALHA');
      expect(dia.trabalhando).toBe(1);
    });

    it('no domingo também sai do quadro', async () => {
      // Domingo 26/07/2026. Sem âncora de rodízio ninguém trabalha, mas a
      // pessoa de férias não deve aparecer nem como folga.
      const service = criarServico({ feriasEm: ['2026-07-26'] });

      const domingo = await service.diaOperadores(
        new Date('2026-07-26T12:00:00Z'),
      );

      expect(domingo.diaSemana).toBe(0);
      expect(domingo.colaboradores).toHaveLength(0);
    });

    it('sem o serviço de férias, o quadro não exclui ninguém', async () => {
      const service = criarServico({
        feriasEm: [QUARTA_ISO],
        semServicoDeFerias: true,
      });

      const dia = await service.diaOperadores(QUARTA);

      expect(dia.colaboradores).toHaveLength(1);
      expect(dia.colaboradores[0].status).toBe('TRABALHA');
    });
  });

  describe('grade semanal', () => {
    it('marca FERIAS só no dia coberto, sem apagar a linha da semana', async () => {
      const service = criarServico({ feriasEm: [QUARTA_ISO] });

      const grade = await service.grade(QUARTA);
      const celulas = grade.operadores[0].celulas;

      // A linha continua na grade — as férias podem cobrir parte da semana.
      expect(grade.operadores).toHaveLength(1);
      expect(celulas.find((c) => c.diaSemana === 3)?.status).toBe('FERIAS');
      // Terça e quinta seguem como dias de trabalho.
      expect(celulas.find((c) => c.diaSemana === 2)?.status).toBe('TRABALHA');
      expect(celulas.find((c) => c.diaSemana === 4)?.status).toBe('TRABALHA');
      // Segunda é a folga da ficha.
      expect(celulas.find((c) => c.diaSemana === 1)?.status).toBe('FOLGA');
    });

    it('as férias vencem a falta na célula', async () => {
      const service = criarServico({
        feriasEm: [QUARTA_ISO],
        comAusencia: true,
      });

      const grade = await service.grade(QUARTA);
      const quarta = grade.operadores[0].celulas.find((c) => c.diaSemana === 3);

      expect(quarta?.status).toBe('FERIAS');
      expect(quarta?.ausenciaId).toBeNull();
    });

    it('a cobertura do dia não conta férias como falta nem como trabalho', async () => {
      const service = criarServico({ feriasEm: [QUARTA_ISO] });

      const grade = await service.grade(QUARTA);
      const quarta = grade.cobertura.find((c) => c.diaSemana === 3);

      expect(quarta).toMatchObject({ trabalhando: 0, folgas: 0, faltas: 0 });
    });
  });

  describe('tablero ao vivo', () => {
    beforeAll(() => {
      jest.useFakeTimers();
      // Quarta 22/07/2026, 12:00 em Brasília (15:00 UTC) — dentro do turno.
      jest.setSystemTime(new Date('2026-07-22T15:00:00.000Z'));
    });
    afterAll(() => jest.useRealTimers());

    it('quem está de férias não conta como quem deveria estar no caixa', async () => {
      const service = criarServico({ feriasEm: [QUARTA_ISO] });

      const vivo = await service.aoVivo();

      expect(vivo.esperados).toBe(0);
      expect(vivo.disponiveis).toBe(0);
      expect(vivo.faltas).toBe(0);
    });

    it('sem férias no dia, segue sendo esperado', async () => {
      const service = criarServico({ feriasEm: ['2026-07-30'] });

      const vivo = await service.aoVivo();

      expect(vivo.esperados).toBe(1);
    });
  });
});

/**
 * O aviso diário de cobertura crítica também respeita as férias.
 *
 * Antes ele fazia a sua própria contagem (`escaladosNoDia`: a ficha menos a
 * folga da ficha, menos as faltas), que ignorava as férias, a regra única de
 * folga e o rodízio de domingo. O efeito era o pior possível num alerta:
 * superestimar a cobertura e **não disparar** quando devia. Agora reaproveita o
 * roster do dia, que já resolve os três.
 */
describe('OperadorTurnoService — aviso de cobertura respeita férias', () => {
  const QUARTA_ISO = '2026-07-22';

  beforeAll(() => {
    jest.useFakeTimers();
    // Quarta 22/07/2026, 12:00 em Brasília (15:00 UTC).
    jest.setSystemTime(new Date('2026-07-22T15:00:00.000Z'));
  });
  afterAll(() => jest.useRealTimers());

  let enviadas: { titulo: string; mensagem: string }[] = [];

  /** `quantos` operadores ativos; os de `feriasDe` estão de férias na quarta. */
  function criarServico(quantos: number, feriasDe: string[] = []) {
    const cols = Array.from({ length: quantos }, (_, i) => ({
      id: `c${i + 1}`,
      nome: `Op ${i + 1}`,
      genero: 'F',
      turno: 'ABERTURA',
      entradaSemana: '08:00',
      saidaSemana: '16:00',
      entradaFds: '08:00',
      saidaFds: '16:00',
      folgaDiaSemana: 1, // folga na segunda
      grupoDomingo: null,
      entradaDom: '08:00',
      saidaDom: '16:00',
      ativo: true,
      criadoEm: new Date(),
    }));

    const prismaFake = {
      colaborador: { findMany: () => Promise.resolve(cols) },
      ausencia: { findMany: () => Promise.resolve([]) },
      atestado: { findMany: () => Promise.resolve([]) },
      escalaEntry: { findMany: () => Promise.resolve([]) },
      incidenciaEscala: { findMany: () => Promise.resolve([]) },
    };
    const feriasFake = {
      colaboradoresDeFeriasNoDia: (dia: Date) =>
        Promise.resolve(
          dia.toISOString().slice(0, 10) === QUARTA_ISO
            ? new Set(feriasDe)
            : new Set<string>(),
        ),
    };
    const notificacoesFake = {
      destinatariosComPermissao: () => Promise.resolve(['gestor-1']),
      enviar: (_: unknown, msg: { titulo: string; mensagem: string }) => {
        enviadas.push(msg);
        return Promise.resolve();
      },
    };
    return new OperadorTurnoService(
      prismaFake as never,
      notificacoesFake as never,
      undefined,
      undefined,
      feriasFake as never,
    );
  }

  beforeEach(() => {
    enviadas = [];
  });

  it('não conta quem está de férias como estando no caixa', async () => {
    // 3 operadores, 2 de férias → só 1 no caixa (antes diria 3).
    const service = criarServico(3, ['c1', 'c2']);

    await service.avisoCoberturaCritica();

    expect(enviadas).toHaveLength(1);
    expect(enviadas[0].mensagem).toContain('há 1 operadores no caixa');
  });

  it('não avisa quando ninguém era esperado (todos de férias)', async () => {
    // Sem este corte, o aviso gritaria "0 operadores no caixa" num dia em que
    // simplesmente não havia operação a cobrir.
    const service = criarServico(2, ['c1', 'c2']);

    await service.avisoCoberturaCritica();

    expect(enviadas).toHaveLength(0);
  });

  it('sem férias, conta todos os escalados', async () => {
    const service = criarServico(3);

    await service.avisoCoberturaCritica();

    expect(enviadas[0].mensagem).toContain('há 3 operadores no caixa');
  });
});
