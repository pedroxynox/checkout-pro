import { FiscaisService } from './fiscais.service';

/**
 * Férias (inativação não rígida) na fonte única da escala: `escaladosDoDia` NÃO
 * inclui quem está de férias no dia. Como o cron de detecção automática de falta
 * e a "equipe do dia" partem daqui, excluir aqui garante que a pessoa de férias
 * suma da escala e não vire falta automática.
 */
describe('FiscaisService.escaladosDoDia — exclui quem está de férias', () => {
  const SEGUNDA = new Date(Date.UTC(2026, 6, 20)); // 2026-07-20 é segunda-feira

  function criarServico(feriasSet: Set<string>) {
    const prismaFake = {
      colaborador: {
        findMany: () =>
          Promise.resolve([
            {
              id: 'col-1',
              nome: 'Ana',
              funcao: 'OPERADOR',
              folgaDiaSemana: 0, // folga aos domingos → segunda trabalha
              grupoDomingo: null,
              entradaSemana: '08:00',
              entradaFds: '09:00',
              entradaDom: null,
            },
            {
              id: 'col-2',
              nome: 'Bruno',
              funcao: 'OPERADOR',
              folgaDiaSemana: 0,
              grupoDomingo: null,
              entradaSemana: '08:00',
              entradaFds: '09:00',
              entradaDom: null,
            },
          ]),
      },
    };
    const feriasFake = {
      colaboradoresDeFeriasNoDia: () => Promise.resolve(feriasSet),
    };
    // Ordem do construtor: prisma, eventos, notificacoes, validacaoData,
    // feriados, cicloFolha, tiposContrato, escala, escalaDomingo, ferias.
    return new FiscaisService(
      prismaFake as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      feriasFake as never,
    );
  }

  it('inclui os dois quando ninguém está de férias', async () => {
    const service = criarServico(new Set());
    const escalados = await service.escaladosDoDia(SEGUNDA);
    expect(escalados.map((e) => e.pessoaId).sort()).toEqual(['col-1', 'col-2']);
  });

  it('exclui o colaborador de férias no dia', async () => {
    const service = criarServico(new Set(['col-2']));
    const escalados = await service.escaladosDoDia(SEGUNDA);
    expect(escalados.map((e) => e.pessoaId)).toEqual(['col-1']);
  });
});
