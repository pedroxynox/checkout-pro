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
  };
  const service = new TiposContratoService(prisma as unknown as PrismaService);
  return { service, store };
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
