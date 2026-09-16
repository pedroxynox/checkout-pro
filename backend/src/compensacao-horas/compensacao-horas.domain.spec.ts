import {
  ContextoAlocacao,
  DataCandidata,
  FaltaCobrivel,
  MIN_FISCAIS_DISPONIVEIS,
  MIN_SALDO_COMPENSAVEL_MS,
  PessoaCompensavel,
  alocarLiberacoes,
  coberturasDeFalta,
  duracao,
  janelaDeTrabalho,
  minutosParaHora,
  ordenarPorUrgencia,
  planoDoDia,
  resumirCarteira,
} from './compensacao-horas.domain';

/**
 * Testes da lógica pura da Compensação de horas (ADR 0021).
 *
 * O foco é o que o dono do projeto decidiu e o que pode dar errado em silêncio:
 * a conta contínua (trabalha `carga − saldo`), a ordem "faltas antes de
 * liberações" (as duas bebem da mesma carteira), a ponta do turno escolhida pelo
 * movimento e o piso de 2 fiscais.
 */

const H = 60 * 60_000;
const REGRAS = {
  maxTrabalhoSemIntervaloMs: 4 * H + 50 * 60_000, // 4h50
  intervaloMinimoMs: H,
};

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('planoDoDia — a conta contínua', () => {
  it('exemplo do dono do projeto: carga 7h, saldo 5h → trabalha 2h sem intervalo', () => {
    const p = planoDoDia(7 * H, 5 * H, REGRAS);
    expect(p.compensarMs).toBe(5 * H);
    expect(p.trabalharMs).toBe(2 * H);
    expect(p.semIntervalo).toBe(true);
    expect(p.presencaMs).toBe(2 * H);
    // A identidade que dá nome à regra.
    expect(p.compensarMs + p.trabalharMs).toBe(7 * H);
  });

  it('saldo maior que a carga: dia inteiro livre e o resto fica para outro dia', () => {
    const p = planoDoDia(7 * H, 9 * H, REGRAS);
    expect(p.compensarMs).toBe(7 * H);
    expect(p.trabalharMs).toBe(0);
    expect(p.presencaMs).toBe(0);
  });

  it('nunca compensa mais do que a pessoa tem (não cria saldo negativo)', () => {
    const p = planoDoDia(8 * H, 3 * H, REGRAS);
    expect(p.compensarMs).toBe(3 * H);
    expect(p.trabalharMs).toBe(5 * H);
  });

  it('jornada que sobra passa de 4h50: exige intervalo e a presença cresce 1h', () => {
    // Sex/sáb: carga 8h, saldo 3h → trabalha 5h (> 4h50).
    const p = planoDoDia(8 * H, 3 * H, REGRAS);
    expect(p.semIntervalo).toBe(false);
    expect(p.presencaMs).toBe(5 * H + H);
  });

  it('carga 7h com saldo de 3h: trabalha 4h, ainda sem intervalo', () => {
    const p = planoDoDia(7 * H, 3 * H, REGRAS);
    expect(p.trabalharMs).toBe(4 * H);
    expect(p.semIntervalo).toBe(true);
  });

  it('saldo zero ou negativo não compensa nada', () => {
    expect(planoDoDia(7 * H, 0, REGRAS).compensarMs).toBe(0);
    expect(planoDoDia(7 * H, -2 * H, REGRAS).compensarMs).toBe(0);
  });
});

