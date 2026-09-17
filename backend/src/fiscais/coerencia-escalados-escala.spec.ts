import { EscalaExportacaoService } from '../escala-exportacao/escala-exportacao.service';
import { FolgaService } from '../escala-domingo/folga.service';
import { FeriadosService } from '../feriados/feriados.service';
import { EscalaService } from './escala.service';
import { FiscaisService } from './fiscais.service';

/**
 * COERÊNCIA entre a TERCEIRA fonte de "quem trabalha hoje" e a escala publicada.
 *
 * O Quadro de Operadores e a escala publicada já convergiram em
 * `montarLinhaEscala` (ver `operadores/coerencia-quadro-escala.spec.ts`).
 * `FiscaisService.escaladosDoDia` **não**: ela monta a sua própria lista, e é a
 * lista que mais importa acertar, porque não alimenta uma tela — alimenta o
 * **cron de detecção automática**, que ESCREVE falta duas horas depois da
 * entrada prevista. Aqui um desacordo não confunde quem lê: cria uma falta que
 * ninguém cometeu, ou deixa de cobrar quem realmente faltou.
 *
 * Duas diferenças de forma, tratadas na comparação:
 *
 * 1. `escaladosDoDia` é uma **whitelist**, não uma tabela de estados: estar na
 *    lista significa "espera-se esta pessoa hoje"; não estar mistura folga,
 *    férias e "sem horário". Por isso comparamos contra o conjunto de quem a
 *    escala publicada diz que TRABALHA (incluindo quem faltou — a falta não
 *    muda quem era esperado).
 * 2. `escaladosDoDia` só tem `entradaPrevista` (o cron não usa a saída). A
 *    comparação de horário é só da entrada.
 */
