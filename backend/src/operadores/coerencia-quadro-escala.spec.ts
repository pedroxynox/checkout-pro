import { EscalaExportacaoService } from '../escala-exportacao/escala-exportacao.service';
import { FolgaService } from '../escala-domingo/folga.service';
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

  interface Cenario {
    /** Dia da semana da folga na ficha (1 = segunda). */
    folgaNaFicha?: number;
    /** Marca folga na escala SEMANAL nesse dia da semana. */
    folgaNaEscalaEm?: number;
    /** A entrada da escala semanal é uma exceção ("especial")? */
    escalaEspecial?: boolean;
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
      entradaSemana: '08:00',
      saidaSemana: '16:00',
      entradaFds: '08:00',
      saidaFds: '16:00',
      entradaDom: '08:00',
      saidaDom: '16:00',
      folgaDiaSemana: cenario.folgaNaFicha ?? 1,
      grupoDomingo: null,
      ativo: true,
      criadoEm: new Date(),
    };

    const entradasEscala =
      cenario.folgaNaEscalaEm !== undefined
        ? [
            {
              funcionarioId: 'c1',
              colaboradorId: 'c1',
              diaSemana: cenario.folgaNaEscalaEm,
              folga: true,
              especial: cenario.escalaEspecial ?? false,
              entrada: null,
              saida: null,
            },
          ]
        : [];

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
    const quadro = new OperadorTurnoService(
      prismaFake as never,
      undefined,
      undefined,
      folga,
      feriasFake as never,
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

  /** Estado que o QUADRO atribui a cada pessoa (ausente ⇒ de férias). */
  async function estadoNoQuadro(
    quadro: OperadorTurnoService,
  ): Promise<Map<string, string>> {
    const dia = await quadro.diaOperadores(QUARTA);
    const mapa = new Map(dia.colaboradores.map((c) => [c.id, c.status]));
    if (!mapa.has('c1')) mapa.set('c1', 'FERIAS');
    return mapa;
  }

  /** Estado que a ESCALA PUBLICADA atribui, só das linhas de OPERADOR. */
  async function estadoNaPublicada(
    publicada: EscalaExportacaoService,
  ): Promise<Map<string, string>> {
    const escala = await publicada.escalaDoDia(QUARTA_ISO);
    const linhas = escala.secoes
      .filter((s) => s.funcao === 'OPERADOR')
      .flatMap((s) => s.linhas);
    return new Map(linhas.map((l) => [l.colaboradorId, l.status]));
  }

  /** Roda as duas vistas e devolve o que cada uma diz. */
  async function comparar(cenario: Cenario) {
    const { quadro, publicada } = montar(cenario);
    return {
      quadro: await estadoNoQuadro(quadro),
      publicada: await estadoNaPublicada(publicada),
    };
  }

  it('dia normal de trabalho: as duas dizem TRABALHA', async () => {
    const { quadro, publicada } = await comparar({});

    expect(quadro.get('c1')).toBe('TRABALHA');
    expect(publicada).toEqual(quadro);
  });

  it('folga da FICHA: as duas dizem FOLGA', async () => {
    const { quadro, publicada } = await comparar({ folgaNaFicha: 3 });

    expect(quadro.get('c1')).toBe('FOLGA');
    expect(publicada).toEqual(quadro);
  });

  it('férias: o Quadro omite e a Escala marca FERIAS (equivalentes)', async () => {
    const { quadro, publicada } = await comparar({ deFerias: true });

    expect(publicada.get('c1')).toBe('FERIAS');
    expect(publicada).toEqual(quadro);
  });

  it('falta registrada: as duas dizem FALTA', async () => {
    const { quadro, publicada } = await comparar({ ausencia: 'FALTA' });

    expect(quadro.get('c1')).toBe('FALTA');
    expect(publicada).toEqual(quadro);
  });

  it('atestado: as duas dizem ATESTADO', async () => {
    const { quadro, publicada } = await comparar({ ausencia: 'ATESTADO' });

    expect(quadro.get('c1')).toBe('ATESTADO');
    expect(publicada).toEqual(quadro);
  });

  it('folga marcada como EXCEÇÃO na escala semanal: as duas dizem FOLGA', async () => {
    const { quadro, publicada } = await comparar({
      folgaNaEscalaEm: 3,
      escalaEspecial: true,
    });

    expect(quadro.get('c1')).toBe('FOLGA');
    expect(publicada).toEqual(quadro);
  });

  it('folga marcada na escala semanal SEM ser exceção: as duas dizem FOLGA', async () => {
    // Este é o caso suspeito. A regra única de folga (Quadro, equipe do dia,
    // detecção de falta) considera QUALQUER `EscalaEntry.folga`; a Escala
    // publicada só olha as marcadas como `especial`. Se divergirem, o mesmo dia
    // sai FOLGA numa tela e TRABALHA na outra.
    const { quadro, publicada } = await comparar({ folgaNaEscalaEm: 3 });

    expect(quadro.get('c1')).toBe('FOLGA');
    expect(publicada).toEqual(quadro);
  });
});
