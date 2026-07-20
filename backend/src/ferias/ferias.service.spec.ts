import { FeriasService } from './ferias.service';
import {
  ColaboradorFeriasNaoEncontradoError,
  FeriasNaoEncontradaError,
  FeriasSobrepostaError,
  PeriodoFeriasInvalidoError,
} from './ferias.errors';

/**
 * Testes do `FeriasService` com um Prisma falso em memória. Cobrem a validação
 * do período, a rejeição de sobreposição, o cálculo de "quem está de férias no
 * dia" (fonte da exclusão da escala) e a remoção.
 */
describe('FeriasService', () => {
  interface FeriasFake {
    id: string;
    colaboradorId: string;
    inicio: Date;
    fim: Date;
    observacao: string | null;
    registradaPorId: string | null;
    registradaPorNome: string | null;
    criadaEm: Date;
  }

  function criarServico(opts: { colaboradorExiste?: boolean } = {}) {
    const existe = opts.colaboradorExiste ?? true;
    const ferias: FeriasFake[] = [];
    let seq = 0;
    const prismaFake = {
      colaborador: {
        findUnique: () =>
          Promise.resolve(existe ? { nome: 'Fulano', matricula: 'M1' } : null),
        findMany: () =>
          Promise.resolve([{ id: 'col-1', nome: 'Fulano', matricula: 'M1' }]),
      },
      feriasColaborador: {
        findMany: ({
          where,
        }: {
          where?: {
            colaboradorId?: string;
            inicio?: { lte?: Date };
            fim?: { gte?: Date };
          };
        }) => {
          let lista = [...ferias];
          if (where?.colaboradorId)
            lista = lista.filter(
              (f) => f.colaboradorId === where.colaboradorId,
            );
          if (where?.inicio?.lte)
            lista = lista.filter(
              (f) => f.inicio.getTime() <= where.inicio!.lte!.getTime(),
            );
          if (where?.fim?.gte)
            lista = lista.filter(
              (f) => f.fim.getTime() >= where.fim!.gte!.getTime(),
            );
          return Promise.resolve(lista);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: ({ data }: { data: any }) => {
          const nova: FeriasFake = {
            id: `f${++seq}`,
            colaboradorId: data.colaboradorId,
            inicio: data.inicio,
            fim: data.fim,
            observacao: data.observacao ?? null,
            registradaPorId: data.registradaPorId ?? null,
            registradaPorNome: data.registradaPorNome ?? null,
            criadaEm: new Date(),
          };
          ferias.push(nova);
          return Promise.resolve(nova);
        },
        findUnique: ({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve(ferias.find((f) => f.id === id) ?? null),
        delete: ({ where: { id } }: { where: { id: string } }) => {
          const i = ferias.findIndex((f) => f.id === id);
          if (i >= 0) ferias.splice(i, 1);
          return Promise.resolve({});
        },
      },
    };
    const service = new FeriasService(prismaFake as never, undefined);
    return { service, ferias };
  }

  const dia = (d: number) => new Date(Date.UTC(2026, 6, d));

  it('registra um período de férias (não toca em ativo)', async () => {
    const { service, ferias } = criarServico();
    const criada = await service.registrarFerias('col-1', dia(10), dia(20), {
      observacao: 'férias 10 dias',
    });
    expect(criada.colaboradorId).toBe('col-1');
    expect(ferias).toHaveLength(1);
  });

  it('rejeita colaborador inexistente', async () => {
    const { service } = criarServico({ colaboradorExiste: false });
    await expect(
      service.registrarFerias('x', dia(10), dia(20)),
    ).rejects.toBeInstanceOf(ColaboradorFeriasNaoEncontradoError);
  });

  it('rejeita período invertido', async () => {
    const { service } = criarServico();
    await expect(
      service.registrarFerias('col-1', dia(20), dia(10)),
    ).rejects.toBeInstanceOf(PeriodoFeriasInvalidoError);
  });

  it('rejeita férias que se sobrepõem às já cadastradas', async () => {
    const { service } = criarServico();
    await service.registrarFerias('col-1', dia(10), dia(20));
    await expect(
      service.registrarFerias('col-1', dia(15), dia(25)),
    ).rejects.toBeInstanceOf(FeriasSobrepostaError);
  });

  it('colaboradoresDeFeriasNoDia devolve quem tem período vigente no dia', async () => {
    const { service } = criarServico();
    await service.registrarFerias('col-1', dia(10), dia(20));
    const noMeio = await service.colaboradoresDeFeriasNoDia(dia(15));
    expect(noMeio.has('col-1')).toBe(true);
    const fora = await service.colaboradoresDeFeriasNoDia(dia(25));
    expect(fora.has('col-1')).toBe(false);
  });

  it('listarFerias marca vigente conforme a referência', async () => {
    const { service } = criarServico();
    await service.registrarFerias('col-1', dia(10), dia(20));
    const vigentes = await service.listarFerias({ referencia: dia(15) });
    expect(vigentes[0].vigente).toBe(true);
    const depois = await service.listarFerias({ referencia: dia(30) });
    expect(depois[0].vigente).toBe(false);
  });

  it('remover inexistente lança 404', async () => {
    const { service } = criarServico();
    await expect(service.removerFerias('nope')).rejects.toBeInstanceOf(
      FeriasNaoEncontradaError,
    );
  });
});
