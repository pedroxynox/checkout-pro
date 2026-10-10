import { UsuarioAutenticado } from '../common/decorators/usuario-atual.decorator';
import { CicloFolhaService } from './ciclo-folha.service';
import { CicloFechadoError, CicloNaoFechadoError } from './ciclo-folha.errors';

const USUARIO = { sub: 'u1', nome: 'Gestor Silva' } as UsuarioAutenticado;

// "Agora" fixo: 10/07/2026 → ciclo atual (deslocamento 0) = 26/06–25/07 e
// anterior (−1) = 26/05–25/06. No escopo do módulo porque todos os describes
// deste arquivo dependem dele.
beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-07-10T12:00:00.000Z'));
});
afterAll(() => jest.useRealTimers());

/** Dia civil (00:00 UTC) a partir de "aaaa-mm-dd". */
const dia = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** Prisma falso em memória: um Map de ciclos indexado pela âncora `inicio`. */
function montar() {
  const ciclos = new Map<string, Record<string, unknown>>();
  const eventos: Record<string, unknown>[] = [];
  const prisma = {
    cicloFolha: {
      findUnique: jest.fn(
        ({ where: { inicio } }: { where: { inicio: Date } }) =>
          Promise.resolve(ciclos.get(inicio.toISOString()) ?? null),
      ),
      upsert: jest.fn(
        ({
          where: { inicio },
          create,
          update,
        }: {
          where: { inicio: Date };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const k = inicio.toISOString();
          const existente = ciclos.get(k);
          const novo = existente ? { ...existente, ...update } : { ...create };
          ciclos.set(k, novo);
          return Promise.resolve(novo);
        },
      ),
      update: jest.fn(
        ({
          where: { inicio },
          data,
        }: {
          where: { inicio: Date };
          data: Record<string, unknown>;
        }) => {
          const k = inicio.toISOString();
          const novo = { ...(ciclos.get(k) ?? {}), ...data };
          ciclos.set(k, novo);
          return Promise.resolve(novo);
        },
      ),
      // Suporta o `where: { inicio: { in: [...] }, status? }` usado pela
      // validação e pela consulta de um período (vários ciclos numa query).
      findMany: jest.fn(
        ({ where }: { where: { inicio: { in: Date[] }; status?: string } }) =>
          Promise.resolve(
            where.inicio.in
              .map((d) => ciclos.get(d.toISOString()))
              .filter(
                (c): c is Record<string, unknown> =>
                  !!c &&
                  (where.status === undefined || c.status === where.status),
              )
              .map((c) => ({
                inicio: new Date(c.inicio as Date),
                status: c.status,
              })),
          ),
      ),
    },
    cicloFolhaEvento: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        eventos.push(data);
        return Promise.resolve(data);
      }),
      findMany: jest.fn(({ where: { inicio } }: { where: { inicio: Date } }) =>
        Promise.resolve(
          eventos
            .filter(
              (e) => (e.inicio as Date).toISOString() === inicio.toISOString(),
            )
            .map((e, i) => ({
              ...e,
              id: String(i),
              em: e.em ?? new Date(),
            })),
        ),
      ),
    },
  };
  return {
    service: new CicloFolhaService(prisma as never),
    ciclos,
    eventos,
  };
}

