import { OperadoresService } from './operadores.service';

/**
 * A "ausência a prazo" é sempre lançada escolhendo um Colaborador (a ficha),
 * então o `pessoaId` recebido já É a ficha. Cada dia gravado deve carregar o
 * vínculo `colaboradorId` (paridade com `registrarAusencia`), o que permite que
 * as buscas por ficha — em especial a detecção automática de falta de um FISCAL,
 * que conhece o `Colaborador.id` — encontrem esses dias e NÃO remarquem uma
 * falta automática duplicada por cima da a prazo.
 */
describe('OperadoresService.registrarAusenciaPeriodo — vínculo com a ficha', () => {
  interface Criada {
    pessoaId: string;
    colaboradorId?: string | null;
    aPrazo?: boolean;
    data: Date;
  }

  function criarServico() {
    const criadas: Criada[] = [];
    const prismaFake = {
      colaborador: {
        findUnique: () =>
          Promise.resolve({ nome: 'Fulano', folgaDiaSemana: 0 }),
      },
      ausencia: {
        findMany: () => Promise.resolve([]),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: ({ data }: { data: any }) => {
          criadas.push(data);
          return Promise.resolve({ id: `a${criadas.length}`, ...data });
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update: () => Promise.resolve({}),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: (fn: (tx: any) => any) => fn(prismaFake),
    };
    const service = new OperadoresService(
      prismaFake as never,
      undefined,
      undefined,
      undefined,
    );
    return { service, criadas };
  }

  it('grava colaboradorId (= pessoaId) e aPrazo em cada dia do período', async () => {
    const { service, criadas } = criarServico();
    await service.registrarAusenciaPeriodo(
      'col-1',
      new Date(Date.UTC(2026, 6, 20)),
      new Date(Date.UTC(2026, 6, 22)),
      { motivo: 'LICENCA' },
      { id: 'u1', nome: 'Gestor' },
    );
    expect(criadas).toHaveLength(3); // 20, 21, 22
    for (const c of criadas) {
      expect(c.pessoaId).toBe('col-1');
      expect(c.colaboradorId).toBe('col-1');
      expect(c.aPrazo).toBe(true);
    }
  });
});
