import { ColaboradoresService } from './colaboradores.service';
import {
  ColaboradorNaoEncontradoError,
  MatriculaColaboradorDuplicadaError,
} from './colaboradores.errors';

/**
 * Testes de `adicionarIdentificador`: associar um código solto (matrícula do
 * arquivo) a um colaborador, base da "fila de não reconhecidos".
 */
describe('ColaboradoresService.adicionarIdentificador', () => {
  interface IdFake {
    colaboradorId: string;
    tipo: string;
    valor: string;
  }

  function criarServico(opts: {
    colaboradores: string[];
    identificadores: IdFake[];
  }): { service: ColaboradoresService; criados: IdFake[] } {
    const criados: IdFake[] = [];
    const prismaFake = {
      colaborador: {
        findUnique: ({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve(opts.colaboradores.includes(id) ? { id } : null),
      },
      colaboradorIdentificador: {
        findUnique: ({
          where: { tipo_valor },
        }: {
          where: { tipo_valor: { tipo: string; valor: string } };
        }) =>
          Promise.resolve(
            opts.identificadores.find(
              (i) => i.tipo === tipo_valor.tipo && i.valor === tipo_valor.valor,
            ) ?? null,
          ),
        create: ({ data }: { data: IdFake }) => {
          criados.push(data);
          return Promise.resolve(data);
        },
      },
    };
    const service = new ColaboradoresService(prismaFake as never, {} as never);
    return { service, criados };
  }

  it('cria um identificador MATRICULA quando o código está livre', async () => {
    const { service, criados } = criarServico({
      colaboradores: ['c1'],
      identificadores: [],
    });
    await service.adicionarIdentificador('c1', '999');
    expect(criados).toEqual([
      { colaboradorId: 'c1', tipo: 'MATRICULA', valor: '999' },
    ]);
  });

  it('é idempotente quando o código já é do próprio colaborador', async () => {
    const { service, criados } = criarServico({
      colaboradores: ['c1'],
      identificadores: [
        { colaboradorId: 'c1', tipo: 'MATRICULA', valor: '999' },
      ],
    });
    await service.adicionarIdentificador('c1', '999');
    expect(criados).toEqual([]); // não cria de novo
  });

  it('rejeita quando o código pertence a outro colaborador', async () => {
    const { service } = criarServico({
      colaboradores: ['c1', 'c2'],
      identificadores: [
        { colaboradorId: 'c2', tipo: 'MATRICULA', valor: '999' },
      ],
    });
    await expect(
      service.adicionarIdentificador('c1', '999'),
    ).rejects.toBeInstanceOf(MatriculaColaboradorDuplicadaError);
  });

  it('rejeita quando o colaborador não existe', async () => {
    const { service } = criarServico({
      colaboradores: [],
      identificadores: [],
    });
    await expect(
      service.adicionarIdentificador('inexistente', '999'),
    ).rejects.toBeInstanceOf(ColaboradorNaoEncontradoError);
  });
});