/** `montar` + as tabelas de pendências (faltas e não-retornos). */
function montarComPendencias() {
  const prisma = {
    ausencia: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    incidenciaEscala: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const base = montar();
  // O serviço guarda o Prisma falso; acrescenta as duas tabelas a ele.
  Object.assign(
    (base.service as unknown as { prisma: Record<string, unknown> }).prisma,
    prisma,
  );
  return { ...base, prisma };
}

describe('CicloFolhaService', () => {
  it('um ciclo sem registro está ABERTO', async () => {
    const { service } = montar();
    const estado = await service.status(0);
    expect(estado.status).toBe('ABERTO');
    expect(estado.periodo.rotulo).toBe('26/06 – 25/07');
  });

  it('fechar registra quem fechou e grava um evento FECHADO', async () => {
    const { service, eventos } = montar();
    const estado = await service.fechar(0, USUARIO);
    expect(estado.status).toBe('FECHADO');
    expect(estado.fechadoPorNome).toBe('Gestor Silva');
    expect(eventos).toContainEqual(
      expect.objectContaining({ tipo: 'FECHADO', por: 'u1' }),
    );
  });

  it('fechar encerra as pendências do ciclo como não justificadas (sem débito)', async () => {
    const { service, prisma } = montarComPendencias();
    await service.fechar(0, USUARIO);

    const falta = prisma.ausencia.updateMany.mock.calls[0][0];
    expect(falta.where.statusJustificativa).toBe('PENDENTE');
    // Só o ciclo que está fechando (26/06–25/07).
    expect(falta.where.data).toEqual({
      gte: dia('2026-06-26'),
      lt: dia('2026-07-26'),
    });
    expect(falta.data.statusJustificativa).toBe('INJUSTIFICADA');
    expect(falta.data).not.toHaveProperty('debitoHoras');
    expect(prisma.incidenciaEscala.updateMany.mock.calls[0][0].where.tipo).toBe(
      'NAO_RETORNO_INTERVALO',
    );
  });

  it('uma falha ao encerrar as pendências não impede o fechamento', async () => {
    const { service, prisma } = montarComPendencias();
    prisma.ausencia.updateMany.mockRejectedValue(new Error('banco fora'));
    const estado = await service.fechar(0, USUARIO);
    expect(estado.status).toBe('FECHADO');
  });

  it('bloqueia (409) uma data de um ciclo fechado e libera as demais', async () => {
    const { service } = montar();
    await service.fechar(0, USUARIO); // fecha o ciclo atual (26/06–25/07)

    await expect(
      service.exigirCicloAberto(dia('2026-07-01')),
    ).rejects.toBeInstanceOf(CicloFechadoError);

    // Uma data de outro ciclo (não fechado) passa normalmente.
    await expect(
      service.exigirCicloAberto(dia('2026-05-15')),
    ).resolves.toBeUndefined();
  });

  it('a mensagem do bloqueio de um dia nomeia o ciclo', async () => {
    const { service } = montar();
    await service.fechar(0, USUARIO);

    await expect(service.exigirCicloAberto(dia('2026-07-01'))).rejects.toThrow(
      /26\/06 – 25\/07/,
    );
  });

  it('só reabre um ciclo fechado e registra a reabertura', async () => {
    const { service, eventos } = montar();

    await expect(service.reabrir(0, USUARIO)).rejects.toBeInstanceOf(
      CicloNaoFechadoError,
    );

    await service.fechar(0, USUARIO);
    const estado = await service.reabrir(0, USUARIO);

    expect(estado.status).toBe('ABERTO');
    expect(estado.reabertoPorNome).toBe('Gestor Silva');
    expect(eventos.some((e) => e.tipo === 'REABERTO')).toBe(true);
    // Após reabrir, a data volta a ser editável.
    await expect(
      service.exigirCicloAberto(dia('2026-07-01')),
    ).resolves.toBeUndefined();
  });
});

/**
 * Períodos que atravessam o corte 26→25. Antes, atestado e ausência a prazo
 * validavam só o PRIMEIRO dia do intervalo, então o resto do período podia cair
 * num ciclo já fechado sem nenhum controle.
 */
describe('CicloFolhaService — períodos (exigirCiclosAbertos)', () => {
  it('libera um período inteiro quando nenhum ciclo está fechado', async () => {
    const { service } = montar();
    await expect(
      service.exigirCiclosAbertos(dia('2026-07-20'), dia('2026-07-30')),
    ).resolves.toBeUndefined();
  });

  it('bloqueia quando o período TERMINA num ciclo fechado, mesmo começando num aberto', async () => {
    const { service } = montar();
    await service.fechar(0, USUARIO); // fecha 26/06–25/07

    // 20/06 (ciclo anterior, aberto) a 05/07 (ciclo atual, FECHADO).
    // Este é exatamente o caso que passava sem controle.
    await expect(
      service.exigirCiclosAbertos(dia('2026-06-20'), dia('2026-07-05')),
    ).rejects.toBeInstanceOf(CicloFechadoError);
  });

  it('bloqueia quando o período COMEÇA num ciclo fechado', async () => {
    const { service } = montar();
    await service.fechar(0, USUARIO);

    await expect(
      service.exigirCiclosAbertos(dia('2026-07-20'), dia('2026-08-05')),
    ).rejects.toBeInstanceOf(CicloFechadoError);
  });

  it('a mensagem do erro nomeia o ciclo fechado', async () => {
    const { service } = montar();
    await service.fechar(0, USUARIO);

    await expect(
      service.exigirCiclosAbertos(dia('2026-07-01'), dia('2026-07-03')),
    ).rejects.toThrow(/26\/06 – 25\/07/);
  });

  it('um período inválido (invertido) não bloqueia nada', async () => {
    const { service } = montar();
    await service.fechar(0, USUARIO);

    await expect(
      service.exigirCiclosAbertos(dia('2026-07-10'), dia('2026-07-01')),
    ).resolves.toBeUndefined();
  });
});

describe('CicloFolhaService — consultarIntervalo', () => {
  it('um período dentro de um ciclo não atravessa nada', async () => {
    const { service } = montar();
    const r = await service.consultarIntervalo(
      dia('2026-07-01'),
      dia('2026-07-05'),
    );
    expect(r.atravessaCiclos).toBe(false);
    expect(r.fechados).toEqual([]);
    expect(r.ciclos).toHaveLength(1);
    expect(r.ciclos[0]).toMatchObject({
      rotulo: '26/06 – 25/07',
      dias: 5,
      status: 'ABERTO',
    });
  });

  it('marca a travessia e reparte os dias entre os ciclos', async () => {
    const { service } = montar();
    const r = await service.consultarIntervalo(
      dia('2026-07-24'),
      dia('2026-07-28'),
    );
    expect(r.atravessaCiclos).toBe(true);
    expect(r.ciclos.map((c) => [c.rotulo, c.dias])).toEqual([
      ['26/06 – 25/07', 2],
      ['26/07 – 25/08', 3],
    ]);
  });

  it('reporta o estado real de cada ciclo', async () => {
    const { service } = montar();
    await service.fechar(0, USUARIO); // fecha só 26/06–25/07

    const r = await service.consultarIntervalo(
      dia('2026-07-24'),
      dia('2026-07-28'),
    );
    expect(r.ciclos.map((c) => c.status)).toEqual(['FECHADO', 'ABERTO']);
    expect(r.fechados).toEqual(['26/06 – 25/07']);
  });

  it('devolve vazio para um período invertido', async () => {
    const { service } = montar();
    const r = await service.consultarIntervalo(
      dia('2026-07-28'),
      dia('2026-07-24'),
    );
    expect(r.ciclos).toEqual([]);
    expect(r.atravessaCiclos).toBe(false);
    expect(r.fechados).toEqual([]);
  });
});
