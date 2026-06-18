import { FiscaisService } from './fiscais.service';
import { EscalaService } from './escala.service';
import { CheckInAtivoError } from './fiscais.errors';

/**
 * Testes de exemplo (unitários) dos serviços de fiscais e escala. Usam um
 * `PrismaService` falso (em memória) exercitando check-in/check-out, alteração
 * de status e o cadastro de escala (horários por dia, intervalo variável,
 * folga e horário especial), sem banco de dados.
 */
describe('FiscaisService e EscalaService', () => {
  interface SessaoFake {
    id: string;
    fiscalId: string;
    checkIn: Date;
    checkOut: Date | null;
    statusAtual: string;
    statusDefinidoEm: Date;
  }
  interface EscalaFake {
    id: string;
    funcionarioId: string;
    diaSemana: number;
    entrada: string | null;
    saida: string | null;
    intervaloMin: number;
    folga: boolean;
    especial: boolean;
  }

  function criarPrisma() {
    const sessoes: SessaoFake[] = [];
    const escalas: EscalaFake[] = [];
    let seq = 0;
    const match = (s: SessaoFake, where: Partial<SessaoFake>) =>
      Object.entries(where).every(
        ([k, v]) => (s as unknown as Record<string, unknown>)[k] === v,
      );

    return {
      sessaoFiscal: {
        create: ({ data }: { data: Omit<SessaoFake, 'id' | 'checkOut'> }) => {
          const novo: SessaoFake = { id: `s${++seq}`, checkOut: null, ...data };
          sessoes.push(novo);
          return Promise.resolve({ ...novo });
        },
        findFirst: ({
          where,
          orderBy,
        }: {
          where: Partial<SessaoFake>;
          orderBy?: { checkIn?: 'asc' | 'desc' };
        }) => {
          let lista = sessoes.filter((s) => match(s, where));
          if (orderBy?.checkIn) {
            const dir = orderBy.checkIn === 'desc' ? -1 : 1;
            lista = [...lista].sort(
              (a, b) => (a.checkIn.getTime() - b.checkIn.getTime()) * dir,
            );
          }
          return Promise.resolve(lista[0] ? { ...lista[0] } : null);
        },
        findMany: ({ where }: { where: Partial<SessaoFake> }) =>
          Promise.resolve(
            sessoes.filter((s) => match(s, where)).map((s) => ({ ...s })),
          ),
        update: ({
          where: { id },
          data,
        }: {
          where: { id: string };
          data: Partial<SessaoFake>;
        }) => {
          const s = sessoes.find((x) => x.id === id)!;
          Object.assign(s, data);
          return Promise.resolve({ ...s });
        },
      },
      escalaEntry: {
        create: ({ data }: { data: Omit<EscalaFake, 'id'> }) => {
          const novo: EscalaFake = { id: `e${++seq}`, ...data };
          escalas.push(novo);
          return Promise.resolve({ ...novo });
        },
        findMany: ({
          where,
        }: {
          where: { funcionarioId?: string; diaSemana?: number };
        }) =>
          Promise.resolve(
            escalas
              .filter(
                (e) =>
                  (where.funcionarioId === undefined ||
                    e.funcionarioId === where.funcionarioId) &&
                  (where.diaSemana === undefined ||
                    e.diaSemana === where.diaSemana),
              )
              .map((e) => ({ ...e })),
          ),
      },
    };
  }

  function criarServicos() {
    const prisma = criarPrisma();
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fiscais: new FiscaisService(prisma as any),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      escala: new EscalaService(prisma as any),
    };
  }

  it('realiza check-in definindo status DISPONIVEL e sessão ativa', async () => {
    const { fiscais } = criarServicos();
    const sessao = await fiscais.checkIn(
      'fisc-1',
      new Date('2024-01-01T08:00:00Z'),
    );
    expect(sessao.statusAtual).toBe('DISPONIVEL');
    expect(sessao.checkOut).toBeNull();
  });

  it('rejeita check-in duplicado com sessão ativa (Req 4.2.3)', async () => {
    const { fiscais } = criarServicos();
    await fiscais.checkIn('fisc-1', new Date('2024-01-01T08:00:00Z'));
    await expect(
      fiscais.checkIn('fisc-1', new Date('2024-01-01T09:00:00Z')),
    ).rejects.toBeInstanceOf(CheckInAtivoError);
  });

  it('altera status (última alteração vence) e registra o horário', async () => {
    const { fiscais } = criarServicos();
    await fiscais.checkIn('fisc-1', new Date('2024-01-01T08:00:00Z'));
    const em = new Date('2024-01-01T08:30:00Z');
    const atualizada = await fiscais.alterarStatus(
      'fisc-1',
      'EM_INTERVALO',
      em,
    );
    expect(atualizada.statusAtual).toBe('EM_INTERVALO');
    expect(atualizada.statusDefinidoEm.getTime()).toBe(em.getTime());
  });

  it('realiza check-out registrando saída e marcando fora de serviço', async () => {
    const { fiscais } = criarServicos();
    await fiscais.checkIn('fisc-1', new Date('2024-01-01T08:00:00Z'));
    const saida = new Date('2024-01-01T17:00:00Z');
    const fechada = await fiscais.checkOut('fisc-1', saida);
    expect(fechada.checkOut?.getTime()).toBe(saida.getTime());
    // Após o check-out, novo check-in é permitido.
    await expect(
      fiscais.checkIn('fisc-1', new Date('2024-01-02T08:00:00Z')),
    ).resolves.toBeDefined();
  });

  it('cadastra escala com horários por dia, intervalo variável e folga (Req 4.3.1-4.3.4)', async () => {
    const { escala } = criarServicos();
    await escala.cadastrarEscala({
      funcionarioId: 'func-1',
      diaSemana: 1,
      entrada: '08:00',
      saida: '16:00',
      intervaloMin: 60,
    });
    await escala.cadastrarEscala({
      funcionarioId: 'func-1',
      diaSemana: 2,
      entrada: '13:00',
      saida: '21:00',
      intervaloMin: 90,
    });
    await escala.cadastrarEscala({
      funcionarioId: 'func-1',
      diaSemana: 0,
      folga: true,
    });

    const seg = await escala.resolverEscalaEfetiva('func-1', 1);
    expect(seg).not.toBe('FOLGA');
    expect((seg as { entrada: string }).entrada).toBe('08:00');
    const ter = await escala.resolverEscalaEfetiva('func-1', 2);
    expect((ter as { intervaloMin: number }).intervaloMin).toBe(90);
    const dom = await escala.resolverEscalaEfetiva('func-1', 0);
    expect(dom).toBe('FOLGA');
  });

  it('horário especial prevalece sobre a regra geral (Req 4.3.5)', async () => {
    const { escala } = criarServicos();
    await escala.cadastrarEscala({
      funcionarioId: 'func-2',
      diaSemana: 3,
      entrada: '08:00',
      saida: '16:00',
      intervaloMin: 60,
    });
    await escala.definirHorarioEspecial('func-2', {
      funcionarioId: 'func-2',
      diaSemana: 3,
      entrada: '10:00',
      saida: '18:00',
      intervaloMin: 30,
    });
    const efetiva = await escala.resolverEscalaEfetiva('func-2', 3);
    expect((efetiva as { entrada: string }).entrada).toBe('10:00');

    const consolidada = await escala.escalaConsolidada(3);
    expect(consolidada).toHaveLength(1);
    expect((consolidada[0].efetiva as { entrada: string }).entrada).toBe(
      '10:00',
    );
  });
});
