import {
  ResumoSancoes,
  resumirSancoes,
  sugerirProximoPasso,
} from './incidencias.domain';

/** Data UTC (meia-noite) a partir de "yyyy-mm-dd". */
function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe('sugerirProximoPasso (disciplina progressiva)', () => {
  it('sem histórico → advertência', () => {
    expect(sugerirProximoPasso(0, 0)).toBe('ADVERTENCIA');
    expect(sugerirProximoPasso(1, 0)).toBe('ADVERTENCIA');
    expect(sugerirProximoPasso(2, 0)).toBe('ADVERTENCIA');
  });

  it('3+ advertências e nenhuma suspensão → suspensão', () => {
    expect(sugerirProximoPasso(3, 0)).toBe('SUSPENSAO');
    expect(sugerirProximoPasso(5, 0)).toBe('SUSPENSAO');
  });

  it('com suspensão prévia → avaliar desligamento', () => {
    expect(sugerirProximoPasso(0, 1)).toBe('AVALIAR_DESLIGAMENTO');
    expect(sugerirProximoPasso(4, 2)).toBe('AVALIAR_DESLIGAMENTO');
  });
});

describe('resumirSancoes', () => {
  const hoje = d('2026-07-05');

  it('agrega por colaborador, conta totais e sugere o próximo passo', () => {
    const atuais = [
      {
        colaboradorId: 'a',
        nome: 'Ana',
        tipo: 'ADVERTENCIA' as const,
        data: d('2026-07-01'),
      },
      {
        colaboradorId: 'a',
        nome: 'Ana',
        tipo: 'ADVERTENCIA' as const,
        data: d('2026-07-03'),
      },
      {
        colaboradorId: 'a',
        nome: 'Ana',
        tipo: 'ADVERTENCIA' as const,
        data: d('2026-07-04'),
      },
      {
        colaboradorId: 'b',
        nome: 'Bruno',
        tipo: 'SUSPENSAO' as const,
        data: d('2026-07-02'),
      },
    ];
    const r: ResumoSancoes = resumirSancoes(atuais, [], [], hoje);

    expect(r.totalAdvertencias).toBe(3);
    expect(r.totalSuspensoes).toBe(1);

    const ana = r.porColaborador.find((c) => c.colaboradorId === 'a');
    expect(ana?.advertencias).toBe(3);
    expect(ana?.proximoPasso).toBe('SUSPENSAO');
    expect(ana?.risco).toBe('ALTO');
    expect(ana?.ultima).toEqual({ tipo: 'ADVERTENCIA', data: '2026-07-04' });

    const bruno = r.porColaborador.find((c) => c.colaboradorId === 'b');
    expect(bruno?.proximoPasso).toBe('AVALIAR_DESLIGAMENTO');
  });

  it('calcula a tendência vs. o período anterior', () => {
    const atuais = [
      {
        colaboradorId: 'a',
        nome: 'Ana',
        tipo: 'ADVERTENCIA' as const,
        data: d('2026-07-01'),
      },
      {
        colaboradorId: 'a',
        nome: 'Ana',
        tipo: 'ADVERTENCIA' as const,
        data: d('2026-07-02'),
      },
    ];
    const anteriores = [{ tipo: 'ADVERTENCIA' as const }];
    const r = resumirSancoes(atuais, anteriores, [], hoje);
    expect(r.tendenciaAdvertencias).toBe(1); // 2 agora vs 1 antes
    expect(r.tendenciaSuspensoes).toBe(0);
  });

  it('lista quem está suspenso hoje com os dias restantes (inclusivo)', () => {
    const suspensoes = [
      // cobre hoje (05/07): 04→06, restam 06 e 05 = 2 dias.
      {
        colaboradorId: 'b',
        nome: 'Bruno',
        data: d('2026-07-04'),
        dataFim: d('2026-07-06'),
      },
      // já terminou (fim 03/07): não aparece.
      {
        colaboradorId: 'c',
        nome: 'Caio',
        data: d('2026-07-01'),
        dataFim: d('2026-07-03'),
      },
    ];
    const r = resumirSancoes([], [], suspensoes, hoje);
    expect(r.suspensosAgora).toHaveLength(1);
    expect(r.suspensosAgora[0].colaboradorId).toBe('b');
    expect(r.suspensosAgora[0].diasRestantes).toBe(2);
  });

  it('ordena o panorama por risco (mais alto primeiro)', () => {
    const atuais = [
      {
        colaboradorId: 'baixo',
        nome: 'Zé',
        tipo: 'ADVERTENCIA' as const,
        data: d('2026-07-01'),
      },
      {
        colaboradorId: 'alto',
        nome: 'Ana',
        tipo: 'SUSPENSAO' as const,
        data: d('2026-07-01'),
      },
    ];
    const r = resumirSancoes(atuais, [], [], hoje);
    expect(r.porColaborador[0].colaboradorId).toBe('alto');
  });
});
