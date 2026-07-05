import { Prisma } from '@prisma/client';
import { IncidenciasService } from './incidencias.service';
import {
  ColaboradorIncidenciaInvalidoError,
  IncidenciaDuplicadaError,
  IncidenciaNaoEncontradaError,
} from './incidencias.errors';

/**
 * Testes unitários do `IncidenciasService`. Usam um `PrismaService` falso (em
 * memória) exercitando os efeitos colaterais (unicidade → 409, derivação do
 * horário esperado a partir da escala e auto-detecção do ponto) sem banco.
 */
describe('IncidenciasService', () => {
  interface IncidenciaFake {
    id: string;
    colaboradorId: string;
    funcionarioId: string | null;
    tipo: string;
    data: Date;
    horaSaida: string | null;
    horaEsperadaRetorno: string | null;
    horaReal: string | null;
    origem: string;
    motivo: string | null;
    observacao: string | null;
    registradoPorId: string | null;
    registradoPorNome: string | null;
  }

  interface Setup {
    fiscais?: { id: string; nome: string; usuarioId: string | null }[];
    usuarios?: { id: string; login: string }[];
    colaboradores?: {
      id: string;
      nome: string;
      matricula: string;
      usuarioId: string | null;
      funcao?: string;
      folgaDiaSemana?: number | null;
    }[];
    escalas?: {
      funcionarioId: string;
      diaSemana: number;
      intervaloMin: number;
      especial?: boolean;
    }[];
    pontos?: { fiscalId: string; status: string; data: Date; em: Date }[];
  }

  function criarServico(setup: Setup = {}): {
    service: IncidenciasService;
    store: IncidenciaFake[];
  } {
    const store: IncidenciaFake[] = [];
    let seq = 0;
    const fiscais = setup.fiscais ?? [];
    const usuarios = setup.usuarios ?? [];
    const colaboradores = setup.colaboradores ?? [];
    const escalas = setup.escalas ?? [];
    const pontos = setup.pontos ?? [];

    const dentro = (
      d: Date,
      range?: { gte?: Date; lt?: Date; lte?: Date },
    ): boolean => {
      if (!range) return true;
      if (range.gte && d.getTime() < range.gte.getTime()) return false;
      if (range.lt && d.getTime() >= range.lt.getTime()) return false;
      if (range.lte && d.getTime() > range.lte.getTime()) return false;
      return true;
    };

    const prismaFake = {
      incidenciaEscala: {
        create: ({ data }: { data: Record<string, unknown> }) => {
          const dup = store.find(
            (i) =>
              i.colaboradorId === data.colaboradorId &&
              i.tipo === data.tipo &&
              (i.data as Date).getTime() === (data.data as Date).getTime(),
          );
          if (dup) {
            return Promise.reject(
              new Prisma.PrismaClientKnownRequestError('dup', {
                code: 'P2002',
                clientVersion: 'test',
              }),
            );
          }
          const nova = {
            id: `inc${++seq}`,
            ...(data as object),
          } as IncidenciaFake;
          store.push(nova);
          return Promise.resolve(nova);
        },
        findUnique: ({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve(store.find((i) => i.id === id) ?? null),
        update: ({
          where: { id },
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const i = store.find((x) => x.id === id)!;
          Object.assign(i, data);
          return Promise.resolve(i);
        },
        delete: ({ where: { id } }: { where: { id: string } }) => {
          const idx = store.findIndex((x) => x.id === id);
          if (idx >= 0) store.splice(idx, 1);
          return Promise.resolve({});
        },
        findMany: (args?: {
          where?: {
            colaboradorId?: string;
            tipo?: string;
            data?: { gte?: Date; lt?: Date; lte?: Date };
          };
        }) => {
          let lista = [...store];
          const w = args?.where ?? {};
          if (w.colaboradorId)
            lista = lista.filter((i) => i.colaboradorId === w.colaboradorId);
          if (w.tipo) lista = lista.filter((i) => i.tipo === w.tipo);
          lista = lista.filter((i) => dentro(i.data, w.data));
          return Promise.resolve(lista);
        },
        count: (args?: {
          where?: {
            colaboradorId?: string;
            tipo?: string;
            data?: { gte?: Date; lt?: Date };
          };
        }) => {
          const w = args?.where ?? {};
          const n = store.filter(
            (i) =>
              (!w.colaboradorId || i.colaboradorId === w.colaboradorId) &&
              (!w.tipo || i.tipo === w.tipo) &&
              dentro(i.data, w.data),
          ).length;
          return Promise.resolve(n);
        },
      },
      fiscal: { findMany: () => Promise.resolve(fiscais) },
      usuario: { findMany: () => Promise.resolve(usuarios) },
      colaborador: {
        findMany: (args?: { where?: { funcao?: string } }) => {
          let lista = [...colaboradores];
          if (args?.where?.funcao)
            lista = lista.filter((c) => c.funcao === args.where!.funcao);
          return Promise.resolve(lista);
        },
        findUnique: ({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve(colaboradores.find((c) => c.id === id) ?? null),
      },
      escalaEntry: {
        findMany: (args?: {
          where?: { funcionarioId?: string; diaSemana?: number };
        }) => {
          let lista = [...escalas];
          const w = args?.where ?? {};
          if (w.funcionarioId)
            lista = lista.filter((e) => e.funcionarioId === w.funcionarioId);
          if (w.diaSemana !== undefined)
            lista = lista.filter((e) => e.diaSemana === w.diaSemana);
          return Promise.resolve(lista);
        },
      },
      registroPontoFiscal: {
        findMany: (args?: { where?: { data?: Date } }) => {
          let lista = [...pontos];
          if (args?.where?.data)
            lista = lista.filter(
              (p) => p.data.getTime() === args.where!.data!.getTime(),
            );
          return Promise.resolve(
            lista.sort((a, b) => a.em.getTime() - b.em.getTime()),
          );
        },
      },
      ausencia: { findMany: () => Promise.resolve([]) },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new IncidenciasService(prismaFake as any);
    return { service, store };
  }

  const AUTOR = { id: 'u1', nome: 'Gestor' };

  // Colaborador base para os casos que exercitam o registro (o serviço agora
  // valida a existência da ficha antes de persistir).
  const COLABORADOR_BASE = {
    id: 'c1',
    nome: 'Colaborador Um',
    matricula: 'c1',
    usuarioId: null,
    funcao: 'FISCAL',
  };

  it('registra uma incidência manual', async () => {
    const { service } = criarServico({ colaboradores: [COLABORADOR_BASE] });
    const inc = await service.registrar(
      {
        colaboradorId: 'c1',
        tipo: 'NAO_RETORNO_INTERVALO',
        data: '2026-07-03',
        horaSaida: '12:00',
      },
      AUTOR,
    );
    expect(inc.colaboradorId).toBe('c1');
    expect(inc.origem).toBe('MANUAL');
  });

  it('rejeita incidência para colaborador inexistente com 400', async () => {
    const { service } = criarServico();
    await expect(
      service.registrar(
        {
          colaboradorId: 'fantasma',
          tipo: 'NAO_RETORNO_INTERVALO',
          data: '2026-07-03',
        },
        AUTOR,
      ),
    ).rejects.toBeInstanceOf(ColaboradorIncidenciaInvalidoError);
  });

  it('rejeita incidência duplicada (colaborador+tipo+data) com 409', async () => {
    const { service } = criarServico({ colaboradores: [COLABORADOR_BASE] });
    const dto = {
      colaboradorId: 'c1',
      tipo: 'NAO_RETORNO_INTERVALO' as const,
      data: '2026-07-03',
    };
    await service.registrar(dto, AUTOR);
    await expect(service.registrar(dto, AUTOR)).rejects.toBeInstanceOf(
      IncidenciaDuplicadaError,
    );
  });

  it('rejeita registro com colaborador inexistente (400) e não persiste', async () => {
    const { service, store } = criarServico();
    await expect(
      service.registrar(
        {
          colaboradorId: 'colaborador-inexistente-zzz',
          tipo: 'NAO_RETORNO_INTERVALO',
          data: '2026-07-03',
          horaSaida: '12:00',
        },
        AUTOR,
      ),
    ).rejects.toBeInstanceOf(ColaboradorIncidenciaInvalidoError);
    // Não deve criar fila órfã (contaminaria ranking/perfil).
    expect(store).toHaveLength(0);
  });

  it('deriva o horário esperado de retorno a partir do intervalo da escala do fiscal', async () => {
    // 2026-07-03 é uma sexta-feira (getUTCDay = 5).
    const diaSemana = new Date(Date.UTC(2026, 6, 3)).getUTCDay();
    const { service } = criarServico({
      fiscais: [{ id: 'f1', nome: 'Ana Silva', usuarioId: 'u9' }],
      usuarios: [{ id: 'u9', login: 'ana' }],
      colaboradores: [
        {
          id: 'c1',
          nome: 'Ana Silva',
          matricula: 'ana',
          usuarioId: 'u9',
          funcao: 'FISCAL',
        },
      ],
      escalas: [{ funcionarioId: 'f1', diaSemana, intervaloMin: 60 }],
    });
    const inc = await service.registrar(
      {
        colaboradorId: 'c1',
        tipo: 'NAO_RETORNO_INTERVALO',
        data: '2026-07-03',
        horaSaida: '12:00',
      },
      AUTOR,
    );
    expect(inc.funcionarioId).toBe('f1');
    expect(inc.horaEsperadaRetorno).toBe('13:00');
  });

  it('remover lança 404 quando a incidência não existe', async () => {
    const { service } = criarServico();
    await expect(service.remover('inexistente')).rejects.toBeInstanceOf(
      IncidenciaNaoEncontradaError,
    );
  });

  it('sugere não retorno do intervalo detectado no ponto do fiscal', async () => {
    const dia = new Date(Date.UTC(2026, 6, 3));
    const { service } = criarServico({
      fiscais: [{ id: 'f1', nome: 'Ana Silva', usuarioId: 'u9' }],
      usuarios: [{ id: 'u9', login: 'ana' }],
      colaboradores: [
        {
          id: 'c1',
          nome: 'Ana Silva',
          matricula: 'ana',
          usuarioId: 'u9',
          funcao: 'FISCAL',
        },
      ],
      escalas: [
        { funcionarioId: 'f1', diaSemana: dia.getUTCDay(), intervaloMin: 60 },
      ],
      pontos: [
        // Disponível, entra em intervalo e NÃO volta (sem DISPONIVEL depois).
        {
          fiscalId: 'f1',
          status: 'DISPONIVEL',
          data: dia,
          em: new Date(Date.UTC(2026, 6, 3, 11, 0)),
        },
        {
          fiscalId: 'f1',
          status: 'INTERVALO',
          data: dia,
          em: new Date(Date.UTC(2026, 6, 3, 15, 0)),
        },
      ],
    });
    const sugestoes = await service.sugestoes('2026-07-03');
    expect(sugestoes).toHaveLength(1);
    expect(sugestoes[0].colaboradorId).toBe('c1');
    expect(sugestoes[0].origem).toBe('DETECTADO_PONTO');
    expect(sugestoes[0].tipo).toBe('NAO_RETORNO_INTERVALO');
  });

  it('não sugere quando já existe incidência registrada para o dia', async () => {
    const dia = new Date(Date.UTC(2026, 6, 3));
    const { service } = criarServico({
      fiscais: [{ id: 'f1', nome: 'Ana Silva', usuarioId: 'u9' }],
      usuarios: [{ id: 'u9', login: 'ana' }],
      colaboradores: [
        {
          id: 'c1',
          nome: 'Ana Silva',
          matricula: 'ana',
          usuarioId: 'u9',
          funcao: 'FISCAL',
        },
      ],
      escalas: [
        { funcionarioId: 'f1', diaSemana: dia.getUTCDay(), intervaloMin: 60 },
      ],
      pontos: [
        {
          fiscalId: 'f1',
          status: 'INTERVALO',
          data: dia,
          em: new Date(Date.UTC(2026, 6, 3, 15, 0)),
        },
      ],
    });
    await service.registrar(
      {
        colaboradorId: 'c1',
        tipo: 'NAO_RETORNO_INTERVALO',
        data: '2026-07-03',
      },
      AUTOR,
    );
    const sugestoes = await service.sugestoes('2026-07-03');
    expect(sugestoes).toHaveLength(0);
  });
});
