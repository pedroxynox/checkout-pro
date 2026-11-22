import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TiposContratoService } from './tipos-contrato.service';
import { CriarTipoContratoDto } from './dto/tipos-contrato.dto';

/** DTO 6x1 válido para reutilizar nos testes. */
function dto6x1(): CriarTipoContratoDto {
  return {
    nome: '6x1 - 2x1',
    cargaBaseMinPorDia: [440, 420, 420, 420, 420, 480, 480],
    diasComAdicional100: [0],
    maxTrabalhoSemIntervaloMin: 290,
    intervaloMinimoMin: 60,
    intervaloMaximoMin: 180,
    limiteExtrasMin: 110,
    riscoTac1h30Min: 90,
    riscoTac1h40Min: 100,
  };
}

/** Prisma em memória para `tipoContratoJornada`. */
function montar() {
  const store: Record<string, unknown>[] = [];
  let seq = 0;
  const prisma = {
    tipoContratoJornada: {
      findMany: jest.fn(({ where }: { where?: { ativo?: boolean } } = {}) =>
        Promise.resolve(
          store.filter((r) =>
            where?.ativo === undefined ? true : r.ativo === where.ativo,
          ),
        ),
      ),
      findUnique: jest.fn(
        ({ where }: { where: { id?: string; nome?: string } }) =>
          Promise.resolve(
            store.find(
              (r) =>
                (where.id !== undefined && r.id === where.id) ||
                (where.nome !== undefined && r.nome === where.nome),
            ) ?? null,
          ),
      ),
      findFirst: jest.fn(({ where }: { where: { padrao?: boolean } }) =>
        Promise.resolve(store.find((r) => r.padrao === where.padrao) ?? null),
      ),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const novo = { id: `id${++seq}`, ...data };
        store.push(novo);
        return Promise.resolve(novo);
      }),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const r = store.find((x) => x.id === where.id);
          Object.assign(r as object, data);
          return Promise.resolve(r);
        },
      ),
      delete: jest.fn(({ where }: { where: { id: string } }) => {
        const i = store.findIndex((x) => x.id === where.id);
        const [removido] = store.splice(i, 1);
        return Promise.resolve(removido);
      }),
    },
    colaborador: {
      // Sobrescrito nos testes que precisam simular "em uso".
      count: jest.fn(() => Promise.resolve(0)),
    },
    jornadaVigencia: {
      // Idem, para o "em uso" pelo histórico da jornada (spec jornada-5x2).
      count: jest.fn(() => Promise.resolve(0)),
      // Vigência do dia em `regrasDoColaborador`; por padrão, nenhuma.
      findFirst: jest.fn(
        (): Promise<{ tipoContratoJornadaId: string } | null> =>
          Promise.resolve(null),
      ),
      // Todas as vigências da pessoa em `resolvedorDeRegras`; por padrão, nenhuma.
      findMany: jest.fn(
        (): Promise<{ vigenteDesde: Date; tipoContratoJornadaId: string }[]> =>
          Promise.resolve([]),
      ),
    },
  };
  const service = new TiposContratoService(prisma as unknown as PrismaService);
  return { service, store, prisma };
}

