import { EscalaExportacaoService } from '../escala-exportacao/escala-exportacao.service';
import { FolgaService } from '../escala-domingo/folga.service';
import { FeriadosService } from '../feriados/feriados.service';
import { OperadorTurnoService } from './operador-turno.service';

/**
 * COERÊNCIA entre as duas telas que respondem a mesma pergunta.
 *
 * O sistema tem mais de um construtor de "o que esta pessoa está fazendo hoje":
 *
 * - o **Quadro de Operadores** (`diaOperadores`) — a tela de gestão;
 * - a **Escala publicada** (`escalaDoDia`) — o que a equipe lê.
 *
 * Cada um monta a sua própria lista, e foi exatamente por isso que as férias
 * ficaram anos aparecendo como "Trabalha" no Quadro enquanto a Escala publicada
 * já mostrava "Férias". Nenhum teste comparava as duas: cada um provava o seu
 * lado, e a divergência vivia no vão entre eles.
 *
 * Este arquivo fecha esse vão. A regra é simples: **para o mesmo dia e a mesma
 * pessoa, as duas vistas têm de dizer o mesmo.** Um teste que falha aqui é uma
 * incoerência real que o usuário veria em duas telas do mesmo app.
 *
 * Equivalência entre as saídas: o Quadro **omite** quem está de férias (sai da
 * escala), enquanto a Escala publicada a lista com status `FERIAS`. Na
 * comparação, "ausente do Quadro" ≡ `FERIAS`.
 */
