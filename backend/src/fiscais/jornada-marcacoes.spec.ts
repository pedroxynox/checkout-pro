import { FiscaisService } from './fiscais.service';
import { inicioDoDia } from './fiscais.domain';
import { agoraNaBrasilia } from '../common/datas';

/**
 * A jornada do dia expõe as MARCAÇÕES (batidas) de cada pessoa — base da card
 * informativa "Marcações do dia" no Relógio Ponto. As 4 batidas de um dia
 * completo saem classificadas em ordem: entrada, saída, volta e encerramento.
 */
describe('FiscaisService.jornadaDoDia — marcações do dia', () => {
  function criarPrisma(batidasOperador: { id: string; hora: Date }[]) {
    return {
      fiscal: { findMany: () => Promise.resolve([]) },
      usuario: { findMany: () => Promise.resolve([]) },
      registroPontoFiscal: { findMany: () => Promise.resolve([]) },
      colaborador: {
        findMany: ({ where }: { where?: { funcao?: { in?: string[] } } }) =>
          // where.funcao.in => consulta de operadores; senão, mapaColaboradores.
          Promise.resolve(
            where?.funcao?.in
              ? [{ id: 'op1', nome: 'Karen Mendoza', funcao: 'OPERADOR' }]
              : [],
          ),
      },
      batidaPonto: {
        findMany: ({ where }: { where: { tipoPessoa: string } }) =>
          Promise.resolve(
            where.tipoPessoa === 'OPERADOR'
              ? batidasOperador.map((b) => ({ ...b, pessoaId: 'op1' }))
              : [],
          ),
      },
    };
  }

  it('devolve as 4 marcações classificadas em ordem', async () => {
    const dia = inicioDoDia(new Date());
    const h = (horas: number) =>
      new Date(dia.getTime() + horas * 60 * 60 * 1000);
    const batidas = [
      { id: 'b1', hora: h(8) },
      { id: 'b2', hora: h(12) },
      { id: 'b3', hora: h(13) },
      { id: 'b4', hora: h(17) },
    ];
    const service = new FiscaisService(criarPrisma(batidas) as never);

    const jornada = await service.jornadaDoDia(new Date());
    const karen = jornada.find((j) => j.pessoaId === 'op1');
    expect(karen).toBeDefined();
    expect(karen!.marcacoes.map((m) => m.tipo)).toEqual([
      'ENTRADA',
      'SAIDA_INTERVALO',
      'RETORNO_INTERVALO',
      'ENCERRAMENTO',
    ]);
    // Cada marcação leva a hora (ISO) correspondente à batida.
    expect(karen!.marcacoes).toHaveLength(4);
    expect(karen!.marcacoes[0].hora).toBe(batidas[0].hora.toISOString());
  });

  /**
   * Regressão (bug do fim da noite): entre 21h e 23h59 de Brasília o relógio
   * UTC do servidor já virou o dia seguinte. As batidas são gravadas no dia
   * civil de Brasília, então a jornada (sem `data`) precisa ler ESSE dia — e
   * não o dia UTC — senão as marcações do dia somem da tela da equipe.
   *
   * Aqui o mock filtra por `where.data` (como o Prisma real faz), o que expõe
   * o bug: com o dia errado, `findMany` devolveria vazio.
   */
  it('lista as marcações do dia à noite (Brasília), mesmo com o UTC já no dia seguinte', () => {
    jest.useFakeTimers();
    try {
      // 01:00 UTC de 18/07 == 22:00 de 17/07 em Brasília (UTC-3).
      jest.setSystemTime(new Date('2026-07-18T01:00:00.000Z'));
      const diaBrasilia = inicioDoDia(agoraNaBrasilia());
      // Sanidade: o dia de Brasília (17) difere do dia UTC do servidor (18).
      expect(diaBrasilia.getTime()).toBe(
        new Date('2026-07-17T00:00:00.000Z').getTime(),
      );

      const h = (horas: number) =>
        new Date(diaBrasilia.getTime() + horas * 60 * 60 * 1000);
      const todasBatidas = [
        { id: 'b1', pessoaId: 'op1', hora: h(8), data: diaBrasilia },
        { id: 'b2', pessoaId: 'op1', hora: h(12), data: diaBrasilia },
      ];

      const prisma = {
        fiscal: { findMany: () => Promise.resolve([]) },
        usuario: { findMany: () => Promise.resolve([]) },
        registroPontoFiscal: { findMany: () => Promise.resolve([]) },
        colaborador: {
          findMany: ({ where }: { where?: { funcao?: { in?: string[] } } }) =>
            Promise.resolve(
              where?.funcao?.in
                ? [{ id: 'op1', nome: 'Karen Mendoza', funcao: 'OPERADOR' }]
                : [],
            ),
        },
        batidaPonto: {
          // Filtra por tipoPessoa E data (igual ao Prisma real). Com o dia
          // errado, nenhuma batida casaria e a jornada viria vazia.
          findMany: ({
            where,
          }: {
            where: { tipoPessoa: string; data: Date };
          }) =>
            Promise.resolve(
              where.tipoPessoa === 'OPERADOR'
                ? todasBatidas.filter(
                    (b) => b.data.getTime() === where.data.getTime(),
                  )
                : [],
            ),
        },
      };
      const service = new FiscaisService(prisma as never);

      // Sem `data` — usa o default "hoje" (deve ser o dia de Brasília).
      return service.jornadaDoDia().then((jornada) => {
        const karen = jornada.find((j) => j.pessoaId === 'op1');
        expect(karen).toBeDefined();
        expect(karen!.marcacoes.length).toBeGreaterThan(0);
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
