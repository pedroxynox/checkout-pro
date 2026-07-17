import { UsuarioAutenticado } from '../common/decorators/usuario-atual.decorator';
import { CicloFolhaService } from './ciclo-folha.service';
import { CicloFechadoError, CicloNaoFechadoError } from './ciclo-folha.errors';

const USUARIO = { sub: 'u1', nome: 'Gestor Silva' } as UsuarioAutenticado;

describe('CicloFolhaService', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-10T12:00:00.000Z'));
  });
  afterAll(() => jest.useRealTimers());

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
            const novo = existente
              ? { ...existente, ...update }
              : { ...create };
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
      },
      cicloFolhaEvento: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          eventos.push(data);
          return Promise.resolve(data);
        }),
        findMany: jest.fn(
          ({ where: { inicio } }: { where: { inicio: Date } }) =>
            Promise.resolve(
              eventos
                .filter(
                  (e) =>
                    (e.inicio as Date).toISOString() === inicio.toISOString(),
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

  it('bloqueia (409) uma data de um ciclo fechado e libera as demais', async () => {
    const { service } = montar();
    await service.fechar(0, USUARIO); // fecha o ciclo atual (26/06–25/07)

    await expect(
      service.exigirCicloAberto(new Date('2026-07-01T00:00:00.000Z')),
    ).rejects.toBeInstanceOf(CicloFechadoError);

    // Uma data de outro ciclo (não fechado) passa normalmente.
    await expect(
      service.exigirCicloAberto(new Date('2026-05-15T00:00:00.000Z')),
    ).resolves.toBeUndefined();
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
      service.exigirCicloAberto(new Date('2026-07-01T00:00:00.000Z')),
    ).resolves.toBeUndefined();
  });
});
