import { AtestadosService } from './atestados.service';

/**
 * Atestado × falta que já existia no dia. Duas coisas que estavam erradas:
 *
 *  1. **Fiscal ficava com falta E atestado no mesmo dia.** A conversão buscava as
 *     faltas só por `pessoaId = colaboradorId`, mas a falta de um fiscal é
 *     gravada com `pessoaId = Fiscal.id` (a identidade com que ele bate ponto) e
 *     a ficha em `colaboradorId`. Não encontrando, o atestado CRIAVA uma segunda
 *     linha — e a card de falta sobrevivia na tela.
 *
 *  2. **Remover o atestado apagava a falta anterior.** Os dias voltavam a ficar
 *     limpos, como se nada tivesse acontecido: a ocorrência que o gestor ainda
 *     precisava tratar desaparecia junto com o atestado.
 */
const dia = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

interface Opcoes {
  /** Faltas já existentes que a busca deve encontrar. */
  existentes?: { id: string; data: Date }[];
  /** Captura o `where` usado para buscar as faltas do período. */
  capturarBusca?: (where: unknown) => void;
}

function criarServico({ existentes = [], capturarBusca }: Opcoes = {}) {
  const criadas: unknown[] = [];
  const atualizadas: { where: unknown; data: unknown }[] = [];
  const prismaFake = {
    atestado: {
      findFirst: () => Promise.resolve(null),
      findMany: () => Promise.resolve([]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: (args: any) =>
        Promise.resolve({ id: 'at-1', ...(args?.data ?? {}) }),
    },
    colaborador: { findUnique: () => Promise.resolve({ nome: 'Fulano' }) },
    ausencia: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: (args: any) => {
        capturarBusca?.(args?.where);
        return Promise.resolve(existentes);
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: (args: any) => {
        criadas.push(args?.data);
        return Promise.resolve({});
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: (args: any) => {
        atualizadas.push({ where: args?.where, data: args?.data });
        return Promise.resolve({});
      },
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
  return { service, criadas, atualizadas };
}

describe('AtestadosService.lancar — converte a falta existente, não duplica', () => {
  it('busca as faltas do período pelas DUAS chaves (pessoaId e colaboradorId)', async () => {
    let where: unknown;
    const { service } = criarServico({ capturarBusca: (w) => (where = w) });

    await service.lancar({
      colaboradorId: 'col-1',
      inicio: dia('2026-07-10'),
      fim: dia('2026-07-10'),
      cid: 'M54.5',
    });

    // É o que faz a falta automática de um FISCAL ser encontrada e convertida.
    expect(where).toMatchObject({
      OR: [{ pessoaId: 'col-1' }, { colaboradorId: 'col-1' }],
    });
  });

  it('CONVERTE o dia que já era falta (não cria uma segunda linha)', async () => {
    const { service, criadas, atualizadas } = criarServico({
      existentes: [{ id: 'falta-1', data: dia('2026-07-10') }],
    });

    await service.lancar({
      colaboradorId: 'col-1',
      inicio: dia('2026-07-10'),
      fim: dia('2026-07-10'),
      cid: 'M54.5',
    });

    expect(criadas).toHaveLength(0);
    expect(atualizadas).toHaveLength(1);
    expect(atualizadas[0].where).toEqual({ id: 'falta-1' });
  });

  it('marca `faltaAnterior` ao converter, para poder desfazer depois', async () => {
    const { service, atualizadas } = criarServico({
      existentes: [{ id: 'falta-1', data: dia('2026-07-10') }],
    });

    await service.lancar({
      colaboradorId: 'col-1',
      inicio: dia('2026-07-10'),
      fim: dia('2026-07-10'),
      cid: 'M54.5',
    });

    expect(atualizadas[0].data).toMatchObject({
      faltaAnterior: true,
      motivoJustificativa: 'ATESTADO_MEDICO',
      aPrazo: true,
    });
  });

  it('os dias SEM falta anterior seguem sendo criados (sem a marca)', async () => {
    const { service, criadas, atualizadas } = criarServico({
      // Só o dia 10 já era falta; o 11 é novo.
      existentes: [{ id: 'falta-1', data: dia('2026-07-10') }],
    });

    await service.lancar({
      colaboradorId: 'col-1',
      inicio: dia('2026-07-10'),
      fim: dia('2026-07-11'),
      cid: 'M54.5',
    });

    expect(atualizadas).toHaveLength(1);
    expect(criadas).toHaveLength(1);
    expect(criadas[0]).not.toMatchObject({ faltaAnterior: true });
  });
});

describe('AtestadosService.remover — devolve a falta que existia antes', () => {
  function criarParaRemover() {
    const operacoes: { tipo: string; args: unknown }[] = [];
    const prismaFake = {
      atestado: {
        findUnique: () =>
          Promise.resolve({ id: 'at-1', inicio: dia('2026-07-10') }),
        delete: (args: unknown) => {
          operacoes.push({ tipo: 'atestado.delete', args });
          return Promise.resolve({});
        },
      },
      ausencia: {
        updateMany: (args: unknown) => {
          operacoes.push({ tipo: 'ausencia.updateMany', args });
          return Promise.resolve({ count: 1 });
        },
        deleteMany: (args: unknown) => {
          operacoes.push({ tipo: 'ausencia.deleteMany', args });
          return Promise.resolve({ count: 1 });
        },
      },
      // O serviço passa um ARRAY de operações ao $transaction.
      $transaction: (ops: unknown[]) => Promise.all(ops),
    };
    const service = new AtestadosService(
      prismaFake as never,
      undefined,
      undefined,
      undefined,
    );
    return { service, operacoes };
  }

  it('reverte a falta anterior ANTES de apagar os dias criados', async () => {
    const { service, operacoes } = criarParaRemover();

    await service.remover('at-1');

    // A ordem importa: se o delete viesse primeiro, não haveria o que reverter.
    expect(operacoes.map((o) => o.tipo)).toEqual([
      'ausencia.updateMany',
      'ausencia.deleteMany',
      'atestado.delete',
    ]);
  });

  it('a reversão volta o dia a ser uma falta PENDENTE, sem vínculo ao atestado', async () => {
    const { service, operacoes } = criarParaRemover();

    await service.remover('at-1');

    const reversao = operacoes.find((o) => o.tipo === 'ausencia.updateMany');
    expect(reversao?.args).toMatchObject({
      where: { atestadoId: 'at-1', faltaAnterior: true },
      data: {
        atestadoId: null,
        cid: null,
        aPrazo: false,
        faltaAnterior: false,
        statusJustificativa: 'PENDENTE',
        motivoJustificativa: null,
      },
    });
  });

  it('os dias criados pelo atestado são apagados', async () => {
    const { service, operacoes } = criarParaRemover();

    await service.remover('at-1');

    const remocao = operacoes.find((o) => o.tipo === 'ausencia.deleteMany');
    expect(remocao?.args).toMatchObject({ where: { atestadoId: 'at-1' } });
  });
});