describe('janelaDeTrabalho — em que ponta do turno liberar', () => {
  // Turno 08:00–17:00. Manhã cheia, tarde vazia.
  const manhaCheia = (inicioMin: number) => (inicioMin < 12 * 60 ? 1000 : 10);
  const vendaManhaCheia = (i: number, f: number) =>
    manhaCheia(i) * ((f - i) / 60);
  const vendaTardeCheia = (i: number, f: number) =>
    (i < 12 * 60 ? 10 : 1000) * ((f - i) / 60);

  it('manhã cheia → fica no INÍCIO do turno (entra na hora, sai antes)', () => {
    const j = janelaDeTrabalho('08:00', '17:00', 2 * H, vendaManhaCheia);
    expect(j).toEqual({ horaInicio: '08:00', horaFim: '10:00', ponta: 'INICIO' });
  });

  it('tarde cheia → fica no FIM do turno (entra mais tarde, sai na hora)', () => {
    const j = janelaDeTrabalho('08:00', '17:00', 2 * H, vendaTardeCheia);
    expect(j).toEqual({ horaInicio: '15:00', horaFim: '17:00', ponta: 'FIM' });
  });

  it('empate resolve por INICIO (o horário que a pessoa já conhece)', () => {
    const j = janelaDeTrabalho('08:00', '17:00', 2 * H, () => 500);
    expect(j?.ponta).toBe('INICIO');
  });

  it('dia inteiro livre não tem janela', () => {
    expect(janelaDeTrabalho('08:00', '17:00', 0, () => 1)).toBeNull();
  });

  it('sem turno cadastrado não arrisca uma faixa', () => {
    expect(janelaDeTrabalho(null, '17:00', 2 * H, () => 1)).toBeNull();
    expect(janelaDeTrabalho('08:00', null, 2 * H, () => 1)).toBeNull();
    expect(janelaDeTrabalho('08:00', '08:00', 2 * H, () => 1)).toBeNull();
  });

  it('presença que não caberia no turno não gera janela', () => {
    // Turno de 4h, presença de 5h: não é compensação, é turno normal.
    expect(janelaDeTrabalho('08:00', '12:00', 5 * H, () => 1)).toBeNull();
  });

  it('minutosParaHora fecha o dia em 23:59 em vez de virar', () => {
    expect(minutosParaHora(0)).toBe('00:00');
    expect(minutosParaHora(8 * 60 + 30)).toBe('08:30');
    expect(minutosParaHora(24 * 60 + 90)).toBe('23:59');
  });
});

describe('coberturasDeFalta — a carteira é uma só', () => {
  const falta = (
    iso: string,
    cargaMs = 7 * H,
    status: 'PENDENTE' | 'INJUSTIFICADA' = 'INJUSTIFICADA',
  ): FaltaCobrivel => ({
    ausenciaId: `a-${iso}`,
    colaboradorId: 'col-1',
    nome: 'Ana',
    funcao: 'OPERADOR',
    data: dia(iso),
    diaSemana: dia(iso).getUTCDay(),
    cargaMs,
    status,
  });

  it('cobre a falta inteira e devolve o saldo que sobrou', () => {
    const r = coberturasDeFalta(10 * H, [falta('2026-09-02')]);
    expect(r.sugestoes).toHaveLength(1);
    expect(r.sugestoes[0].saldoAntesMs).toBe(10 * H);
    expect(r.sugestoes[0].saldoDepoisMs).toBe(3 * H);
    expect(r.saldoRestanteMs).toBe(3 * H);
  });

  it('não cobre pela metade: saldo insuficiente deixa a falta de fora', () => {
    const r = coberturasDeFalta(3 * H, [falta('2026-09-02')]);
    expect(r.sugestoes).toHaveLength(0);
    expect(r.saldoRestanteMs).toBe(3 * H);
  });

  it('cobre as mais antigas primeiro (são as que o ciclo vai fechar antes)', () => {
    const r = coberturasDeFalta(15 * H, [
      falta('2026-09-10'),
      falta('2026-09-02'),
    ]);
    expect(r.sugestoes.map((s) => s.data.toISOString())).toEqual([
      dia('2026-09-02').toISOString(),
      dia('2026-09-10').toISOString(),
    ]);
    expect(r.saldoRestanteMs).toBe(H);
  });

  it('a justificativa diz que o débito NÃO apaga a falta', () => {
    const r = coberturasDeFalta(10 * H, [falta('2026-09-02')]);
    expect(r.sugestoes[0].justificativa).toContain('Não apaga a falta');
  });

  it('distingue falta confirmada de falta ainda sem análise', () => {
    const conf = coberturasDeFalta(10 * H, [falta('2026-09-02')]);
    const pend = coberturasDeFalta(10 * H, [
      falta('2026-09-02', 7 * H, 'PENDENTE'),
    ]);
    expect(conf.sugestoes[0].justificativa).toContain('não justificada');
    expect(pend.sugestoes[0].justificativa).toContain('sem análise');
  });
});

