import { FiscaisService } from './fiscais.service';
import { EscalaService } from './escala.service';
import { inicioDoDia } from './fiscais.domain';

/**
 * Testes unitários dos serviços de fiscais (controle de jornada) e escala,
 * usando um `PrismaService` falso (em memória), sem banco de dados.
 */
describe('FiscaisService e EscalaService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function criarPrisma() {
    const fiscais = [
      { id: 'f1', nome: 'Karen Mendoza Barro', usuarioId: 'u1' },
      { id: 'f2', nome: 'Ana Souza', usuarioId: 'u2' },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registros: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ausencias: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const escalas: any[] = [];
    let seq = 0;

    return {
      registros,
      ausencias,
      fiscal: {
        findMany: () => Promise.resolve(fiscais.map((f) => ({ ...f }))),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findUnique: ({ where: { id } }: any) =>
          Promise.resolve(fiscais.find((f) => f.id === id) ?? null),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findFirst: ({ where: { usuarioId } }: any) =>
          Promise.resolve(
            fiscais.find((f) => f.usuarioId === usuarioId) ?? null,
          ),
      },
      registroPontoFiscal: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: ({ data }: any) => {
          const novo = { id: `r${++seq}`, ...data };
          registros.push(novo);
          return Promise.resolve({ ...novo });
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findMany: ({ where }: any) =>
          Promise.resolve(
            registros
              .filter(
                (r) =>
                  (where.fiscalId === undefined ||
                    r.fiscalId === where.fiscalId) &&
                  (where.data === undefined ||
                    r.data.getTime() === where.data.getTime()),
              )
              .map((r) => ({ ...r })),
          ),
      },
      ausencia: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        upsert: ({ create }: any) => {
          ausencias.push({ ...create });
          return Promise.resolve({ ...create });
        },
      },
      escalaEntry: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: ({ data }: any) => {
          const novo = { id: `e${++seq}`, ...data };
          escalas.push(novo);
          return Promise.resolve({ ...novo });
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findMany: ({ where }: any) =>
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findFirst: ({ where }: any) =>
          Promise.resolve(
            escalas.find(
              (e) =>
                (where.funcionarioId === undefined ||
                  e.funcionarioId === where.funcionarioId) &&
                (where.diaSemana === undefined ||
                  e.diaSemana === where.diaSemana) &&
                (where.folga === undefined || e.folga === where.folga),
            ) ?? null,
          ),
      },
    };
  }

  it('define o status do fiscal e registra o ponto', async () => {
    const prisma = criarPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fiscais = new FiscaisService(prisma as any);
    const r = await fiscais.definirStatus(
      'f1',
      'DISPONIVEL',
      new Date('2024-03-10T08:00:00Z'),
    );
    expect(r.status).toBe('DISPONIVEL');
    expect(r.primeiroNome).toBe('Karen');
    expect(prisma.registros).toHaveLength(1);
    expect(prisma.registros[0].data.getTime()).toBe(
      inicioDoDia(new Date('2024-03-10T08:00:00Z')).getTime(),
    );
  });

  it('painel lista todos os fiscais; sem ponto hoje => FORA_EXPEDIENTE', async () => {
    const prisma = criarPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fiscais = new FiscaisService(prisma as any);
    await fiscais.definirStatus('f1', 'DISPONIVEL');
    const painel = await fiscais.painel();
    const f1 = painel.find((p) => p.fiscalId === 'f1');
    const f2 = painel.find((p) => p.fiscalId === 'f2');
    expect(f1?.status).toBe('DISPONIVEL');
    expect(f2?.status).toBe('FORA_EXPEDIENTE');
    expect(f1?.primeiroNome).toBe('Karen');
  });

  it('calcula a jornada do dia (trabalhando, intervalo e carga horária)', async () => {
    const prisma = criarPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fiscais = new FiscaisService(prisma as any);
    const h = (hhmm: string) => new Date(`2024-03-10T${hhmm}:00Z`);
    await fiscais.definirStatus('f1', 'DISPONIVEL', h('08:00'));
    await fiscais.definirStatus('f1', 'INTERVALO', h('10:00'));
    await fiscais.definirStatus('f1', 'DISPONIVEL', h('10:30'));
    await fiscais.definirStatus('f1', 'FORA_EXPEDIENTE', h('12:00'));

    const jornada = await fiscais.jornadaDoDia(
      new Date('2024-03-10T00:00:00Z'),
    );
    const f1 = jornada.find((j) => j.fiscalId === 'f1');
    const HORA = 3_600_000;
    // Trabalhando: 08–10 (2h) + 10:30–12 (1,5h) = 3,5h.
    expect(f1?.tempoTrabalhandoMs).toBe(3.5 * HORA);
    // Intervalo: 10–10:30 = 0,5h.
    expect(f1?.tempoIntervaloMs).toBe(0.5 * HORA);
    // Carga horária = tempo trabalhando (sem intervalo), conforme a definição
    // do domínio (`Jornada.cargaHorariaMs`): 3,5h.
    expect(f1?.cargaHorariaMs).toBe(3.5 * HORA);
    expect(f1?.status).toBe('FORA_EXPEDIENTE');
  });

  it('registra a falta do fiscal no dia', async () => {
    const prisma = criarPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fiscais = new FiscaisService(prisma as any);
    await fiscais.registrarFalta('f1', new Date('2024-03-10T09:00:00Z'));
    expect(prisma.ausencias).toHaveLength(1);
    expect(prisma.ausencias[0].pessoaId).toBe('f1');
  });

  it('cadastra escala com horários por dia, intervalo variável e folga (Req 4.3.1-4.3.4)', async () => {
    const prisma = criarPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const escala = new EscalaService(prisma as any);
    await escala.cadastrarEscala({
      funcionarioId: 'func-1',
      diaSemana: 1,
      entrada: '08:00',
      saida: '16:00',
      intervaloMin: 60,
    });
    await escala.cadastrarEscala({
      funcionarioId: 'func-1',
      diaSemana: 0,
      folga: true,
    });
    const seg = await escala.resolverEscalaEfetiva('func-1', 1);
    expect((seg as { entrada: string }).entrada).toBe('08:00');
    const dom = await escala.resolverEscalaEfetiva('func-1', 0);
    expect(dom).toBe('FOLGA');
  });

  it('horário especial prevalece sobre a regra geral (Req 4.3.5)', async () => {
    const prisma = criarPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const escala = new EscalaService(prisma as any);
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
  });
});
