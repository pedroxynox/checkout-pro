import { FiscaisService } from './fiscais.service';
import { inicioDoDia } from './fiscais.domain';

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
});