describe('Coerência: Quadro de Operadores × Escala publicada', () => {
  // Quarta-feira, 22/07/2026 (diaSemana 3). Não é feriado nacional.
  const QUARTA = new Date('2026-07-22T12:00:00Z');
  const QUARTA_ISO = '2026-07-22';
  // Terça, 21/04/2026 — Tiradentes (feriado nacional, resolvido pela regra).
  const FERIADO = new Date('2026-04-21T12:00:00Z');
  const FERIADO_ISO = '2026-04-21';

  interface Cenario {
    /**
     * Dia da semana da folga na ficha (1 = segunda). **`null` = ficha omissa**,
     * que é o único caso em que a escala semanal geral decide a folga (ADR 0023).
     */
    folgaNaFicha?: number | null;
    /** Marca folga na escala SEMANAL nesse dia da semana. */
    folgaNaEscalaEm?: number;
    /** A entrada da escala semanal é uma exceção ("especial")? */
    escalaEspecial?: boolean;
    /** Horário de exceção para o dia da semana (implica `especial`). */
    horarioEspecialEm?: { diaSemana: number; entrada: string; saida: string };
    deFerias?: boolean;
    ausencia?: 'FALTA' | 'ATESTADO';
  }

  /** Monta os dois serviços sobre O MESMO Prisma falso. */
  function montar(cenario: Cenario) {
    const colaborador = {
      id: 'c1',
      nome: 'Erick',
      genero: 'M',
      funcao: 'OPERADOR',
      turno: 'ABERTURA',
      // Horários DIFERENTES de propósito: se semana/fds/domingo fossem iguais,
      // o teste não perceberia quando as duas telas escolhem regras distintas.
      entradaSemana: '08:00',
      saidaSemana: '16:00',
      entradaFds: '09:00',
      saidaFds: '17:00',
      entradaDom: '07:00',
      saidaDom: '13:00',
      folgaDiaSemana:
        cenario.folgaNaFicha === undefined ? 1 : cenario.folgaNaFicha,
      grupoDomingo: null,
      ativo: true,
      criadoEm: new Date(),
    };

    const entradasEscala: {
      funcionarioId: string;
      colaboradorId: string;
      diaSemana: number;
      folga: boolean;
      especial: boolean;
      entrada: string | null;
      saida: string | null;
    }[] = [];
    if (cenario.folgaNaEscalaEm !== undefined) {
      entradasEscala.push({
        funcionarioId: 'c1',
        colaboradorId: 'c1',
        diaSemana: cenario.folgaNaEscalaEm,
        folga: true,
        especial: cenario.escalaEspecial ?? false,
        entrada: null,
        saida: null,
      });
    }
    if (cenario.horarioEspecialEm) {
      entradasEscala.push({
        funcionarioId: 'c1',
        colaboradorId: 'c1',
        diaSemana: cenario.horarioEspecialEm.diaSemana,
        folga: false,
        especial: true,
        entrada: cenario.horarioEspecialEm.entrada,
        saida: cenario.horarioEspecialEm.saida,
      });
    }

    const ausencias = cenario.ausencia
      ? [
          {
            id: 'au1',
            pessoaId: 'c1',
            data: new Date(`${QUARTA_ISO}T00:00:00.000Z`),
            statusJustificativa: 'PENDENTE',
            justificadaPorNome: null,
            aPrazo: false,
            atestadoId: cenario.ausencia === 'ATESTADO' ? 'at1' : null,
            motivoJustificativa: null,
            cid: null,
          },
        ]
      : [];

    const prismaFake = {
      colaborador: {
        // Serve aos dois serviços: o Quadro pede `funcao: 'OPERADOR'`, a Escala
        // publicada pede `funcao: { in: [...] }`, e a regra de folga pede todos.
        findMany: (args?: {
          where?: { funcao?: string | { in: string[] }; ativo?: boolean };
        }) => {
          const f = args?.where?.funcao;
          if (typeof f === 'string' && f !== colaborador.funcao) {
            return Promise.resolve([]);
          }
          if (
            f &&
            typeof f !== 'string' &&
            !f.in.includes(colaborador.funcao)
          ) {
            return Promise.resolve([]);
          }
          return Promise.resolve([colaborador]);
        },
      },
      escalaEntry: {
        // A regra de folga pede `{ folga: true, diaSemana: { in } }`; a Escala
        // publicada pede `{ especial: true }`. Cada filtro é respeitado.
        findMany: (args?: {
          where?: {
            especial?: boolean;
            folga?: boolean;
            diaSemana?: { in: number[] };
          };
        }) => {
          const w = args?.where ?? {};
          return Promise.resolve(
            entradasEscala.filter(
              (e) =>
                (w.especial === undefined || e.especial === w.especial) &&
                (w.folga === undefined || e.folga === w.folga) &&
                (w.diaSemana === undefined ||
                  w.diaSemana.in.includes(e.diaSemana)),
            ),
          );
        },
      },
      ausencia: { findMany: () => Promise.resolve(ausencias) },
      // Identidades da pessoa: aqui o colaborador é um operador, então não há
      // registro de fiscal nenhum. As consultas existem para a carga não quebrar.
      fiscal: { findMany: () => Promise.resolve([]) },
      usuario: { findMany: () => Promise.resolve([]) },
      atestado: {
        findMany: () =>
          Promise.resolve(
            cenario.ausencia === 'ATESTADO'
              ? [
                  {
                    id: 'at1',
                    inicio: new Date(`${QUARTA_ISO}T00:00:00.000Z`),
                    fim: new Date(`${QUARTA_ISO}T00:00:00.000Z`),
                  },
                ]
              : [],
          ),
      },
      feriado: { findMany: () => Promise.resolve([]) },
      incidenciaEscala: { findMany: () => Promise.resolve([]) },
    };

    const feriasFake = {
      colaboradoresDeFeriasNoDia: () =>
        Promise.resolve(cenario.deFerias ? new Set(['c1']) : new Set<string>()),
    };

    const folga = new FolgaService(prismaFake as never, undefined);
    // Feriados reais (Tiradentes e cia. vêm da regra, não do banco) — é o que
    // faz o cenário de feriado valer: as duas vistas têm de aplicar a MESMA
    // regra de "feriado segue o horário de domingo".
    const feriados = new FeriadosService(prismaFake as never);
    const quadro = new OperadorTurnoService(
      prismaFake as never,
      undefined,
      undefined,
      folga,
      feriasFake as never,
      feriados,
    );
    // Ordem: prisma, escalaDomingo, ferias, folga. As duas vistas recebem a
    // MESMA instância da regra de folga — é o ponto do teste.
    const publicada = new EscalaExportacaoService(
      prismaFake as never,
      undefined,
      feriasFake as never,
      folga,
    );
    return { quadro, publicada };
  }

  /**
   * O que cada vista diz de uma pessoa: `STATUS entrada-saida`.
   *
   * Compara o **horário** também, não só o estado: uma tela dizer "trabalha
   * 08:00" e a outra "trabalha 07:00" é tão incoerente quanto discordar do
   * estado — e é o que acontece em feriado e com horário de exceção.
   */
  const descrever = (
    status: string,
    entrada: string | null,
    saida: string | null,
  ): string => `${status} ${entrada ?? '--'}-${saida ?? '--'}`;

  /** Estado que o QUADRO atribui a cada pessoa (ausente ⇒ de férias). */
  async function estadoNoQuadro(
    quadro: OperadorTurnoService,
    dataRef: Date,
  ): Promise<Map<string, string>> {
    const dia = await quadro.diaOperadores(dataRef);
    const mapa = new Map(
      dia.colaboradores.map((c) => [
        c.id,
        descrever(c.status, c.entrada, c.saida),
      ]),
    );
    if (!mapa.has('c1')) mapa.set('c1', descrever('FERIAS', null, null));
    return mapa;
  }

  /** Estado que a ESCALA PUBLICADA atribui, só das linhas de OPERADOR. */
  async function estadoNaPublicada(
    publicada: EscalaExportacaoService,
    dataISO: string,
  ): Promise<Map<string, string>> {
    const escala = await publicada.escalaDoDia(dataISO);
    const linhas = escala.secoes
      .filter((s) => s.funcao === 'OPERADOR')
      .flatMap((s) => s.linhas);
    return new Map(
      linhas.map((l) => [
        l.colaboradorId,
        descrever(l.status, l.entrada, l.saida),
      ]),
    );
  }

  /** Roda as duas vistas no mesmo dia e devolve o que cada uma diz. */
  async function comparar(
    cenario: Cenario,
    dia: { data: Date; iso: string } = { data: QUARTA, iso: QUARTA_ISO },
  ) {
    const { quadro, publicada } = montar(cenario);
    return {
      quadro: await estadoNoQuadro(quadro, dia.data),
      publicada: await estadoNaPublicada(publicada, dia.iso),
    };
  }

  it('dia normal de trabalho: as duas dizem TRABALHA', async () => {
    const { quadro, publicada } = await comparar({});

    expect(quadro.get('c1')).toBe('TRABALHA 08:00-16:00');
    expect(publicada).toEqual(quadro);
  });

  it('folga da FICHA: as duas dizem FOLGA', async () => {
    const { quadro, publicada } = await comparar({ folgaNaFicha: 3 });

    expect(quadro.get('c1')).toBe('FOLGA -----');
    expect(publicada).toEqual(quadro);
  });

  it('férias: o Quadro omite e a Escala marca FERIAS (equivalentes)', async () => {
    const { quadro, publicada } = await comparar({ deFerias: true });

    expect(publicada.get('c1')).toBe('FERIAS -----');
    expect(publicada).toEqual(quadro);
  });

  it('falta registrada: as duas dizem FALTA', async () => {
    const { quadro, publicada } = await comparar({ ausencia: 'FALTA' });

    expect(quadro.get('c1')).toBe('FALTA 08:00-16:00');
    expect(publicada).toEqual(quadro);
  });

  it('atestado: as duas dizem ATESTADO', async () => {
    const { quadro, publicada } = await comparar({ ausencia: 'ATESTADO' });

    expect(quadro.get('c1')).toBe('ATESTADO 08:00-16:00');
    expect(publicada).toEqual(quadro);
  });

  it('folga marcada como EXCEÇÃO não vence a ficha: as duas dizem TRABALHA', async () => {
    // A ficha diz folga na segunda; a linha antiga diz quarta. A ficha decide
    // sozinha (ADR 0023 + 0026) e as duas telas continuam concordando.
    const { quadro, publicada } = await comparar({
      folgaNaEscalaEm: 3,
      escalaEspecial: true,
    });

    expect(quadro.get('c1')).toBe('TRABALHA 08:00-16:00');
    expect(publicada).toEqual(quadro);
  });

  it('folga na escala semanal SEM ser exceção, ficha OMISSA: as duas dizem FOLGA', async () => {
    // Este é o caso suspeito. A regra única de folga (Quadro, equipe do dia,
    // detecção de falta) considera a `EscalaEntry.folga` geral quando a ficha se
    // cala; a Escala publicada só olha as marcadas como `especial`. Se
    // divergirem, o mesmo dia sai FOLGA numa tela e TRABALHA na outra.
    const { quadro, publicada } = await comparar({
      folgaNaFicha: null,
      folgaNaEscalaEm: 3,
    });

    expect(quadro.get('c1')).toBe('FOLGA -----');
    expect(publicada).toEqual(quadro);
  });

  it('ficha afirma OUTRO dia: as duas dizem TRABALHA (a escala velha não dispensa)', async () => {
    // ADR 0023: a escala semanal geral é derivada da ficha, e um derivado velho
    // não soma um dia de descanso. O que este teste protege é a COERÊNCIA — as
    // duas telas têm de mudar juntas, ou o mesmo dia volta a sair diferente em
    // cada uma.
    const { quadro, publicada } = await comparar({
      folgaNaFicha: 1,
      folgaNaEscalaEm: 3,
    });

    expect(quadro.get('c1')).toBe('TRABALHA 08:00-16:00');
    expect(publicada).toEqual(quadro);
  });

  // Os cenários abaixo comparam o HORÁRIO, não o estado. As duas telas
  // concordam que a pessoa trabalha — mas divergiam sobre a que horas, o que é
  // igualmente errado para quem lê a escala só para saber quando entrar.

  it('em FERIADO as duas usam o mesmo horário', async () => {
    // Feriado funciona como domingo: vale o horário de domingo da pessoa
    // (07:00–13:00 na ficha), não o de dia útil (08:00–16:00).
    const { quadro, publicada } = await comparar(
      {},
      { data: FERIADO, iso: FERIADO_ISO },
    );

    expect(publicada.get('c1')).toBe('TRABALHA 07:00-13:00');
    expect(quadro).toEqual(publicada);
  });

  it('resquício de HORÁRIO DE EXCEÇÃO: as duas usam o horário da ficha', async () => {
    // A exceção de horário deixou de existir (ADR 0026): vale o turno da ficha,
    // e as duas telas seguem concordando.
    const { quadro, publicada } = await comparar({
      horarioEspecialEm: { diaSemana: 3, entrada: '10:00', saida: '18:00' },
    });

    expect(publicada.get('c1')).toBe('TRABALHA 08:00-16:00');
    expect(quadro).toEqual(publicada);
  });
});
