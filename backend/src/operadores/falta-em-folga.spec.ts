import { OperadoresService } from './operadores.service';
import { FaltaEmDiaDeFolgaError } from './operadores.errors';
import { FolgaService } from '../escala-domingo/folga.service';

/**
 * Falta NÃO se marca em dia de folga.
 *
 * Falta é a ausência de quem era **esperado**; em dia de descanso não há o que
 * faltar. Antes o sistema aceitava, e a detecção automática chegou a lançar falta
 * no dia de folga de um colaborador porque as duas fontes de folga (ficha e
 * escala semanal) discordavam.
 *
 * O último teste é o contrapeso: **ausência a prazo e atestado continuam
 * cobrindo os dias de folga**, de propósito, por outro caminho. A guarda não
 * pode vazar para lá.
 */
describe('OperadoresService — falta em dia de folga', () => {
  const TERCA = new Date(Date.UTC(2026, 6, 21)); // folga na ficha
  const QUARTA = new Date(Date.UTC(2026, 6, 22)); // dia de trabalho

  interface AusenciaFake {
    id: string;
    pessoaId: string;
    data: Date;
    aPrazo?: boolean;
  }

  function criarServico(): {
    service: OperadoresService;
    ausencias: AusenciaFake[];
  } {
    const ausencias: AusenciaFake[] = [];
    let seq = 0;

    const prismaFake = {
      ausencia: {
        findUnique: () => Promise.resolve(null),
        findMany: () => Promise.resolve(ausencias),
        create: ({
          data,
        }: {
          data: { pessoaId: string; data: Date; aPrazo?: boolean };
        }) => {
          const nova = {
            id: `au${++seq}`,
            pessoaId: data.pessoaId,
            data: data.data,
            aPrazo: data.aPrazo ?? false,
          };
          ausencias.push(nova);
          return Promise.resolve(nova);
        },
        update: () => Promise.resolve({}),
      },
      colaborador: {
        // Ficha: folga na terça (diaSemana 2).
        findMany: () =>
          Promise.resolve([
            { id: 'col-1', folgaDiaSemana: 2, grupoDomingo: null },
          ]),
        findUnique: () => Promise.resolve({ nome: 'Erick', folgaDiaSemana: 2 }),
      },
      escalaEntry: { findMany: () => Promise.resolve([]) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: (fn: (tx: any) => any) => fn(prismaFake),
    };

    const folga = new FolgaService(prismaFake as never, undefined);

    // Ordem do construtor: prisma, notificacoes, validacaoData, cicloFolha, folga.
    const service = new OperadoresService(
      prismaFake as never,
      undefined,
      undefined,
      undefined,
      folga,
    );
    return { service, ausencias };
  }

  it('recusa marcar falta no dia de folga', async () => {
    const { service, ausencias } = criarServico();

    await expect(
      service.registrarAusencia('col-1', TERCA),
    ).rejects.toBeInstanceOf(FaltaEmDiaDeFolgaError);
    expect(ausencias).toHaveLength(0);
  });

  it('marca falta normalmente num dia de trabalho', async () => {
    const { service, ausencias } = criarServico();

    await service.registrarAusencia('col-1', QUARTA);

    expect(ausencias).toHaveLength(1);
    expect(ausencias[0].data.getTime()).toBe(QUARTA.getTime());
  });

  it('ausência a prazo SEGUE cobrindo o dia de folga', async () => {
    // Contrapeso deliberado: um período de licença/atestado cobre todos os dias
    // corridos, inclusive a folga. A guarda de falta não pode vazar para cá.
    const { service, ausencias } = criarServico();

    await service.registrarAusenciaPeriodo('col-1', TERCA, TERCA, {
      motivo: 'LICENCA',
    });

    expect(ausencias).toHaveLength(1);
    expect(ausencias[0].aPrazo).toBe(true);
  });
});