describe('ordenarPorUrgencia', () => {
  const p = (
    nome: string,
    saldo50Ms: number,
    diasTac = 0,
  ): PessoaCompensavel => ({
    colaboradorId: nome,
    nome,
    funcao: 'OPERADOR',
    saldo50Ms,
    diasTac,
  });

  it('TAC vem antes do maior saldo', () => {
    const ordem = ordenarPorUrgencia([p('Ana', 9 * H), p('Bia', 3 * H, 1)]);
    expect(ordem.map((x) => x.nome)).toEqual(['Bia', 'Ana']);
  });

  it('sem TAC, o maior saldo primeiro', () => {
    const ordem = ordenarPorUrgencia([p('Ana', 3 * H), p('Bia', 9 * H)]);
    expect(ordem.map((x) => x.nome)).toEqual(['Bia', 'Ana']);
  });

  it('empate total resolve por nome (ordem estável entre consultas)', () => {
    const ordem = ordenarPorUrgencia([p('Zuleica', 5 * H), p('Ana', 5 * H)]);
    expect(ordem.map((x) => x.nome)).toEqual(['Ana', 'Zuleica']);
  });
});

describe('alocarLiberacoes', () => {
  // Três datas: quarta é a mais fraca, depois terça, depois quinta.
  const datas: DataCandidata[] = [
    {
      data: dia('2026-09-22'),
      diaSemana: 2,
      movimentoPrevisto: 50_000,
      fonte: 'HISTORICO',
      amostras: 8,
    },
    {
      data: dia('2026-09-23'),
      diaSemana: 3,
      movimentoPrevisto: 40_000,
      fonte: 'HISTORICO',
      amostras: 8,
    },
    {
      data: dia('2026-09-24'),
      diaSemana: 4,
      movimentoPrevisto: 60_000,
      fonte: 'HISTORICO',
      amostras: 8,
    },
  ];

  const ctxBase = (over: Partial<ContextoAlocacao> = {}): ContextoAlocacao => ({
    permitido: () => true,
    cargaDoDia: () => 7 * H,
    turno: () => ({ entrada: '08:00', saida: '17:00' }),
    vendaNaFaixa: () => 100,
    disponiveisNoDia: () => 25,
    regras: () => REGRAS,
    ...over,
  });

  const pessoa = (
    id: string,
    saldo50Ms: number,
    funcao: PessoaCompensavel['funcao'] = 'OPERADOR',
    diasTac = 0,
  ): PessoaCompensavel => ({
    colaboradorId: id,
    nome: id,
    funcao,
    saldo50Ms,
    diasTac,
  });

  it('manda a primeira pessoa para o dia mais fraco do ciclo', () => {
    const [s] = alocarLiberacoes([pessoa('Ana', 5 * H)], datas, ctxBase());
    expect(s.data.toISOString()).toBe(dia('2026-09-23').toISOString());
    expect(s.compensarMs).toBe(5 * H);
    expect(s.trabalharMs).toBe(2 * H);
    expect(s.saldoDepoisMs).toBe(0);
  });

  it('não sugere abaixo de 3h de saldo (decisão do dono do projeto)', () => {
    const abaixo = MIN_SALDO_COMPENSAVEL_MS - 60_000;
    expect(alocarLiberacoes([pessoa('Ana', abaixo)], datas, ctxBase())).toEqual(
      [],
    );
    expect(
      alocarLiberacoes([pessoa('Ana', MIN_SALDO_COMPENSAVEL_MS)], datas, ctxBase()),
    ).toHaveLength(1);
  });

  it('distribui em vez de empilhar todos no dia mais fraco', () => {
    const s = alocarLiberacoes(
      [pessoa('Ana', 5 * H), pessoa('Bia', 5 * H), pessoa('Cida', 5 * H)],
      datas,
      ctxBase(),
    );
    const dias = new Set(s.map((x) => x.data.toISOString()));
    expect(s).toHaveLength(3);
    expect(dias.size).toBeGreaterThan(1);
  });

  it('respeita o piso de 2 fiscais disponíveis no dia', () => {
    // Com 3 fiscais disponíveis, só 1 pode sair (3 − 1 = 2 = piso).
    const s = alocarLiberacoes(
      [
        pessoa('F1', 5 * H, 'FISCAL'),
        pessoa('F2', 5 * H, 'FISCAL'),
        pessoa('F3', 5 * H, 'FISCAL'),
      ],
      [datas[1]],
      ctxBase({ disponiveisNoDia: () => 3 }),
    );
    expect(s).toHaveLength(1);
    expect(s[0].coberturaNoDia).toBe(2);
    expect(s[0].coberturaNoDia).toBeGreaterThanOrEqual(MIN_FISCAIS_DISPONIVEIS);
  });

  it('operador não tem piso: os 20 de COBERTURA_MINIMA não vetam', () => {
    const s = alocarLiberacoes(
      [pessoa('Ana', 5 * H), pessoa('Bia', 5 * H)],
      [datas[1]],
      ctxBase({ disponiveisNoDia: () => 2 }),
    );
    expect(s).toHaveLength(2);
  });

  it('data proibida (folga, férias, ausência) nunca é sugerida', () => {
    const proibida = dia('2026-09-23').getTime();
    const s = alocarLiberacoes(
      [pessoa('Ana', 5 * H)],
      datas,
      ctxBase({ permitido: (_id, d) => d.getTime() !== proibida }),
    );
    expect(s[0].data.getTime()).not.toBe(proibida);
  });

  it('sem nenhuma data permitida, não sugere', () => {
    const s = alocarLiberacoes(
      [pessoa('Ana', 5 * H)],
      datas,
      ctxBase({ permitido: () => false }),
    );
    expect(s).toEqual([]);
  });

  it('dia parcial sem turno conhecido não é sugerido (seria inexecutável)', () => {
    const s = alocarLiberacoes(
      [pessoa('Ana', 5 * H)],
      datas,
      ctxBase({ turno: () => ({ entrada: null, saida: null }) }),
    );
    expect(s).toEqual([]);
  });

  it('dia INTEIRO livre não precisa de turno e é sugerido mesmo sem ele', () => {
    const s = alocarLiberacoes(
      [pessoa('Ana', 7 * H)],
      datas,
      ctxBase({ turno: () => ({ entrada: null, saida: null }) }),
    );
    expect(s).toHaveLength(1);
    expect(s[0].trabalharMs).toBe(0);
    expect(s[0].horaInicio).toBeNull();
  });

  it('uma pessoa recebe no máximo uma liberação por rodada', () => {
    const s = alocarLiberacoes([pessoa('Ana', 20 * H)], datas, ctxBase());
    expect(s).toHaveLength(1);
  });

  it('quem tem TAC é atendido primeiro, e a frase avisa', () => {
    const s = alocarLiberacoes(
      [pessoa('Ana', 9 * H), pessoa('Bia', 4 * H, 'OPERADOR', 2)],
      datas,
      ctxBase(),
    );
    expect(s[0].nome).toBe('Bia');
    expect(s[0].justificativa).toContain('TAC');
  });

  it('a justificativa traz o dia, a previsão e o que a pessoa faz', () => {
    const [s] = alocarLiberacoes([pessoa('Ana', 5 * H)], datas, ctxBase());
    expect(s.justificativa).toContain('quarta 23/09');
    expect(s.justificativa).toContain('Ana trabalha 2h');
    expect(s.justificativa).toContain('sem intervalo');
    expect(s.justificativa).toContain('Zera o saldo de 50%');
  });

  it('nunca deixa o saldo negativo, em nenhuma sugestão', () => {
    const s = alocarLiberacoes(
      [pessoa('Ana', 3 * H), pessoa('Bia', 5 * H), pessoa('Cida', 12 * H)],
      datas,
      ctxBase(),
    );
    for (const x of s) {
      expect(x.saldoDepoisMs).toBeGreaterThanOrEqual(0);
      expect(x.compensarMs).toBeLessThanOrEqual(x.saldoAntesMs);
      expect(x.compensarMs).toBeLessThanOrEqual(x.cargaMs);
    }
  });

  it('sem datas candidatas, devolve lista vazia (não quebra)', () => {
    expect(alocarLiberacoes([pessoa('Ana', 5 * H)], [], ctxBase())).toEqual([]);
  });
});

