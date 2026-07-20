import { AtestadosService } from './atestados.service';
import {
  AtestadoSobrepostoError,
  PeriodoAtestadoInvalidoError,
} from './atestados.errors';

/**
 * Guard de sobreposição do `lancar`: um dia só pode pertencer a UM atestado, e
 * validação do período. Usa um Prisma falso em memória.
 */
describe('AtestadosService.lancar', () => {
  const dia = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

  function criarServico(opts: { temSobreposto?: boolean } = {}) {
    const criadasAusencias: unknown[] = [];
    const prismaFake = {
      atestado: {
        findFirst: () =>
          Promise.resolve(opts.temSobreposto ? { id: 'a-existente' } : null),
        findMany: () => Promise.resolve([]),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: (args: any) =>
          Promise.resolve({ id: 'a-novo', ...(args?.data ?? {}) }),
      },
      colaborador: {
        findUnique: () => Promise.resolve({ nome: 'Fulano' }),
      },
      ausencia: {
        findMany: () => Promise.resolve([]),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: (args: any) => {
          criadasAusencias.push(args?.data);
          return Promise.resolve({});
        },
        update: () => Promise.resolve({}),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: (fn: (tx: any) => any) => fn(prismaFake),
    };
    const service = new AtestadosService(
      prismaFake as never,
      undefined,
      undefined,
      undefined,
    );
    return { service, criadasAusencias };
  }

  it('rejeita quando há um atestado sobreposto do colaborador', async () => {
    const { service } = criarServico({ temSobreposto: true });
    await expect(
      service.lancar({
        colaboradorId: 'c1',
        inicio: dia('2026-07-10'),
        fim: dia('2026-07-15'),
        cid: 'M54.5',
      }),
    ).rejects.toBeInstanceOf(AtestadoSobrepostoError);
  });

  it('lança normalmente quando não há sobreposição (cria uma falta por dia)', async () => {
    const { service, criadasAusencias } = criarServico({
      temSobreposto: false,
    });
    const r = await service.lancar({
      colaboradorId: 'c1',
      inicio: dia('2026-07-10'),
      fim: dia('2026-07-12'),
      cid: 'M54.5',
    });
    expect(r.atestadoId).toBe('a-novo');
    expect(r.dias).toBe(3);
    expect(criadasAusencias).toHaveLength(3); // 10, 11, 12
  });

  it('rejeita período com fim antes do início', async () => {
    const { service } = criarServico();
    await expect(
      service.lancar({
        colaboradorId: 'c1',
        inicio: dia('2026-07-15'),
        fim: dia('2026-07-10'),
        cid: 'M54.5',
      }),
    ).rejects.toBeInstanceOf(PeriodoAtestadoInvalidoError);
  });
});