describe('Coerência: escaladosDoDia × Escala publicada', () => {
  // Quarta-feira, 22/07/2026 (diaSemana 3). Não é feriado nacional.
  const QUARTA = new Date(Date.UTC(2026, 6, 22));
  const QUARTA_ISO = '2026-07-22';

  interface Cenario {
    /** Dia da semana da folga na ficha do OPERADOR (1 = segunda). */
    folgaOperador?: number;
    /** Exceção de horário do OPERADOR para o dia da semana. */
    especialOperador?: { diaSemana: number; entrada: string; saida: string };
    /** Falta registrada. `pessoaId` distingue o id da batida do da ficha. */
    faltaDe?: 'OPERADOR' | 'FISCAL';
    /**
     * Hora gravada na cópia SEMANAL da fiscal, para deixá-la em desacordo com a
     * ficha dela (07:00) — o caso da escala velha que ninguém sincronizou.
     */
    entradaNaEscalaDaBia?: string;
  }

  /**
   * Um operador e um fiscal sobre O MESMO Prisma falso.
   *
   * O fiscal existe para exercitar a tradução de ids: ele bate ponto com
   * `Fiscal.id` (`fiscal-bia`) e a ficha dele é outro registro (`col-bia`). É
   * essa dobra que faz a falta de um fiscal ser gravada com uma chave e lida com
   * outra.
   */
  function montar(cenario: Cenario) {
    const operador = {
      id: 'col-erick',
      nome: 'Erick',
      genero: 'M',
      funcao: 'OPERADOR',
      turno: 'ABERTURA',
      folgaDiaSemana: cenario.folgaOperador ?? 1,
      grupoDomingo: null,
      entradaSemana: '08:00',
      saidaSemana: '16:00',
      entradaFds: '09:00',
      saidaFds: '17:00',
      entradaDom: '07:00',
      saidaDom: '13:00',
      ativo: true,
      criadoEm: new Date(),
    };
    const fiscalFicha = {
      id: 'col-bia',
      nome: 'Bia',
      matricula: '900001',
      usuarioId: 'u-bia',
      genero: 'F',
      funcao: 'FISCAL',
      turno: null,
      folgaDiaSemana: 1,
      grupoDomingo: null,
      entradaSemana: '07:00',
      saidaSemana: '15:20',
      entradaFds: '07:00',
      saidaFds: '15:20',
      entradaDom: '07:00',
      saidaDom: '13:00',
      ativo: true,
      criadoEm: new Date(),
    };
    const fichas = [operador, fiscalFicha];

    const entradasEscala = [
      ...(cenario.especialOperador
        ? [
            {
              funcionarioId: 'col-erick',
              colaboradorId: 'col-erick',
              diaSemana: cenario.especialOperador.diaSemana,
              folga: false,
              especial: true,
              entrada: cenario.especialOperador.entrada,
              saida: cenario.especialOperador.saida,
            },
          ]
        : []),
      // A cópia semanal da fiscal. O horário aqui NÃO deve influenciar mais
      // nada: é o resquício que a etapa 2 aposentou como fonte.
      {
        funcionarioId: 'fiscal-bia',
        colaboradorId: 'col-bia',
        diaSemana: 3,
        folga: false,
        especial: false,
        entrada: cenario.entradaNaEscalaDaBia ?? '07:00',
        saida: '15:20',
      },
    ];

    // A falta do OPERADOR é gravada com o id da ficha; a do FISCAL, com o
    // `Fiscal.id` — e o vínculo com a ficha vai em `colaboradorId`. É exatamente
    // o que `FiscaisService.registrarFalta` faz.
    const ausencias =
      cenario.faltaDe === 'OPERADOR'
        ? [
            {
              id: 'au1',
              pessoaId: 'col-erick',
              colaboradorId: 'col-erick',
              data: new Date(`${QUARTA_ISO}T00:00:00.000Z`),
              atestadoId: null,
              motivoJustificativa: null,
            },
          ]
        : cenario.faltaDe === 'FISCAL'
          ? [
              {
                id: 'au2',
                pessoaId: 'fiscal-bia',
                colaboradorId: 'col-bia',
                data: new Date(`${QUARTA_ISO}T00:00:00.000Z`),
                atestadoId: null,
                motivoJustificativa: null,
              },
            ]
          : [];

    const prismaFake = {
      colaborador: {
        findMany: (args?: {
          where?: { funcao?: string | { in: string[] } };
        }) => {
          const f = args?.where?.funcao;
          if (f == null) return Promise.resolve(fichas);
          const aceitas = typeof f === 'string' ? [f] : f.in;
          return Promise.resolve(
            fichas.filter((c) => aceitas.includes(c.funcao)),
          );
        },
        findFirst: () => Promise.resolve(null),
      },
      escalaEntry: {
        findMany: (args?: {
          where?: {
            especial?: boolean;
            folga?: boolean;
            diaSemana?: number | { in: number[] };
          };
        }) => {
          const w = args?.where ?? {};
          return Promise.resolve(
            entradasEscala.filter((e) => {
              if (w.especial !== undefined && e.especial !== w.especial) {
                return false;
              }
              if (w.folga !== undefined && e.folga !== w.folga) return false;
              if (typeof w.diaSemana === 'number') {
                return e.diaSemana === w.diaSemana;
              }
              if (w.diaSemana) return w.diaSemana.in.includes(e.diaSemana);
              return true;
            }),
          );
        },
      },
      ausencia: { findMany: () => Promise.resolve(ausencias) },
      atestado: { findMany: () => Promise.resolve([]) },
      feriado: {
        findMany: () => Promise.resolve([]),
        findUnique: () => Promise.resolve(null),
      },
      fiscal: {
        findMany: () =>
          Promise.resolve([
            { id: 'fiscal-bia', nome: 'Bia', usuarioId: 'u-bia', ativo: true },
          ]),
      },
      usuario: { findMany: () => Promise.resolve([]) },
    };

    const folga = new FolgaService(prismaFake as never, undefined);
    const feriados = new FeriadosService(prismaFake as never);
    // O serviço REAL da escala consolidada, sobre o mesmo Prisma falso. Antes
    // havia aqui um dublê que devolvia a hora da cópia semanal — e com ele o
    // teste não podia ver a única coisa que a etapa 2 mudou: de onde sai a hora.
    // Ordem: prisma, escalaDomingo, ferias, feriados.
    const escala = new EscalaService(
      prismaFake as never,
      undefined,
      undefined,
      feriados,
    );

    // Ordem: prisma, eventos, notificacoes, validacaoData, feriados,
    // cicloFolha, tiposContrato, escala, escalaDomingo, ferias, folga.
    const escalados = new FiscaisService(
      prismaFake as never,
      undefined,
      undefined,
      undefined,
      feriados,
      undefined,
      undefined,
      escala,
      undefined,
      undefined,
      folga,
    );
    // Ordem: prisma, escalaDomingo, ferias, folga.
    const publicada = new EscalaExportacaoService(
      prismaFake as never,
      undefined,
      undefined,
      folga,
    );
    return { escalados, publicada };
  }

  /** Quem `escaladosDoDia` espera hoje: `colaboradorId → entrada`. */
  async function esperadosPelaDeteccao(
    fiscais: FiscaisService,
    dia: Date,
  ): Promise<Map<string, string | null>> {
    const lista = await fiscais.escaladosDoDia(dia);
    return new Map(
      lista.map((e) => [e.colaboradorId ?? e.pessoaId, e.entradaPrevista]),
    );
  }

  /**
   * Quem a escala publicada diz que era esperado hoje: `colaboradorId → entrada`.
   *
   * FALTA e ATESTADO entram: quem faltou **era** esperado (é o que torna a falta
   * uma falta). O que não entra é FOLGA/FERIAS.
   */
  async function esperadosPelaPublicada(
    publicada: EscalaExportacaoService,
    dataISO: string,
  ): Promise<Map<string, string | null>> {
    const escala = await publicada.escalaDoDia(dataISO);
    const linhas = escala.secoes.flatMap((s) => s.linhas);
    return new Map(
      linhas
        .filter((l) => l.status !== 'FOLGA' && l.status !== 'FERIAS')
        .map((l) => [l.colaboradorId, l.entrada]),
    );
  }

  /** Estado que cada uma das duas fontes atribui ao dia. */
  async function comparar(cenario: Cenario) {
    const { escalados, publicada } = montar(cenario);
    return {
      deteccao: await esperadosPelaDeteccao(escalados, QUARTA),
      publicada: await esperadosPelaPublicada(publicada, QUARTA_ISO),
    };
  }

  /** O status que a escala publicada dá a uma pessoa (para os casos de falta). */
  async function statusNaPublicada(
    cenario: Cenario,
    colaboradorId: string,
  ): Promise<string | undefined> {
    const { publicada } = montar(cenario);
    const escala = await publicada.escalaDoDia(QUARTA_ISO);
    return escala.secoes
      .flatMap((s) => s.linhas)
      .find((l) => l.colaboradorId === colaboradorId)?.status;
  }

  it('dia normal: as duas esperam as mesmas pessoas no mesmo horário', async () => {
    const { deteccao, publicada } = await comparar({});

    expect(deteccao.get('col-erick')).toBe('08:00');
    expect(deteccao.get('col-bia')).toBe('07:00');
    expect(deteccao).toEqual(publicada);
  });

  it('folga da ficha: nenhuma das duas espera a pessoa', async () => {
    const { deteccao, publicada } = await comparar({ folgaOperador: 3 });

    expect(deteccao.has('col-erick')).toBe(false);
    expect(deteccao).toEqual(publicada);
  });

  it('falta do OPERADOR: as duas continuam esperando (a falta não apaga a escala)', async () => {
    const { deteccao, publicada } = await comparar({ faltaDe: 'OPERADOR' });

    expect(await statusNaPublicada({ faltaDe: 'OPERADOR' }, 'col-erick')).toBe(
      'FALTA',
    );
    expect(deteccao).toEqual(publicada);
  });

  it('falta do FISCAL: a escala publicada TAMBÉM tem de mostrar FALTA', async () => {
    // A falta de um fiscal é gravada com `Fiscal.id` em `pessoaId` (é o id com
    // que ele bate ponto) e o vínculo com a ficha vai em `colaboradorId`. A
    // escala publicada procurava as ausências SÓ por `pessoaId`, usando os ids
    // das fichas — então a falta de um fiscal nunca casava, e o documento que a
    // equipe lê dizia "trabalha" sobre quem faltou.
    expect(await statusNaPublicada({ faltaDe: 'FISCAL' }, 'col-bia')).toBe(
      'FALTA',
    );
  });

  it('resquício de exceção de horário: as duas usam o horário da FICHA', async () => {
    // A exceção de horário deixou de existir (ADR 0026). Uma linha antiga de
    // 10:00 não muda nada: as duas pontas leem a ficha (08:00) e continuam
    // concordando — que é o que este arquivo existe para garantir.
    const cenario: Cenario = {
      especialOperador: { diaSemana: 3, entrada: '10:00', saida: '18:00' },
    };
    const { deteccao, publicada } = await comparar(cenario);

    expect(publicada.get('col-erick')).toBe('08:00');
    expect(deteccao).toEqual(publicada);
  });

  it('exceção no dia de folga da ficha: nenhuma das duas espera a pessoa', async () => {
    // Antes esta era a forma de convocar alguém no descanso, e ela sumiu com a
    // exceção de horário (ADR 0026). O importante aqui não é quem ganhou, e sim
    // que as duas pontas dizem a MESMA coisa: no dia de folga da ficha, ninguém
    // é esperado. Se divergissem, nasceria falta em quem estava descansando.
    const cenario: Cenario = {
      folgaOperador: 3,
      especialOperador: { diaSemana: 3, entrada: '10:00', saida: '18:00' },
    };
    const { deteccao, publicada } = await comparar(cenario);

    expect(publicada.get('col-erick')).toBeUndefined();
    expect(deteccao).toEqual(publicada);
  });

  it('a regra única de folga concorda: o dia de folga da ficha É folga', async () => {
    // Este caso não é sobre as duas telas — é sobre o laço que uma divergência
    // criaria. A revalidação do Relógio Ponto apaga uma falta automática quando
    // `FolgaService` diz que o dia era de folga. Se a detecção esperasse a pessoa
    // e a regra de folga dissesse que ela descansa, a falta nasceria e seria
    // apagada a cada cinco minutos, num laço de notificações.
    //
    // Com a ficha como fonte única (ADR 0026), quem consulta a regra — detecção,
    // revalidação, Quadro, escala publicada — recebe sempre a mesma resposta.
    const { escalados } = montar({
      folgaOperador: 3,
      especialOperador: { diaSemana: 3, entrada: '10:00', saida: '18:00' },
    });
    const folga = new FolgaService(
      // Reaproveita o mesmo Prisma falso do cenário, via o serviço já montado.
      (escalados as unknown as { prisma: unknown }).prisma as never,
      undefined,
    );

    expect(await folga.ehFolga(QUARTA, ['col-erick'])).toBe(true);
  });

  it('a hora da cópia semanal não influencia mais a cobrança', async () => {
    // O desencontro que a equipe sentia: a ficha (e a escala publicada que ela
    // recebe) diz 07:00, mas a cópia semanal ficou em 06:50 depois de uma edição
    // que não sincronizou. A detecção cobrava 06:50 e marcava falta às 08:50 em
    // quem chegou às 07:00.
    const maisCedo = await comparar({ entradaNaEscalaDaBia: '06:50' });
    expect(maisCedo.publicada.get('col-bia')).toBe('07:00');
    expect(maisCedo.deteccao).toEqual(maisCedo.publicada);

    // E o outro lado, que é a razão de este teste existir em vez do par que
    // havia antes. Enquanto a regra era conservadora — "vale a hora mais
    // TARDIA" —, uma cópia atrasada continuava mandando: a detecção esperava a
    // pessoa às 08:00 embora a ficha dissesse 07:00, e o atraso real de uma hora
    // não existia para o sistema. Era exatamente o que acontecia com sete das
    // onze fiscais em produção. Agora as duas pontas dizem 07:00.
    const maisTarde = await comparar({ entradaNaEscalaDaBia: '08:00' });
    expect(maisTarde.publicada.get('col-bia')).toBe('07:00');
    expect(maisTarde.deteccao.get('col-bia')).toBe('07:00');
  });

  it('dispensa gravada na escala não vence a ficha', async () => {
    // Uma linha de folga na escala semanal para um dia que a ficha diz de
    // trabalho não cria descanso: a ficha decide sozinha (ADR 0023 + 0026). A
    // linha só volta a valer quando a ficha é omissa — coberto em
    // `folga.service.spec.ts`.
    const { escalados } = montar({
      especialOperador: { diaSemana: 3, entrada: '10:00', saida: '18:00' },
    });
    const prisma = (escalados as unknown as { prisma: unknown }).prisma as {
      escalaEntry: { findMany: unknown };
    };
    // Reescreve a exceção do cenário como folga.
    prisma.escalaEntry.findMany = () =>
      Promise.resolve([
        {
          funcionarioId: 'col-erick',
          colaboradorId: 'col-erick',
          diaSemana: 3,
          folga: true,
          especial: true,
          entrada: null,
          saida: null,
        },
      ]);
    const folga = new FolgaService(prisma as never, undefined);

    expect(await folga.ehFolga(QUARTA, ['col-erick'])).toBe(false);
  });
});