describe('resumirCarteira', () => {
  it('aponta as horas que NÃO cabem no ciclo — o número que interessa', () => {
    const pessoas: PessoaCompensavel[] = [
      {
        colaboradorId: 'a',
        nome: 'Ana',
        funcao: 'OPERADOR',
        saldo50Ms: 10 * H,
        diasTac: 0,
      },
      {
        colaboradorId: 'b',
        nome: 'Bia',
        funcao: 'OPERADOR',
        saldo50Ms: 2 * H,
        diasTac: 0,
      },
    ];
    const r = resumirCarteira(pessoas, [], [], 3);
    expect(r.totalSaldoMs).toBe(12 * H);
    expect(r.pessoasComSaldo).toBe(2);
    // Bia tem 2h: abaixo do mínimo de 3h, não é sugerível ainda.
    expect(r.pessoasAbaixoDoMinimo).toBe(1);
    // Nada alocado: as 12h todas ficam de fora e serão pagas.
    expect(r.naoAlocadoMs).toBe(12 * H);
    expect(r.datasDisponiveis).toBe(3);
  });

  it('o que foi alocado sai do não-alocado', () => {
    const pessoas: PessoaCompensavel[] = [
      {
        colaboradorId: 'a',
        nome: 'Ana',
        funcao: 'OPERADOR',
        saldo50Ms: 10 * H,
        diasTac: 0,
      },
    ];
    const liberacoes = alocarLiberacoes(
      pessoas,
      [
        {
          data: dia('2026-09-23'),
          diaSemana: 3,
          movimentoPrevisto: 40_000,
          fonte: 'HISTORICO',
          amostras: 8,
        },
      ],
      {
        permitido: () => true,
        cargaDoDia: () => 7 * H,
        turno: () => ({ entrada: '08:00', saida: '17:00' }),
        vendaNaFaixa: () => 100,
        disponiveisNoDia: () => 25,
        regras: () => REGRAS,
      },
    );
    const r = resumirCarteira(pessoas, [], liberacoes, 1);
    expect(r.totalLiberacaoMs).toBe(7 * H);
    expect(r.naoAlocadoMs).toBe(3 * H);
  });
});

describe('duracao — como o gestor diria', () => {
  it('formata horas e minutos', () => {
    expect(duracao(5 * H)).toBe('5h');
    expect(duracao(5 * H + 30 * 60_000)).toBe('5h30');
    expect(duracao(45 * 60_000)).toBe('45min');
    expect(duracao(0)).toBe('0min');
    expect(duracao(H + 5 * 60_000)).toBe('1h05');
  });
});
