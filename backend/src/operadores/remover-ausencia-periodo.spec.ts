import { OperadoresService } from './operadores.service';
import { PeriodoAusenciaInvalidoError } from './operadores.errors';

/**
 * Anulação de uma ausência a prazo inteira (`removerAusenciaPeriodo`): remove
 * apenas os dias `aPrazo` do intervalo, casando as duas chaves (`pessoaId` e
 * `colaboradorId`), e preserva as faltas comuns/automáticas.
 */
describe('OperadoresService.removerAusenciaPeriodo', () => {
  interface AusenciaFake {
    id: string;
    pessoaId: string;
    colaboradorId: string | null;
    data: Date;
    aPrazo: boolean;
  }

  function criarServico(ausencias: AusenciaFake[]) {
    const prismaFake = {
      colaborador: {
        findUnique: () => Promise.resolve({ nome: 'Fulano' }),
      },
      ausencia: {
        deleteMany: ({
          where,
        }: {
          where: {
            aPrazo?: boolean;
            data?: { gte?: Date; lte?: Date };
            OR?: Array<{ pessoaId?: string; colaboradorId?: string }>;
          };
        }) => {
          const antes = ausencias.length;
          for (let i = ausencias.length - 1; i >= 0; i--) {
            const a = ausencias[i];
            if (where.aPrazo !== undefined && a.aPrazo !== where.aPrazo)
              continue;
            const gte = where.data?.gte;
            const lte = where.data?.lte;
            if (gte && a.data.getTime() < gte.getTime()) continue;
            if (lte && a.data.getTime() > lte.getTime()) continue;
            if (where.OR) {
              const casa = where.OR.some(
                (o) =>
                  (o.pessoaId !== undefined && o.pessoaId === a.pessoaId) ||
                  (o.colaboradorId !== undefined &&
                    o.colaboradorId === a.colaboradorId),
              );
              if (!casa) continue;
            }
            ausencias.splice(i, 1);
          }
          return Promise.resolve({ count: antes - ausencias.length });
        },
      },
    };
    const service = new OperadoresService(
      prismaFake as never,
      undefined,
      undefined,
      undefined,
    );
    return { service, ausencias };
  }

  it('remove só os dias aPrazo do intervalo e preserva o resto', async () => {
    const dia = (d: number) => new Date(Date.UTC(2026, 6, d));
    const { service, ausencias } = criarServico([
      {
        id: '1',
        pessoaId: 'col-1',
        colaboradorId: 'col-1',
        data: dia(20),
        aPrazo: true,
      },
      {
        id: '2',
        pessoaId: 'col-1',
        colaboradorId: 'col-1',
        data: dia(21),
        aPrazo: true,
      },
      // Falta comum no intervalo: NÃO deve ser removida.
      {
        id: '3',
        pessoaId: 'col-1',
        colaboradorId: 'col-1',
        data: dia(22),
        aPrazo: false,
      },
      // A prazo de OUTRA pessoa: NÃO deve ser removida.
      {
        id: '4',
        pessoaId: 'col-2',
        colaboradorId: 'col-2',
        data: dia(20),
        aPrazo: true,
      },
      // A prazo fora do intervalo: NÃO deve ser removida.
      {
        id: '5',
        pessoaId: 'col-1',
        colaboradorId: 'col-1',
        data: dia(28),
        aPrazo: true,
      },
    ]);

    const r = await service.removerAusenciaPeriodo('col-1', dia(20), dia(25));

    expect(r.removidas).toBe(2);
    expect(ausencias.map((a) => a.id).sort()).toEqual(['3', '4', '5']);
  });

  it('encontra a prazo LEGADA keyed por pessoaId (colaboradorId nulo)', async () => {
    const dia = (d: number) => new Date(Date.UTC(2026, 6, d));
    const { service, ausencias } = criarServico([
      {
        id: '1',
        pessoaId: 'col-1',
        colaboradorId: null,
        data: dia(20),
        aPrazo: true,
      },
    ]);
    const r = await service.removerAusenciaPeriodo('col-1', dia(20), dia(21));
    expect(r.removidas).toBe(1);
    expect(ausencias).toHaveLength(0);
  });

  it('rejeita período com a data final antes da inicial', async () => {
    const dia = (d: number) => new Date(Date.UTC(2026, 6, d));
    const { service } = criarServico([]);
    await expect(
      service.removerAusenciaPeriodo('col-1', dia(21), dia(20)),
    ).rejects.toBeInstanceOf(PeriodoAusenciaInvalidoError);
  });
});
