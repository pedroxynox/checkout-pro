import { EscalaService } from './escala.service';

/**
 * A escala consolidada dos fiscais, resolvida a partir da FICHA (ADR 0026,
 * etapa 2).
 *
 * Este é o ponto que decide a que hora o sistema espera cada fiscal: a "equipe do
 * dia" e o cron de detecção automática de falta consomem esta lista, e o cron
 * ESCREVE falta duas horas depois da hora que sair daqui. Antes a hora vinha da
 * cópia semanal (`EscalaEntry`), um derivado da ficha que ficava velho em silêncio
 * — e era essa a diferença que fazia o sistema esperar sete fiscais até uma hora
 * mais tarde do que a ficha delas dizia, deixando o atraso real invisível.
 *
 * O caso mais importante daqui é o primeiro: a cópia semanal pode dizer o que
 * quiser, não é mais consultada para saber a hora.
 */
describe('EscalaService.escalaConsolidada — o turno vem da ficha', () => {
  // Quarta-feira, 22/07/2026. Não é feriado nacional.
  const QUARTA = '2026-07-22';
  // Domingo, 26/07/2026.
  const DOMINGO = '2026-07-26';
  // 07/09/2026 (Independência) cai numa SEGUNDA — feriado em dia útil.
  const FERIADO_SEGUNDA = '2026-09-07';

  /** Uma ficha de fiscal completa; `over` muda só o que o caso precisa. */
  function ficha(over: Record<string, unknown> = {}) {
    return {
      id: 'col-bia',
      nome: 'Bia Nogueira',
      matricula: '900001',
      usuarioId: 'u-bia',
      ativo: true,
      folgaDiaSemana: 1, // folga na segunda
      grupoDomingo: null,
      entradaSemana: '13:10',
      saidaSemana: '22:10',
      entradaFds: '13:10',
      saidaFds: '22:10',
      entradaDom: '08:00',
      saidaDom: '17:00',
      ...over,
    };
  }

  interface Cenario {
    fichas?: Record<string, unknown>[];
    fiscais?: { id: string; nome: string; usuarioId: string | null }[];
    /** Hora gravada na cópia semanal — nunca deve influenciar o resultado. */
    entradaNaCopia?: string;
    /** Vínculo gravado na cópia semanal (o resgate de quem perdeu a conta). */
    vinculoNaCopia?: { funcionarioId: string; colaboradorId: string };
    ehFeriado?: boolean;
    /** Âncora do rodízio de domingo; sem ela, ninguém trabalha no domingo. */
    ancora?: { data: Date; ordem: string[] } | null;
    deFerias?: string[];
  }

  function servico(cenario: Cenario = {}): EscalaService {
    const fichas = cenario.fichas ?? [ficha()];
    const fiscais = cenario.fiscais ?? [
      { id: 'fiscal-bia', nome: 'Bia', usuarioId: 'u-bia' },
    ];
    const copia = [
      {
        funcionarioId: cenario.vinculoNaCopia?.funcionarioId ?? 'fiscal-bia',
        colaboradorId: cenario.vinculoNaCopia?.colaboradorId ?? 'col-bia',
        diaSemana: 3,
        entrada: cenario.entradaNaCopia ?? '13:50',
        saida: '22:50',
        intervaloMin: 120,
        folga: false,
        especial: false,
      },
    ];
    const prisma = {
      fiscal: { findMany: () => Promise.resolve(fiscais) },
      usuario: {
        findMany: () => Promise.resolve([{ id: 'u-bia', login: '900001' }]),
      },
      colaborador: { findMany: () => Promise.resolve(fichas) },
      escalaEntry: { findMany: () => Promise.resolve(copia) },
    };
    const escalaDomingo = {
      obterAncora: () => Promise.resolve(cenario.ancora ?? null),
    };
    const feriados = {
      ehFeriado: () => Promise.resolve(cenario.ehFeriado ?? false),
    };
    const ferias = {
      colaboradoresDeFeriasNoDia: () =>
        Promise.resolve(new Set(cenario.deFerias ?? [])),
    };
    return new EscalaService(
      prisma as never,
      escalaDomingo as never,
      ferias as never,
      feriados as never,
    );
  }

  /** A hora de entrada de uma pessoa na consolidada ('FOLGA' quando descansa). */
  async function entradaDe(
    cenario: Cenario,
    diaSemana: number,
    dataISO?: string,
    funcionarioId = 'fiscal-bia',
  ): Promise<string | null | 'FOLGA' | undefined> {
    const itens = await servico(cenario).escalaConsolidada(diaSemana, dataISO);
    const item = itens.find((i) => i.funcionarioId === funcionarioId);
    if (!item) return undefined;
    return item.efetiva === 'FOLGA' ? 'FOLGA' : item.efetiva.entrada;
  }

  it('a hora é a da ficha, mesmo quando a cópia semanal diz outra', async () => {
    // O caso de produção: ficha 13:10, cópia 13:50. Quarenta minutos em que o
    // sistema esperava a pessoa mais tarde do que a escala que ela recebeu.
    expect(await entradaDe({ entradaNaCopia: '13:50' }, 3, QUARTA)).toBe(
      '13:10',
    );
    // E no outro sentido, para que ninguém suponha que "vale a mais tardia":
    expect(await entradaDe({ entradaNaCopia: '06:50' }, 3, QUARTA)).toBe(
      '13:10',
    );
  });

  it('o dia de folga da ficha é FOLGA, mesmo com hora na cópia semanal', async () => {
    // Segunda (1) é a folga da ficha; a cópia tem uma entrada de quarta, mas o
    // que decide é a ficha.
    expect(await entradaDe({}, 1, '2026-07-20')).toBe('FOLGA');
  });

  it('sem horário na ficha para o dia, não há turno a cobrar', async () => {
    const semHorario = { entradaSemana: null, saidaSemana: null };
    expect(await entradaDe({ fichas: [ficha(semHorario)] }, 3, QUARTA)).toBe(
      'FOLGA',
    );
  });

  it('feriado em dia útil usa o horário de DOMINGO da ficha', async () => {
    // A mesma regra que a jornada aplica ao pagamento e a escala publicada ao
    // turno. Para os fiscais esse horário vive na ficha (entradaDom).
    // Esta ficha folga na quarta, então a segunda é dia de trabalho.
    expect(
      await entradaDe(
        { ehFeriado: true, fichas: [ficha({ folgaDiaSemana: 3 })] },
        1,
        FERIADO_SEGUNDA,
      ),
    ).toBe('08:00');
  });

  it('feriado não muda a folga: quem folga na segunda segue de folga', async () => {
    expect(
      await entradaDe(
        { ehFeriado: true, fichas: [ficha({ folgaDiaSemana: 1 })] },
        1,
        FERIADO_SEGUNDA,
      ),
    ).toBe('FOLGA');
  });

  it('domingo: o rodízio decide, e o horário é o de domingo da ficha', async () => {
    const ancora = { data: new Date(Date.UTC(2026, 6, 26)), ordem: ['G1'] };
    // Com uma ordem de um grupo só, G1 é sempre o grupo que folga.
    expect(
      await entradaDe(
        { ancora, fichas: [ficha({ grupoDomingo: 'G1', folgaDiaSemana: 3 })] },
        0,
        DOMINGO,
      ),
    ).toBe('FOLGA');
    // Com dois grupos, no domingo da âncora folga o primeiro da ordem.
    const ordemDupla = {
      data: new Date(Date.UTC(2026, 6, 26)),
      ordem: ['G1', 'G2'],
    };
    expect(
      await entradaDe(
        {
          ancora: ordemDupla,
          fichas: [ficha({ grupoDomingo: 'G2', folgaDiaSemana: 3 })],
        },
        0,
        DOMINGO,
      ),
    ).toBe('08:00');
  });

  it('domingo sem âncora configurada: ninguém é cobrado', async () => {
    // Sem o ponto de partida do rodízio não se sabe quem trabalha neste domingo.
    // Afirmar um turno aqui criaria falta em quem estava de descanso.
    expect(
      await entradaDe(
        { ancora: null, fichas: [ficha({ grupoDomingo: 'G1' })] },
        0,
        DOMINGO,
      ),
    ).toBe('FOLGA');
  });

  it('fiscal DESLIGADO não aparece na escala', async () => {
    expect(await entradaDe({ fichas: [ficha({ ativo: false })] }, 3, QUARTA)) //
      .toBeUndefined();
  });

  it('fiscal de férias no dia não aparece na escala', async () => {
    expect(await entradaDe({ deFerias: ['col-bia'] }, 3, QUARTA)) //
      .toBeUndefined();
  });

  it('fiscal sem ficha nenhuma não aparece nem é cobrado', async () => {
    // Sem ficha não há fonte que afirme o turno dessa pessoa. Antes a cópia
    // semanal órfã preenchia esse vazio com um horário que ninguém revisava.
    const semFicha = await entradaDe(
      {
        fiscais: [{ id: 'fiscal-orfa', nome: 'Órfã', usuarioId: null }],
        fichas: [],
        vinculoNaCopia: {
          funcionarioId: 'outro',
          colaboradorId: 'inexistente',
        },
      },
      3,
      QUARTA,
      'fiscal-orfa',
    );
    expect(semFicha).toBeUndefined();
  });

  it('reconhece a ficha pelo vínculo gravado quando a conta foi desvinculada', async () => {
    // Conta desvinculada nos dois lados: sem o vínculo gravado na cópia semanal
    // esta pessoa desapareceria — e, se estivesse desligada, escaparia do filtro
    // que tira os desligados do quadro.
    const itens = await servico({
      fiscais: [{ id: 'fiscal-sem-conta', nome: 'Ana', usuarioId: null }],
      fichas: [ficha({ id: 'col-ana', nome: 'Ana Souza', usuarioId: null })],
      vinculoNaCopia: {
        funcionarioId: 'fiscal-sem-conta',
        colaboradorId: 'col-ana',
      },
    }).escalaConsolidada(3, QUARTA);

    expect(itens).toHaveLength(1);
    expect(itens[0].colaboradorId).toBe('col-ana');
    expect(itens[0].efetiva === 'FOLGA' ? null : itens[0].efetiva.entrada).toBe(
      '13:10',
    );
  });

  it('sem data concreta, responde o turno típico do dia da semana', async () => {
    // A consulta por dia da semana ("como é a escala de quarta?") não conhece
    // feriado nem posição no rodízio — e é por isso que quem precisa de precisão
    // informa a data.
    expect(await entradaDe({ ehFeriado: true }, 3)).toBe('13:10');
  });
});
