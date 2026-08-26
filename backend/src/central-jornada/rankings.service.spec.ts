/**
 * Testes da base dos RANKINGS do time no ciclo (26→25) — o que abre ao tocar
 * numa card do "Resumo do time".
 *
 * A garantia mais importante aqui é de **coerência**: o tamanho de cada lista de
 * detalhe tem de ser igual ao contador que a card exibe. Se o detalhe e o número
 * discordarem, o ranking mente — e é justamente esse tipo de divergência que
 * herdar `CentralPessoaResumo` (em vez de recalcular) pretende impedir.
 *
 * "Agora" é fixado em 10/07/2026, então os dias usados estão encerrados.
 */
import { CentralJornadaService } from './central-jornada.service';

const UMA_HORA = 3_600_000;

function dia(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function batida(pessoaId: string, id: string, iso: string, hhmm: string) {
  return {
    id,
    pessoaId,
    colaboradorId: pessoaId,
    data: dia(iso),
    hora: new Date(`${iso}T${hhmm}:00.000Z`),
  };
}

interface FichaTeste {
  id: string;
  nome: string;
  funcao: string;
  matricula: string;
  usuarioId: string | null;
  folgaDiaSemana: number | null;
  grupoDomingo: string | null;
  entradaSemana: string | null;
  entradaFds: string | null;
  entradaDom: string | null;
  tipoContratoJornadaId: string | null;
}

/** Turno de entrada às 08:00 nos dias úteis, sem folga fixa. */
function ficha(id: string, nome: string, funcao = 'OPERADOR'): FichaTeste {
  return {
    id,
    nome,
    funcao,
    matricula: id.toUpperCase(),
    usuarioId: null,
    folgaDiaSemana: null,
    grupoDomingo: null,
    entradaSemana: '08:00',
    entradaFds: '08:00',
    entradaDom: null,
    tipoContratoJornadaId: null,
  };
}

/** Jornada limpa de 7h (dias de semana): 08–12 + 13:30–16:30, sem extra nem TAC. */
function diaLimpo(pessoaId: string, prefixo: string, iso: string) {
  return [
    batida(pessoaId, `${prefixo}1`, iso, '08:00'),
    batida(pessoaId, `${prefixo}2`, iso, '12:00'),
    batida(pessoaId, `${prefixo}3`, iso, '13:30'),
    batida(pessoaId, `${prefixo}4`, iso, '16:30'),
  ];
}

// Ana concentra todos os casos; Bruno não tem nada (é o "zerado" que a tela
// manda para o rodapé recolhido).
const BATIDAS = [
  // Seg 29/06 — dia limpo (nenhum problema).
  ...diaLimpo('c1', 'a', '2026-06-29'),
  // Ter 30/06 — 8h30 trabalhadas (base 7h) → +1h30 de extra 50%, sem TAC.
  batida('c1', 'b1', '2026-06-30', '08:00'),
  batida('c1', 'b2', '2026-06-30', '12:00'),
  batida('c1', 'b3', '2026-06-30', '13:30'),
  batida('c1', 'b4', '2026-06-30', '18:00'),
  // Qua 01/07 — 9h30 trabalhadas → +2h30 de extra: passa de 1h50 e vira TAC.
  batida('c1', 'c1a', '2026-07-01', '08:00'),
  batida('c1', 'c2a', '2026-07-01', '12:00'),
  batida('c1', 'c3a', '2026-07-01', '13:30'),
  batida('c1', 'c4a', '2026-07-01', '19:00'),
  // Qui 02/07 — entrou 09:00 com turno 08:00 → 60 min de atraso (só atraso).
  batida('c1', 'd1', '2026-07-02', '09:00'),
  batida('c1', 'd2', '2026-07-02', '12:00'),
  batida('c1', 'd3', '2026-07-02', '13:30'),
  batida('c1', 'd4', '2026-07-02', '16:30'),
  // Seg 06/07 — dia limpo, mas com ausência lançada no mesmo dia → conflito.
  ...diaLimpo('c1', 'e', '2026-07-06'),
];

const AUSENCIAS = [
  // Sex 03/07 — atestado (abonado, entra no contador de faltas).
  {
    id: 'au1',
    pessoaId: 'c1',
    colaboradorId: 'c1',
    data: dia('2026-07-03'),
    debitoHoras: false,
    motivoJustificativa: 'ATESTADO_MEDICO',
    statusJustificativa: 'APROVADA',
  },
  // Sáb 04/07 — falta marcada como débito de horas (base do sábado: 8h).
  {
    id: 'au2',
    pessoaId: 'c1',
    colaboradorId: 'c1',
    data: dia('2026-07-04'),
    debitoHoras: true,
    motivoJustificativa: null,
    statusJustificativa: 'PENDENTE',
  },
  // Seg 06/07 — ausência no mesmo dia em que bateu ponto → CONFLITO (não conta
  // como falta: as horas vêm das batidas).
  {
    id: 'au3',
    pessoaId: 'c1',
    colaboradorId: 'c1',
    data: dia('2026-07-06'),
    debitoHoras: false,
    motivoJustificativa: 'OUTRO',
    statusJustificativa: 'PENDENTE',
  },
];

function montar() {
  const prismaFake = {
    colaborador: {
      findMany: jest
        .fn()
        .mockResolvedValue([ficha('c1', 'Ana Souza'), ficha('c2', 'Bruno Lima', 'FISCAL')]),
    },
    batidaPonto: { findMany: jest.fn().mockResolvedValue(BATIDAS) },
    ausencia: { findMany: jest.fn().mockResolvedValue(AUSENCIAS) },
    fiscal: { findMany: jest.fn().mockResolvedValue([]) },
    usuario: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const feriadosFake = {
    mapaNoPeriodo: jest.fn().mockResolvedValue(new Map<number, string>()),
  };
  return new CentralJornadaService(prismaFake as never, feriadosFake as never);
}

describe('CentralJornadaService.rankingsCiclo', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-10T12:00:00.000Z'));
  });
  afterAll(() => jest.useRealTimers());

  it('devolve todas as pessoas do ciclo, inclusive as zeradas', async () => {
    const rel = await montar().rankingsCiclo(0);

    expect(rel.pessoas.map((p) => p.nome)).toEqual(['Ana Souza', 'Bruno Lima']);
    const bruno = rel.pessoas[1];
    expect(bruno.faltas).toBe(0);
    expect(bruno.faltasDetalhe).toEqual([]);
    expect(bruno.atrasosDetalhe).toEqual([]);
    expect(bruno.tacDetalhe).toEqual([]);
    expect(bruno.conflitosDetalhe).toEqual([]);
  });

  it('o tamanho de cada detalhe é igual ao contador exibido na card', async () => {
    // Esta é a garantia central: número e detalhe não podem divergir.
    const rel = await montar().rankingsCiclo(0);

    for (const p of rel.pessoas) {
      expect(p.faltasDetalhe).toHaveLength(p.faltas);
      expect(p.atestadosDetalhe).toHaveLength(p.atestados);
      expect(p.atrasosDetalhe).toHaveLength(p.atrasos);
      expect(p.tacDetalhe).toHaveLength(p.diasTac);
      expect(p.conflitosDetalhe).toHaveLength(p.conflitos);
    }
  });

  it('detalha as faltas sem misturar atestado, e mostra o débito de cada uma', async () => {
    const ana = (await montar().rankingsCiclo(0)).pessoas[0];

    // Atestado NÃO entra em faltas: só a falta com débito (sáb 04/07).
    expect(ana.faltas).toBe(1);
    expect(ana.faltasDetalhe.map((f) => f.data.slice(0, 10))).toEqual([
      '2026-07-04',
    ]);

    const comDebito = ana.faltasDetalhe[0];
    expect(comDebito.tipo).toBe('FALTA_DEBITO');
    expect(comDebito.debito).toBe(true);
    // Sábado: base de 8h lançadas como devidas.
    expect(comDebito.devidasMs).toBe(8 * UMA_HORA);
  });

  it('detalha os atestados à parte, com as horas abonadas', async () => {
    const ana = (await montar().rankingsCiclo(0)).pessoas[0];

    expect(ana.atestados).toBe(1);
    expect(ana.atestadosDetalhe).toHaveLength(1);
    const atestado = ana.atestadosDetalhe[0];
    expect(atestado.data.slice(0, 10)).toBe('2026-07-03');
    // Sexta: base de 8h, abonadas (não viram hora devida).
    expect(atestado.horasAbonadasMs).toBe(8 * UMA_HORA);
    expect(ana.horasAtestadoMs).toBe(8 * UMA_HORA);
    expect(ana.horasDevidasMs).toBeGreaterThan(0); // o débito é da falta, não do atestado
  });

  it('detalha os atrasos com os minutos e o turno esperado', async () => {
    const ana = (await montar().rankingsCiclo(0)).pessoas[0];

    expect(ana.atrasos).toBe(1);
    expect(ana.atrasosDetalhe[0]).toMatchObject({
      minutos: 60,
      entradaPrevista: '08:00',
    });
    expect(ana.atrasosDetalhe[0].data.slice(0, 10)).toBe('2026-07-02');
  });

  it('detalha o TAC com o motivo de cada dia', async () => {
    const ana = (await montar().rankingsCiclo(0)).pessoas[0];

    expect(ana.diasTac).toBe(1);
    expect(ana.tacDetalhe[0].data.slice(0, 10)).toBe('2026-07-01');
    expect(ana.tacDetalhe[0].motivos).toContain(
      'Excedeu 1h50 de horas extras',
    );
  });

  it('detalha os conflitos ponto↔ausência com o motivo lançado', async () => {
    const ana = (await montar().rankingsCiclo(0)).pessoas[0];

    expect(ana.conflitos).toBe(1);
    expect(ana.conflitosDetalhe[0]).toMatchObject({
      motivoJustificativa: 'OUTRO',
      statusJustificativa: 'PENDENTE',
      debito: false,
    });
    // O dia do conflito NÃO entra em faltas (as horas vêm das batidas).
    expect(ana.faltasDetalhe.map((f) => f.data.slice(0, 10))).not.toContain(
      '2026-07-06',
    );
  });

  it('traz as horas extras 50%/100% do mesmo resumo exibido na Central', async () => {
    const service = montar();
    const [rankings, resumo] = await Promise.all([
      service.rankingsCiclo(0),
      service.resumoCiclo(0),
    ]);

    const anaRanking = rankings.pessoas[0];
    const anaResumo = resumo.pessoas[0];

    // +1h30 (30/06) +2h30 (01/07) de extra 50%; nenhum domingo trabalhado.
    expect(anaRanking.extras50Ms).toBe(4 * UMA_HORA);
    expect(anaRanking.extras100Ms).toBe(0);
    // E é literalmente o mesmo cálculo do resumo do ciclo — não um segundo.
    expect(anaRanking.extras50Ms).toBe(anaResumo.extras50Ms);
    expect(anaRanking.extras50AtualMs).toBe(anaResumo.extras50AtualMs);
    expect(anaRanking.faltas).toBe(anaResumo.faltas);
    expect(anaRanking.diasTac).toBe(anaResumo.diasTac);
    expect(anaRanking.atrasos).toBe(anaResumo.atrasos);
    expect(anaRanking.conflitos).toBe(anaResumo.conflitos);
  });

  it('devolve o período do ciclo pedido (26→25)', async () => {
    const rel = await montar().rankingsCiclo(0);

    expect(rel.periodo.deslocamento).toBe(0);
    expect(rel.periodo.rotulo).toBeTruthy();
  });
});