describe('TiposContratoService', () => {
  it('cria um contrato novo (nunca como padrão)', async () => {
    const { service } = montar();
    const criado = await service.criar({ ...dto6x1(), nome: '5x2 6h' });
    expect(criado.nome).toBe('5x2 6h');
    expect(criado.padrao).toBe(false);
    expect(criado.ativo).toBe(true);
  });

  it('recusa nome duplicado', async () => {
    const { service } = montar();
    await service.criar({ ...dto6x1(), nome: 'Turno A' });
    await expect(
      service.criar({ ...dto6x1(), nome: 'Turno A' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('recusa limites incoerentes (min ≥ max)', async () => {
    const { service } = montar();
    await expect(
      service.criar({
        ...dto6x1(),
        nome: 'Ruim',
        intervaloMinimoMin: 180,
        intervaloMaximoMin: 60,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa escalada de risco/limite fora de ordem', async () => {
    const { service } = montar();
    await expect(
      service.criar({
        ...dto6x1(),
        nome: 'Ruim2',
        riscoTac1h30Min: 100,
        riscoTac1h40Min: 90, // 1h30 > 1h40
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('não desativa o contrato padrão', async () => {
    const { service, store } = montar();
    store.push({ id: 'p', nome: '6x1', ativo: true, padrao: true });
    await expect(service.definirAtivo('p', false)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('não remove o contrato padrão', async () => {
    const { service, store } = montar();
    store.push({ id: 'p', nome: '6x1', ativo: true, padrao: true });
    await expect(service.remover('p')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('não remove um contrato EM USO por colaboradores', async () => {
    const { service, store, prisma } = montar();
    store.push({ id: 'c', nome: '5x2', ativo: true, padrao: false });
    (prisma.colaborador.count as jest.Mock).mockResolvedValueOnce(3);
    await expect(service.remover('c')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('não remove um contrato que está no histórico de jornada (vigência)', async () => {
    const { service, store, prisma } = montar();
    store.push({ id: 'v', nome: '6x1 antigo', ativo: false, padrao: false });
    (prisma.jornadaVigencia.count as jest.Mock).mockResolvedValueOnce(2);
    await expect(service.remover('v')).rejects.toThrow(/histórico de jornada/);
    expect(prisma.tipoContratoJornada.delete).not.toHaveBeenCalled();
  });

  it('remove um contrato sem fichas nem vigências', async () => {
    const { service, store, prisma } = montar();
    store.push({ id: 'livre', nome: 'Rascunho', ativo: true, padrao: false });
    await service.remover('livre');
    expect(prisma.tipoContratoJornada.delete).toHaveBeenCalledWith({
      where: { id: 'livre' },
    });
  });

  it('regras do colaborador num dia: a vigência do dia vence a ficha', async () => {
    const { service, store, prisma } = montar();
    store.push({
      ...dto6x1(),
      id: 'ficha',
      nome: 'Da ficha',
      ativo: true,
      padrao: false,
      limiteExtrasMin: 110,
    });
    store.push({
      ...dto6x1(),
      id: 'novo',
      nome: '5x2',
      ativo: true,
      padrao: false,
      limiteExtrasMin: 70,
    });
    (
      prisma as unknown as { colaborador: Record<string, jest.Mock> }
    ).colaborador.findUnique = jest.fn(() =>
      Promise.resolve({ tipoContratoJornadaId: 'ficha' }),
    );
    const dia = new Date('2026-11-23T15:00:00.000Z');

    // Sem vigência até o dia: contrato da ficha.
    expect((await service.regrasDoColaborador('c1', dia)).limiteExtrasMs).toBe(
      110 * 60_000,
    );
    // Com vigência: o contrato dela; a busca usa o dia civil.
    prisma.jornadaVigencia.findFirst.mockResolvedValueOnce({
      tipoContratoJornadaId: 'novo',
    });
    expect((await service.regrasDoColaborador('c1', dia)).limiteExtrasMs).toBe(
      70 * 60_000,
    );
    expect(prisma.jornadaVigencia.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          colaboradorId: 'c1',
          vigenteDesde: { lte: new Date('2026-11-23T00:00:00.000Z') },
        },
        orderBy: { vigenteDesde: 'desc' },
      }),
    );
  });

  it('resolvedorDeRegras: cada dia com o contrato da vigência daquele dia', async () => {
    const { service, store, prisma } = montar();
    for (const [id, limite] of [
      ['ficha', 110],
      ['44h', 70],
      ['42h', 60],
    ] as const) {
      store.push({
        ...dto6x1(),
        id,
        nome: id,
        ativo: true,
        padrao: false,
        limiteExtrasMin: limite,
      });
    }
    (
      prisma as unknown as { colaborador: Record<string, jest.Mock> }
    ).colaborador.findUnique = jest.fn(() =>
      Promise.resolve({ tipoContratoJornadaId: 'ficha' }),
    );
    prisma.jornadaVigencia.findMany.mockResolvedValueOnce([
      {
        vigenteDesde: new Date('2026-12-16T00:00:00Z'),
        tipoContratoJornadaId: '42h',
      },
      {
        vigenteDesde: new Date('2026-11-23T00:00:00Z'),
        tipoContratoJornadaId: '44h',
      },
    ]);
    const regras = await service.resolvedorDeRegras('c1');
    const limite = (iso: string) =>
      regras(new Date(`${iso}T12:00:00Z`)).limiteExtrasMs / 60_000;
    expect(limite('2026-11-22')).toBe(110);
    expect(limite('2026-11-23')).toBe(70);
    expect(limite('2026-12-15')).toBe(70);
    expect(limite('2026-12-16')).toBe(60);
  });

  it('falha ao editar um contrato inexistente', async () => {
    const { service } = montar();
    await expect(
      service.atualizar('nao-existe', { nome: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolve as regras do contrato padrão quando o id é ausente', async () => {
    const { service, store } = montar();
    store.push({
      id: 'p',
      nome: '6x1',
      ativo: true,
      padrao: true,
      cargaBaseMinPorDia: [440, 420, 420, 420, 420, 480, 480],
      diasComAdicional100: [0],
      maxTrabalhoSemIntervaloMin: 290,
      intervaloMinimoMin: 60,
      intervaloMaximoMin: 180,
      limiteExtrasMin: 110,
      riscoTac1h30Min: 90,
      riscoTac1h40Min: 100,
      intervaloMinimoEntreBatidasMin: 2,
    });
    const regras = await service.regrasDoContrato(null);
    expect(regras.cargaBaseMs(0)).toBe(440 * 60_000);
    expect(regras.temAdicional100(0)).toBe(true);
  });
});
